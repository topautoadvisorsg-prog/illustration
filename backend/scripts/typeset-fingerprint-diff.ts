/**
 * ACCEPTANCE GATE — diff a candidate render against the approved baseline.
 *
 * The font change under test is metrically NEAR-identical, not identical, so
 * "the page count is still 159" is not evidence. This checks every property the
 * approved interior is allowed to be judged on, and when something moves it
 * names the page and the block rather than reporting a number that changed.
 *
 *   yarn workspace @wildlands/backend qa:fingerprintdiff -- <baseline.json> <candidate.json>
 *
 * Exit code 0 only when the candidate is accepted.
 */
import { readFile } from 'node:fs/promises';

interface BlockProbe {
  blockId: string;
  /** Paged.js fragment index: a block split across a page break has several. */
  frag: number;
  page: number | null;
  kind: string;
  lines: [number, number, number][];
  textSha: string;
  chars: number;
}

interface Fingerprint {
  label: string;
  inputs: Record<string, unknown>;
  geometry: {
    totalPages: number;
    blankPages: number[];
    blankCount: number;
    overflowPages: number[];
    sectionCount: number;
    sectionStarts: string[];
    pageBlocks: Record<string, string[]>;
  };
  overrides: { applied: string[]; orphaned: string[] };
  probe: BlockProbe[];
}

const [baselinePath, candidatePath] = process.argv.slice(2);
if (!baselinePath || !candidatePath) {
  console.error('usage: qa:fingerprintdiff -- <baseline.json> <candidate.json>');
  process.exit(2);
}

const load = async (p: string): Promise<Fingerprint> => JSON.parse(await readFile(p, 'utf8')) as Fingerprint;
const base = await load(baselinePath);
const cand = await load(candidatePath);

const failures: string[] = [];
const notes: string[] = [];

function check(name: string, ok: boolean, detail: string): void {
  if (ok) {
    notes.push(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(`  FAIL  ${name} — ${detail}`);
  }
}

const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const list = (xs: (string | number)[], max = 12): string =>
  xs.length <= max ? xs.join(', ') : `${xs.slice(0, max).join(', ')} (+${xs.length - max} more)`;

console.log(`baseline : ${base.label}  (${baselinePath})`);
console.log(`candidate: ${cand.label}  (${candidatePath})\n`);

// The manuscript must be the same book, or nothing below means anything.
check(
  'same manuscript',
  base.inputs.workingCopySha256 === cand.inputs.workingCopySha256,
  `${String(base.inputs.workingCopySha256)} vs ${String(cand.inputs.workingCopySha256)}`,
);
// The fonts are SUPPOSED to differ. Say so, so an accidental no-op is visible.
if (base.inputs.fontCssSha256 === cand.inputs.fontCssSha256) {
  notes.push(`  NOTE  font CSS is IDENTICAL to the baseline — this run tests nothing`);
} else {
  notes.push(
    `  NOTE  font CSS differs as intended: ${String(base.inputs.fontCssBytes)}B -> ${String(cand.inputs.fontCssBytes)}B`,
  );
}

check('159 pages', cand.geometry.totalPages === 159, `${cand.geometry.totalPages} pages`);
check('page count unchanged', base.geometry.totalPages === cand.geometry.totalPages, `${base.geometry.totalPages} -> ${cand.geometry.totalPages}`);
check('10 blanks', cand.geometry.blankCount === 10, `${cand.geometry.blankCount} blanks`);
check(
  'blank positions unchanged',
  eq(base.geometry.blankPages, cand.geometry.blankPages),
  `${list(base.geometry.blankPages)} -> ${list(cand.geometry.blankPages)}`,
);
check('0 overflow', cand.geometry.overflowPages.length === 0, `overflow on ${list(cand.geometry.overflowPages)}`);
check('28/28 sections', cand.geometry.sectionCount === 28, `${cand.geometry.sectionCount} sections`);

const movedSections = base.geometry.sectionStarts
  .map((s, i) => ({ base: s, cand: cand.geometry.sectionStarts[i] }))
  .filter((p) => p.base !== p.cand);
check(
  'section starts unchanged',
  movedSections.length === 0,
  movedSections.length ? movedSections.map((m) => `"${m.base}" -> "${m.cand}"`).join('; ') : 'all 28 identical',
);

check(
  'override resolution unchanged',
  eq(base.overrides, cand.overrides),
  `applied ${list(base.overrides.applied)} / orphaned ${list(base.overrides.orphaned)} -> applied ${list(
    cand.overrides.applied,
  )} / orphaned ${list(cand.overrides.orphaned)}`,
);
check(
  'no orphaned overrides',
  cand.overrides.orphaned.length === 0,
  cand.overrides.orphaned.length ? `orphaned: ${list(cand.overrides.orphaned)}` : 'none',
);

// ── Text integrity ─────────────────────────────────────────────────────────
// Block ids in reading order catch reordering; the multiset catches loss and
// duplication; the per-block text hash catches content changing in place.
const baseIds = base.probe.map((b) => `${b.blockId}#${b.frag}`);
const candIds = cand.probe.map((b) => `${b.blockId}#${b.frag}`);
check('block order unchanged', eq(baseIds, candIds), `${baseIds.length} -> ${candIds.length} blocks`);

// Keyed by block AND fragment. A block that straddles a page break appears
// once per page under the same id, so keying on the id alone silently compares
// one run's first fragment against the other's second and reports a
// repagination that did not happen.
const key = (b: BlockProbe): string => `${b.blockId}#${b.frag}`;
const baseById = new Map(base.probe.map((b) => [key(b), b]));
const candById = new Map(cand.probe.map((b) => [key(b), b]));
const lost = baseIds.filter((id) => !candById.has(id));
const gained = candIds.filter((id) => !baseById.has(id));
check('no blocks lost', lost.length === 0, lost.length ? list(lost) : 'none');
check('no blocks gained', gained.length === 0, gained.length ? list(gained) : 'none');

const textChanged = base.probe.filter((b) => {
  const c = candById.get(key(b));
  return c && (c.textSha !== b.textSha || c.chars !== b.chars);
});
check(
  'no text lost, duplicated or reordered',
  textChanged.length === 0,
  textChanged.length ? textChanged.map((b) => `${b.blockId} (p${b.page})`).join(', ') : 'every block hashes identically',
);

// ── Block -> page mapping ──────────────────────────────────────────────────
const movedBlocks = base.probe
  .map((b) => ({ b, c: candById.get(key(b)) }))
  .filter((p) => p.c && p.c.page !== p.b.page);
check(
  'stable block -> page mapping unchanged',
  movedBlocks.length === 0,
  movedBlocks.length
    ? movedBlocks.map((m) => `${key(m.b)}: p${m.b.page} -> p${m.c!.page}`).join('; ')
    : `${base.probe.length} blocks on the same pages`,
);
check('pageBlocks unchanged', eq(base.geometry.pageBlocks, cand.geometry.pageBlocks), 'measured page composition');

// ── Line wrapping ──────────────────────────────────────────────────────────
// The sensitive one. A different line COUNT is a wrap change outright; equal
// counts with a moved line box mean the same words broke at different points.
const rewrapped: { block: BlockProbe; cand: BlockProbe; why: string }[] = [];
for (const b of base.probe) {
  const c = candById.get(key(b));
  if (!c) continue;
  if (b.lines.length !== c.lines.length) {
    rewrapped.push({ block: b, cand: c, why: `${b.lines.length} lines -> ${c.lines.length}` });
    continue;
  }
  for (let i = 0; i < b.lines.length; i++) {
    const [bt, bl, bw] = b.lines[i];
    const [ct, cl, cw] = c.lines[i];
    // A line whose box moved by more than a quarter point is a different line,
    // not a rounding artifact. Sub-pixel width drift from a metric change that
    // did NOT alter the break is expected and must not be reported as a defect.
    if (Math.abs(bt - ct) > 0.25 || Math.abs(bl - cl) > 0.25 || Math.abs(bw - cw) > 1.0) {
      rewrapped.push({
        block: b,
        cand: c,
        why: `line ${i + 1}: top ${bt}->${ct} left ${bl}->${cl} width ${bw}->${cw}`,
      });
      break;
    }
  }
}
check(
  'no block wraps differently',
  rewrapped.length === 0,
  rewrapped.length
    ? `${rewrapped.length} block(s) changed`
    : `${base.probe.reduce((n, b) => n + b.lines.length, 0)} line boxes identical`,
);

console.log(notes.join('\n'));
if (failures.length) console.log(`\n${failures.join('\n')}`);

if (rewrapped.length) {
  console.log(`\nBLOCKS THAT WRAPPED DIFFERENTLY (${rewrapped.length})\n`);
  console.log(`  ${'page'.padEnd(6)} ${'block id'.padEnd(30)} ${'kind'.padEnd(24)} what changed`);
  for (const r of rewrapped.slice(0, 60)) {
    console.log(
      `  ${String(`p${r.block.page}`).padEnd(6)} ${key(r.block).padEnd(30)} ${r.block.kind.slice(0, 24).padEnd(24)} ${r.why}`,
    );
  }
  if (rewrapped.length > 60) console.log(`  … and ${rewrapped.length - 60} more`);
  const byPage = [...new Set(rewrapped.map((r) => r.block.page))].sort((a, b) => (a ?? 0) - (b ?? 0));
  console.log(`\n  affected pages: ${list(byPage as number[], 40)}`);
}

const accepted = failures.length === 0;
console.log(`\n${accepted ? 'ACCEPT' : 'REJECT'} — ${failures.length} gate(s) failed, ${notes.length} checked`);
process.exit(accepted ? 0 : 1);
