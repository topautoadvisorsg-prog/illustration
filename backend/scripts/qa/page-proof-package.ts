/**
 * page-proof-package — rasterise a book and build the proof artifacts.
 *
 *   tsx scripts/qa/page-proof-package.ts --pdf interior.pdf --out DIR [--trim 5.5x8.5]
 *
 * Produces, from one render pass:
 *
 *   pages/p###.png          every page, deterministic, for review and for Vision
 *   contact-sheet-##.png    the whole book in order, flagged pages ringed
 *   flagged/p###.png        one flagged page large, with its neighbours and the
 *                           finding written BESIDE it, never over it
 *   crops/p###.png          the region a local finding concerns
 *   findings.json           the deterministic audit, for the next stage
 *
 * Free. Chromium only, no model, no network.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildPageModel } from '../../src/pipeline/page-qa/page-model.js';
import { classifyPages } from '../../src/pipeline/page-qa/page-roles.js';
import { runDeterministicRules, statusOf } from '../../src/pipeline/page-qa/deterministic-rules.js';
import { rasterizePages } from '../../src/pipeline/page-qa/raster.js';
import { contactSheets, flaggedProof, regionCrop } from '../../src/pipeline/page-qa/proof-sheets.js';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const next = argv[argv.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : '';
};

const PDF = flag('pdf');
const OUT = flag('out');
if (!PDF || !OUT) {
  console.error('page-proof-package: --pdf <interior.pdf> --out <dir> are required.');
  process.exit(1);
}

const trimFlag = flag('trim');
const expectedTrimPt = trimFlag
  ? (() => {
      const [w, h] = trimFlag.split('x').map(Number);
      return w && h ? { widthPt: w * 72, heightPt: h * 72 } : undefined;
    })()
  : undefined;

const bytes = readFileSync(PDF);
const model = await buildPageModel(bytes);
const roles = classifyPages(model.pages, model.norms);
const findings = runDeterministicRules(model, roles, { expectedTrimPt });
const status = statusOf(findings);
const roleOf = new Map(roles.map((r) => [r.page, r]));

const flaggedPages = [...new Set(findings.filter((f) => f.severity !== 'EXPECTED').map((f) => f.page))].sort(
  (a, b) => a - b,
);

console.log('');
console.log(`PROOF PACKAGE — ${path.basename(PDF)}`);
console.log('─'.repeat(78));
console.log(`  pages            ${model.pageCount}`);
console.log(`  status           ${status.status}  (${status.hardFail} hard, ${status.review} review)`);
console.log(`  flagged pages    ${flaggedPages.length ? flaggedPages.join(', ') : 'none'}`);

// ── one render pass for the whole book ──────────────────────────────────────
const all = Array.from({ length: model.pageCount }, (_, i) => i + 1);
const t0 = Date.now();
const raster = await rasterizePages(bytes, all, { scale: 2 });
console.log(`  rasterised       ${raster.pages.size} pages at ${raster.widthPx}x${raster.heightPx}px in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

mkdirSync(path.join(OUT, 'pages'), { recursive: true });
mkdirSync(path.join(OUT, 'flagged'), { recursive: true });
mkdirSync(path.join(OUT, 'crops'), { recursive: true });

let bytesWritten = 0;
for (const [n, png] of raster.pages) {
  const p = path.join(OUT, 'pages', `p${String(n).padStart(3, '0')}.png`);
  writeFileSync(p, png);
  bytesWritten += png.length;
}
console.log(`  page images      ${(bytesWritten / 1048576).toFixed(1)} MB total`);

// ── contact sheets ──────────────────────────────────────────────────────────
const sheetPages = all.map((n) => ({ n, png: raster.pages.get(n)! }));
const sheets = await contactSheets(sheetPages, { flagged: new Set(flaggedPages) });
sheets.forEach((s, i) => writeFileSync(path.join(OUT, `contact-sheet-${String(i + 1).padStart(2, '0')}.png`), s));
console.log(`  contact sheets   ${sheets.length}`);

// ── flagged proofs and crops ────────────────────────────────────────────────
for (const n of flaggedPages) {
  const page = { n, png: raster.pages.get(n)! };
  const proof = await flaggedProof({
    page,
    before: raster.pages.has(n - 1) ? { n: n - 1, png: raster.pages.get(n - 1)! } : undefined,
    after: raster.pages.has(n + 1) ? { n: n + 1, png: raster.pages.get(n + 1)! } : undefined,
    role: roleOf.get(n)?.role ?? 'BODY',
    findings: findings.filter((f) => f.page === n && f.severity !== 'EXPECTED'),
  });
  writeFileSync(path.join(OUT, 'flagged', `p${String(n).padStart(3, '0')}.png`), proof);

  // A crop for the findings that concern a place on the page rather than the
  // whole of it. The full page stays: the crop shows detail and destroys context.
  const local = findings.find(
    (f) => f.page === n && ['LARGE_GAP', 'ORPHAN', 'WIDOW', 'STRANDED_HEADING', 'SPARSE_PAGE'].includes(f.code),
  );
  if (local) {
    const modelPage = model.pages.find((p) => p.n === n)!;
    const at = local.code === 'ORPHAN' ? 0.62 : local.code === 'WIDOW' ? 0.05 : modelPage.largestGapAt || 0.3;
    const crop = await regionCrop(
      page.png,
      { topFraction: Math.max(0, at - 0.06), heightFraction: 0.42 },
      `p${n}  ${local.code} — ${local.detail}`.slice(0, 120),
    );
    writeFileSync(path.join(OUT, 'crops', `p${String(n).padStart(3, '0')}.png`), crop);
  }
}
console.log(`  flagged proofs   ${flaggedPages.length}`);

writeFileSync(
  path.join(OUT, 'findings.json'),
  JSON.stringify({ interior: PDF, sha256: model.sha256, pageCount: model.pageCount, status, roles, findings }, null, 2),
);
console.log(`  findings.json    written`);
console.log(`  package          ${OUT}`);
console.log('');
