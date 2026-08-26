/**
 * page-audit-combined — the calibrated audit: measurement, raster, vision, policy.
 *
 *   tsx scripts/qa/page-audit-combined.ts --package DIR [--sample 25] [--random 10]
 *
 * Runs only after the vision profile has passed its calibration gates. Three
 * layers, each doing what it is good at:
 *
 *   DETERMINISTIC PDF     line geometry, flow, furniture, residue
 *   DETERMINISTIC RASTER  furniture-region obstruction, book-relative
 *   VISION + POLICY       fill and breakage seen, interpreted by role in code
 *
 * REPORTS. NEVER FIXES.
 *
 * Three page selections, all reproducible:
 *   - every page the deterministic passes flagged
 *   - a stratified sample across every role
 *   - a small random sample from what is left, so the audit is not confined to
 *     categories somebody already thought of
 *
 * Vision is never told which group a page came from, nor whether anything is
 * expected to be wrong with it.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  PAGE_EVIDENCE_PROFILE,
  buildObservationRequest,
  validateObservations,
} from '../../src/pipeline/page-qa/vision-observations.js';
import type { PageObservations } from '../../src/pipeline/page-qa/vision-observations.js';
import { applyVisionPolicy, isDefect } from '../../src/pipeline/page-qa/vision-policy.js';
import { measureFurnitureBands, detectFurnitureObstruction } from '../../src/pipeline/page-qa/furniture-obstruction.js';
import type { PageRole, RoleAssignment } from '../../src/pipeline/page-qa/page-roles.js';
import type { ModelPage } from '../../src/pipeline/page-qa/page-model.js';
import type { Finding } from '../../src/pipeline/page-qa/deterministic-rules.js';
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
  console.error('page-audit-combined: --package <dir> is required.');
  process.exit(1);
}

const audit = JSON.parse(readFileSync(path.join(PKG, 'findings.json'), 'utf8')) as {
  pageCount: number;
  roles: RoleAssignment[];
  findings: Finding[];
};
const roleOf = new Map(audit.roles.map((r) => [r.page, r.role]));
const pagePng = (n: number): Buffer | null => {
  const p = path.join(PKG, 'pages', `p${String(n).padStart(3, '0')}.png`);
  return existsSync(p) ? readFileSync(p) : null;
};

// ── raster obstruction pass, over the whole book ────────────────────────────
const rasters = new Map<number, Buffer>();
for (let n = 1; n <= audit.pageCount; n += 1) {
  const png = pagePng(n);
  if (png) rasters.set(n, png);
}
const bands = await measureFurnitureBands(rasters);
const obstruction = detectFurnitureObstruction(bands, audit.roles, [] as ModelPage[]);

const deterministic = [...audit.findings.filter((f) => f.severity !== 'EXPECTED'), ...obstruction];
const flagged = [...new Set(deterministic.map((f) => f.page))].sort((a, b) => a - b);

// ── page selection ──────────────────────────────────────────────────────────
function stratified(target: number): number[] {
  const byRole = new Map<PageRole, number[]>();
  for (let n = 1; n <= audit.pageCount; n += 1) {
    if (flagged.includes(n)) continue;
    const r = roleOf.get(n) ?? 'BODY';
    byRole.set(r, [...(byRole.get(r) ?? []), n]);
  }
  const out: number[] = [];
  for (const role of [...byRole.keys()].sort()) {
    const list = byRole.get(role)!;
    out.push(list[Math.floor(list.length / 2)]!);
  }
  const body = (byRole.get('BODY') ?? []).filter((n) => !out.includes(n));
  const stride = Math.max(1, Math.floor(body.length / Math.max(1, target - out.length)));
  for (let i = 0; i < body.length && out.length < target; i += stride) out.push(body[i]!);
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Deterministic pseudo-random, so the "blind" sample is reproducible. */
function randomSample(exclude: Set<number>, count: number): number[] {
  let seed = 20260826;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pool: number[] = [];
  for (let n = 1; n <= audit.pageCount; n += 1) if (!exclude.has(n)) pool.push(n);
  const out: number[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]!);
  return out.sort((a, b) => a - b);
}

const strat = stratified(Number(flag('sample') ?? 25));
const blind = randomSample(new Set([...flagged, ...strat]), Number(flag('random') ?? 10));

const cache = new VisionCache(path.join(PKG, '.vision-cache'));
interface Result {
  page: number;
  group: 'flagged' | 'stratified' | 'random';
  role: PageRole;
  deterministic: string[];
  obs: PageObservations | null;
  policy: string;
  policyFindings: Array<{ code: string; classification: string; evidence: string }>;
  visionFlagged: boolean;
}
const results: Result[] = [];

console.log('');
console.log('COMBINED PAGE AUDIT — calibrated');
console.log('─'.repeat(96));
console.log(`  profile          ${PAGE_EVIDENCE_PROFILE.id}@${PAGE_EVIDENCE_PROFILE.version} (frozen)`);
console.log(`  pages            ${audit.pageCount}`);
console.log(`  deterministic    ${flagged.length} flagged: ${flagged.join(', ')}`);
console.log(`  raster pass      ${obstruction.length} furniture obstruction(s)`);
console.log(`  stratified       ${strat.length}: ${strat.join(', ')}`);
console.log(`  random blind     ${blind.length}: ${blind.join(', ')}`);
console.log('');

async function review(n: number, group: Result['group']): Promise<void> {
  const png = pagePng(n);
  const role = roleOf.get(n) ?? 'BODY';
  const mine = deterministic.filter((f) => f.page === n);
  if (!png) {
    results.push({ page: n, group, role, deterministic: mine.map((f) => f.code), obs: null, policy: 'NO_RASTER', policyFindings: [], visionFlagged: false });
    return;
  }
  const res = await callVisionProfile({
    profile: PAGE_EVIDENCE_PROFILE,
    images: [{ label: 'page under review', png }],
    cache,
    userText: buildObservationRequest(n),
    validate: validateObservations,
  });
  const policy = res.parsed ? applyVisionPolicy(res.parsed, role, mine.map((f) => f.code)) : null;
  results.push({
    page: n,
    group,
    role,
    deterministic: mine.map((f) => f.code),
    obs: res.parsed,
    policy: policy?.overall ?? 'UNPARSED',
    policyFindings: policy?.findings.map((f) => ({ code: f.code, classification: f.classification, evidence: f.evidence })) ?? [],
    visionFlagged: policy ? isDefect(policy) : false,
  });
  const tag = res.cached ? 'cache' : 'call ';
  console.log(
    `  [${tag}] p${String(n).padStart(3)} ${role.padEnd(15)} det:${(mine.map((f) => f.code).join(',') || '-').padEnd(22)} vision:${policy?.overall ?? '?'}` +
      (res.parsed ? `  [ends ${res.parsed.fill.contentEndsAtPercent}%]` : ''),
  );
}

for (const n of flagged) await review(n, 'flagged');
for (const n of strat) await review(n, 'stratified');
for (const n of blind) await review(n, 'random');

const visionOnlyNew = results.filter((r) => r.group !== 'flagged' && r.visionFlagged);
const s = cache.stats;

console.log('');
console.log('  SUMMARY');
console.log(`    deterministic flagged      ${flagged.length}`);
console.log(`    vision confirmed of those  ${results.filter((r) => r.group === 'flagged' && r.visionFlagged).length}`);
console.log(`    vision-only NEW findings   ${visionOnlyNew.length}${visionOnlyNew.length ? ` (pages ${visionOnlyNew.map((r) => r.page).join(', ')})` : ''}`);
console.log(`    pages reviewed             ${results.length}`);
console.log(`    cache hits ${s.hits}  misses ${s.misses} (paid)  failures ${s.failures}  prompt tok ${s.promptTokens}`);

writeFileSync(
  path.join(PKG, 'combined-audit.json'),
  JSON.stringify(
    { profile: `${PAGE_EVIDENCE_PROFILE.id}@${PAGE_EVIDENCE_PROFILE.version}`, flagged, stratified: strat, random: blind, obstruction, stats: s, results },
    null,
    2,
  ),
);
console.log(`\n  combined-audit.json written\n`);
