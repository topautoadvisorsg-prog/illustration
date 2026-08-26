/**
 * score-calibration — score the labelled set by LAYER.
 *
 *   tsx scripts/qa/score-calibration.ts --set DIR --split TUNING|HOLDOUT|ALL
 *
 * Three columns, because it matters which layer earns each result:
 *
 *   DETERMINISTIC   raster and PDF measurement, free, no model
 *   VISION          the frozen page-evidence profile plus its policy
 *   COMBINED        either of them
 *
 * A combined 7/7 that rests on deterministic catching what the model cannot is a
 * better result than a model that appears to have improved, and it should be
 * reported as exactly that.
 *
 * Vision observations come from cache wherever they exist: the profile is frozen
 * and its answers do not change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  PAGE_EVIDENCE_PROFILE,
  buildObservationRequest,
  validateObservations,
} from '../../src/pipeline/page-qa/vision-observations.js';
import { applyVisionPolicy, isDefect } from '../../src/pipeline/page-qa/vision-policy.js';
import { measureFurnitureBands, detectFurnitureObstruction } from '../../src/pipeline/page-qa/furniture-obstruction.js';
import type { PageRole, RoleAssignment } from '../../src/pipeline/page-qa/page-roles.js';
import type { ModelPage } from '../../src/pipeline/page-qa/page-model.js';
import { VisionCache, callVisionProfile } from '../../src/services/vision/vision-core.js';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const next = argv[argv.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : '';
};
const SET = flag('set') ?? '.page-qa/calibration';
const SPLIT = (flag('split') ?? 'ALL').toUpperCase();

interface Sample {
  id: string;
  file: string;
  book: string;
  label: 'GOOD' | 'BAD';
  role: PageRole;
  defect?: string;
  split: 'TUNING' | 'HOLDOUT';
}
const { samples } = JSON.parse(readFileSync(path.join(SET, 'labels.json'), 'utf8')) as { samples: Sample[] };
const chosen = SPLIT === 'ALL' ? samples : samples.filter((s) => s.split === SPLIT);

/**
 * DETERMINISTIC PASS, PER BOOK.
 *
 * Every sample of a book is measured together, whatever split it belongs to,
 * because the book norm is a property of the book and not of the experiment.
 * Labels are never consulted: the peer median simply does not care.
 */
const deterministicHits = new Map<string, { severity: string; detail: string }>();
const books = [...new Set(samples.map((s) => s.book))];
for (const book of books) {
  const inBook = samples.filter((s) => s.book === book);
  const index = new Map<number, Sample>();
  const rasters = new Map<number, Buffer>();
  inBook.forEach((s, i) => {
    index.set(i + 1, s);
    rasters.set(i + 1, readFileSync(path.join(SET, s.file)));
  });

  const stats = await measureFurnitureBands(rasters);
  const roles: RoleAssignment[] = [...index.entries()].map(([n, s]) => ({
    page: n,
    role: s.role,
    evidence: 'from the calibration label file',
    minDensity: null,
    expectsFurniture: s.role !== 'PARITY_BLANK' && s.role !== 'PART_DIVIDER',
  }));
  // No PDF text layer for a standalone raster; the detector tolerates that.
  const pages: ModelPage[] = [];

  for (const f of detectFurnitureObstruction(stats, roles, pages)) {
    const s = index.get(f.page)!;
    deterministicHits.set(s.id, { severity: f.severity, detail: f.detail });
  }
}

// ── VISION PASS ─────────────────────────────────────────────────────────────
const cache = new VisionCache(path.join(SET, '.vision-cache'));
interface Row {
  id: string;
  book: string;
  role: PageRole;
  label: string;
  det: boolean;
  vis: boolean;
  combined: boolean;
  outcome: string;
  detail: string;
}
const rows: Row[] = [];

for (const s of chosen) {
  const res = await callVisionProfile({
    profile: PAGE_EVIDENCE_PROFILE,
    images: [{ label: 'page under review', png: readFileSync(path.join(SET, s.file)) }],
    cache,
    userText: buildObservationRequest(1),
    validate: validateObservations,
  });
  const vis = res.parsed ? isDefect(applyVisionPolicy(res.parsed, s.role)) : false;
  const det = deterministicHits.has(s.id);
  const combined = det || vis;
  const shouldFlag = s.label === 'BAD';
  const outcome = combined
    ? shouldFlag
      ? 'TRUE_POSITIVE'
      : 'FALSE_POSITIVE'
    : shouldFlag
      ? 'FALSE_NEGATIVE'
      : 'TRUE_NEGATIVE';
  rows.push({
    id: s.id,
    book: s.book,
    role: s.role,
    label: s.label,
    det,
    vis,
    combined,
    outcome,
    detail: deterministicHits.get(s.id)?.detail ?? '',
  });
}

console.log('');
console.log(`CALIBRATION BY LAYER — ${SPLIT}`);
console.log(`  vision ${PAGE_EVIDENCE_PROFILE.id}@${PAGE_EVIDENCE_PROFILE.version} (frozen)   samples ${rows.length}`);
console.log('─'.repeat(104));
console.log(`  ${'sample'.padEnd(28)} ${'book'.padEnd(15)} ${'truth'.padEnd(6)} det  vis  comb  outcome`);
console.log('─'.repeat(104));
for (const r of rows) {
  const mark = r.outcome.startsWith('TRUE') ? '    ' : 'MISS';
  console.log(
    `  ${r.id.padEnd(28)} ${r.book.padEnd(15)} ${r.label.padEnd(6)} ${yn(r.det)}  ${yn(r.vis)}  ${yn(r.combined)}   ${mark} ${r.outcome}`,
  );
}

const bad = rows.filter((r) => r.label === 'BAD');
const good = rows.filter((r) => r.label === 'GOOD');
const caught = (pick: (r: Row) => boolean) => bad.filter(pick).length;
const falsePos = (pick: (r: Row) => boolean) => good.filter(pick).length;

console.log('─'.repeat(104));
console.log(`  RECALL on ${bad.length} known-bad`);
console.log(`    deterministic only   ${caught((r) => r.det)}/${bad.length}`);
console.log(`    vision only          ${caught((r) => r.vis)}/${bad.length}`);
console.log(`    COMBINED             ${caught((r) => r.combined)}/${bad.length}`);
console.log(`  FALSE POSITIVES on ${good.length} known-good`);
console.log(`    deterministic only   ${falsePos((r) => r.det)}/${good.length}`);
console.log(`    vision only          ${falsePos((r) => r.vis)}/${good.length}`);
console.log(`    COMBINED             ${falsePos((r) => r.combined)}/${good.length}`);

const banded = rows.filter((r) => r.book === 'banded-design');
if (banded.length) {
  const clean = banded.filter((r) => !r.combined).length;
  console.log('');
  console.log(`  INTENTIONAL DESIGN CONTROL: ${clean}/${banded.length} banded pages correctly left clean`);
  console.log('  (proves the rule is "unexpected obstruction", not "dark")');
}
const control = rows.find((r) => r.id === 'bad-clipped-top');
if (control) {
  console.log(`  OBSTRUCTION CONTROL bad-clipped-top: ${control.combined ? 'CAUGHT' : 'MISSED'}` +
    ` (deterministic ${yn(control.det)}, vision ${yn(control.vis)})`);
  if (control.detail) console.log(`    ${control.detail.slice(0, 96)}`);
}

const s = cache.stats;
console.log('');
console.log(`  cache hits ${s.hits}  misses ${s.misses} (paid)  failures ${s.failures}`);
writeFileSync(path.join(SET, `layered-${SPLIT.toLowerCase()}.json`), JSON.stringify({ split: SPLIT, rows }, null, 2));
console.log(`  layered-${SPLIT.toLowerCase()}.json written\n`);

function yn(b: boolean): string {
  return b ? ' Y ' : ' . ';
}
