/**
 * page-vision-audit — the visual half of page QA.
 *
 *   tsx scripts/qa/page-vision-audit.ts --package DIR [--sample 25] [--vision full]
 *
 * Reads the proof package produced by `page-proof-package.ts` and asks the
 * page-layout vision profile about:
 *
 *   1. every page the deterministic pass flagged, with its neighbours, and
 *   2. a reproducible sample of pages it did NOT flag.
 *
 * THE SAMPLE IS NOT OPTIONAL. Reviewing only flagged pages measures false
 * positives and nothing else; a QA system that never looks at what it called
 * clean cannot know what it missed. The sample is stratified by structural role
 * and strided across the whole book, so it is not twenty pages of one chapter.
 *
 * The model is NOT told which pages are the sample.
 *
 * PAID. Cached by image hash + profile version + model, so a re-run over an
 * unchanged book costs nothing. Every call is one shot: no retry storms.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  PAGE_LAYOUT_PROFILE,
  buildPageUserText,
  validatePageReview,
} from '../../src/pipeline/page-qa/vision-profile.js';
import type { VisionPageReview } from '../../src/pipeline/page-qa/vision-profile.js';
import { VisionCache, callVisionProfile } from '../../src/services/vision/vision-core.js';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const next = argv[argv.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : '';
};

const PKG = flag('package');
if (!PKG) {
  console.error('page-vision-audit: --package <dir from page-proof-package> is required.');
  process.exit(1);
}

const audit = JSON.parse(readFileSync(path.join(PKG, 'findings.json'), 'utf8')) as {
  pageCount: number;
  roles: Array<{ page: number; role: string; evidence: string }>;
  findings: Array<{ page: number; code: string; severity: string; detail: string; evidence?: Record<string, unknown> }>;
};

const roleOf = new Map(audit.roles.map((r) => [r.page, r.role]));
const pagePng = (n: number): Buffer | null => {
  const p = path.join(PKG, 'pages', `p${String(n).padStart(3, '0')}.png`);
  return existsSync(p) ? readFileSync(p) : null;
};

const flagged = [...new Set(audit.findings.filter((f) => f.severity !== 'EXPECTED').map((f) => f.page))].sort(
  (a, b) => a - b,
);

/**
 * REPRODUCIBLE, STRATIFIED SAMPLING.
 *
 * Group the unflagged pages by role, then take an even stride through each
 * group. Deterministic: the same book always yields the same sample, so a
 * re-audit is comparable and the cache actually hits.
 */
function sampleClean(target: number): number[] {
  const byRole = new Map<string, number[]>();
  for (let n = 1; n <= audit.pageCount; n += 1) {
    if (flagged.includes(n)) continue;
    const role = roleOf.get(n) ?? 'BODY';
    byRole.set(role, [...(byRole.get(role) ?? []), n]);
  }
  const roles = [...byRole.keys()].sort();
  const out: number[] = [];
  // At least one of every role that exists, then fill from the largest groups.
  for (const role of roles) {
    const list = byRole.get(role)!;
    out.push(list[Math.floor(list.length / 2)]!);
  }
  const remaining = target - out.length;
  if (remaining > 0) {
    const body = (byRole.get('BODY') ?? []).filter((n) => !out.includes(n));
    const stride = Math.max(1, Math.floor(body.length / remaining));
    for (let i = 0; i < body.length && out.length < target; i += stride) out.push(body[i]!);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

const sampleSize = Number(flag('sample') ?? 25);
const full = flag('vision') === 'full';
const sample = full
  ? Array.from({ length: audit.pageCount }, (_, i) => i + 1).filter((n) => !flagged.includes(n))
  : sampleClean(sampleSize);

const cache = new VisionCache(path.join(PKG, '.vision-cache'));
const results: Array<{ page: number; group: 'flagged' | 'sample'; review: VisionPageReview | null; error?: string }> = [];

console.log('');
console.log('PAGE LAYOUT VISION AUDIT');
console.log('─'.repeat(78));
console.log(`  package          ${PKG}`);
console.log(`  profile          ${PAGE_LAYOUT_PROFILE.id}@${PAGE_LAYOUT_PROFILE.version}`);
console.log(`  flagged pages    ${flagged.length}  (${flagged.join(', ')})`);
console.log(`  sampled clean    ${sample.length}  (${sample.join(', ')})`);
console.log('');

async function review(n: number, group: 'flagged' | 'sample'): Promise<void> {
  const png = pagePng(n);
  if (!png) {
    results.push({ page: n, group, review: null, error: 'no raster' });
    return;
  }
  const mine = audit.findings.filter((f) => f.page === n && f.severity !== 'EXPECTED');
  // Neighbours only where composition needs a spread: a flagged page.
  const withNeighbours = group === 'flagged';
  const images = [{ label: 'page under review', png }];
  if (withNeighbours) {
    const before = pagePng(n - 1);
    const after = pagePng(n + 1);
    if (before) images.push({ label: 'preceding page, context only', png: before });
    if (after) images.push({ label: 'following page, context only', png: after });
  }

  const measurements: string[] = [];
  for (const f of mine) {
    if (f.evidence) {
      for (const [k, v] of Object.entries(f.evidence)) measurements.push(`${k}: ${String(v)}`);
    }
  }

  const res = await callVisionProfile({
    profile: PAGE_LAYOUT_PROFILE,
    images,
    cache,
    cacheDiscriminator: `${roleOf.get(n)}|${mine.map((f) => f.code).join(',')}`,
    userText: buildPageUserText({
      page: n,
      role: roleOf.get(n) ?? 'BODY',
      measurements,
      deterministicFindings: mine.map((f) => ({ code: f.code, detail: f.detail })),
      hasNeighbours: withNeighbours,
    }),
    validate: validatePageReview,
  });

  results.push({ page: n, group, review: res.parsed, error: res.error });
  const mark = res.cached ? 'cache' : 'call ';
  const verdicts = res.parsed
    ? res.parsed.findings.map((f) => `${f.issueCode}=${f.verdict}`).join(' ') || 'no findings'
    : `UNPARSED${res.error ? ` (${res.error.slice(0, 60)})` : ''}`;
  console.log(`  [${mark}] p${String(n).padStart(3)}  ${(res.parsed?.overallComposition ?? '?').padEnd(10)} ${verdicts}`);
}

for (const n of flagged) await review(n, 'flagged');
for (const n of sample) await review(n, 'sample');

const s = cache.stats;
console.log('');
console.log('  COST AND CACHE');
console.log(`    pages reviewed   ${results.length}`);
console.log(`    cache hits       ${s.hits}`);
console.log(`    cache misses     ${s.misses}  (paid)`);
console.log(`    failures         ${s.failures}`);
console.log(`    prompt tokens    ${s.promptTokens}`);
console.log(`    completion tok   ${s.completionTokens}`);

writeFileSync(
  path.join(PKG, 'vision.json'),
  JSON.stringify(
    { profile: `${PAGE_LAYOUT_PROFILE.id}@${PAGE_LAYOUT_PROFILE.version}`, stats: s, flagged, sample, results },
    null,
    2,
  ),
);
console.log(`\n  vision.json      ${path.join(PKG, 'vision.json')}\n`);
