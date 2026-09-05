/**
 * page-audit — deterministic whole-book page and layout QA.
 *
 *   tsx scripts/qa/page-audit.ts --pdf interior.pdf [--trim 5.5x8.5] [--json out.json] [--roles]
 *
 * Reads a finished interior as DATA: text runs, coordinates, font sizes. Nothing
 * is re-rendered and nothing is OCR'd, because the structural information is
 * already in the file and reading it back off a picture would be worse.
 *
 * REPORTS. NEVER FIXES. Findings name the Phase 2 correction type that would
 * address them; creating that correction is a separate, human decision.
 *
 * Free: no model, no network, no database.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildPageModel } from '../../src/pipeline/page-qa/page-model.js';
import { classifyPages } from '../../src/pipeline/page-qa/page-roles.js';
import type { PageRole } from '../../src/pipeline/page-qa/page-roles.js';
import { runDeterministicRules, statusOf } from '../../src/pipeline/page-qa/deterministic-rules.js';
import type { Finding } from '../../src/pipeline/page-qa/deterministic-rules.js';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const next = argv[argv.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : '';
};
const has = (n: string) => argv.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));

const PDF = flag('pdf');
if (!PDF) {
  console.error('page-audit: --pdf <interior.pdf> is required.');
  process.exit(1);
}

const trimFlag = flag('trim');
const expectedTrimPt = trimFlag
  ? (() => {
      const [w, h] = trimFlag.split('x').map(Number);
      return w && h ? { widthPt: w * 72, heightPt: h * 72 } : undefined;
    })()
  : undefined;

const model = await buildPageModel(readFileSync(PDF));
const roles = classifyPages(model.pages, model.norms);
const findings = runDeterministicRules(model, roles, { expectedTrimPt });
const status = statusOf(findings);

const L = (k: string, v: string) => `  ${k.padEnd(22)}${v}`;
console.log('');
console.log('PAGE / LAYOUT QA');
console.log('─'.repeat(96));
console.log(L('interior', PDF));
console.log(L('sha256', model.sha256));
console.log(L('pages', String(model.pageCount)));
console.log(
  L('typography', `${model.norms.bodySizePt.toFixed(2)}pt on ${model.norms.leadingPt.toFixed(1)}pt, measure ${(model.norms.measurePt / 72).toFixed(3)}in`),
);
console.log(L('', '(inferred from this book, not assumed)'));

const byRole = new Map<PageRole, number>();
for (const r of roles) byRole.set(r.role, (byRole.get(r.role) ?? 0) + 1);
console.log('');
console.log('  PAGE ROLES');
for (const [role, n] of [...byRole.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${role.padEnd(16)} ${String(n).padStart(4)}`);
}

if (has('roles')) {
  console.log('');
  console.log('  ROLE PER PAGE');
  for (const r of roles) console.log(`    p${String(r.page).padStart(4)}  ${r.role.padEnd(16)} ${r.evidence}`);
}

const hard = findings.filter((f) => f.severity === 'HARD_FAIL');
const review = findings.filter((f) => f.severity === 'REVIEW');
const expected = findings.filter((f) => f.severity === 'EXPECTED');

const section = (title: string, list: Finding[], limit = 400) => {
  if (!list.length) return;
  console.log('');
  console.log(`  ${title} — ${list.length}`);
  console.log('  ' + '─'.repeat(94));
  for (const f of list.slice(0, limit)) {
    console.log(`    p${String(f.page).padStart(4)}  ${f.code.padEnd(26)} ${f.detail}`);
    if (f.suggests) console.log(`             ${' '.repeat(26)} suggested correction: ${f.suggests}`);
  }
  if (list.length > limit) console.log(`    … and ${list.length - limit} more (use --json for the full set)`);
};

section('HARD FAIL — cannot ship', hard);
section('REVIEW — a person should look', review);

console.log('');
console.log('  BY CODE');
const codes = new Map<string, number>();
for (const f of findings) if (f.severity !== 'EXPECTED') codes.set(f.code, (codes.get(f.code) ?? 0) + 1);
for (const [code, n] of [...codes.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${code.padEnd(28)} ${String(n).padStart(4)}`);
}

console.log('');
console.log('─'.repeat(96));
console.log(L('hard failures', String(status.hardFail)));
console.log(L('review findings', String(status.review)));
console.log(L('expected structures', String(expected.length)));
console.log(L('STATUS', status.status));
console.log('');
console.log('  This report changes nothing. Findings name the Phase 2 correction type that');
console.log('  would address them; creating a correction is a separate, human decision.');
console.log('');

const jsonOut = flag('json');
if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        interior: PDF,
        sha256: model.sha256,
        pageCount: model.pageCount,
        norms: model.norms,
        status,
        roles,
        findings,
        pages: model.pages.map((p) => ({
          n: p.n,
          widthPt: p.widthPt,
          heightPt: p.heightPt,
          lines: p.lines.length,
          bodyLines: p.body.length,
          furniture: p.furniture.length,
          density: Number(p.density.toFixed(4)),
          // `density` measures packing WITHIN the occupied span and reports 1.0
          // for two lines on an empty leaf. `textFill` measures the leaf, and is
          // what STRANDED_CONTINUATION judges on — so it has to be in the dump
          // a person uses to argue with a finding.
          textFill: Number(p.textFill.toFixed(4)),
          imageAreaFraction: Number(p.imageAreaFraction.toFixed(4)),
          images: p.images.length,
          largestGapPt: Number(p.largestGapPt.toFixed(2)),
          textBox: p.textBox,
          blank: p.blank,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`  measurements: ${jsonOut}\n`);
}

// A HARD FAIL must not look like a clean run to a build script.
process.exit(status.status === 'BLOCKED' ? 2 : 0);
