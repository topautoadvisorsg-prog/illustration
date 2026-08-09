/**
 * DEEP RENDER FINGERPRINT — capture everything a font change could move.
 *
 * `typeset-fingerprint.ts` answers "does this environment agree about the page
 * count". This answers a harder question: if we swap the interior faces for
 * metrically-near-identical ones, did ANYTHING move? A page count is far too
 * coarse for that. A paragraph can wrap differently, a list item can gain a
 * line, an alert panel can shed one, and the book still reports 159 pages.
 *
 * So this captures, per addressable block: which page it landed on, its line
 * BOXES, a hash of its text, and its length. Diff two of these with
 * `typeset-fingerprint-diff.ts` and the answer names the exact page and block.
 *
 *   yarn workspace @wildlands/backend qa:deepfingerprint -- <out.json>
 *
 * Defaults to writing qa/fingerprint-<label>.json where label comes from
 * WL_FINGERPRINT_LABEL, so a baseline and a candidate do not overwrite.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });

const MANUSCRIPT =
  process.env.WL_QA_MANUSCRIPT ?? 'C:/Users/jovan/Downloads/puberty boy book/export/NO-ONE-TOLD-ME-THAT_FINAL.md';

const { sanitizeManuscript } = await import('../src/pipeline/stage-1-ingestion/sanitize-manuscript.js');
const { renderTypesetBook } = await import('../src/pipeline/typeset/render-typeset.js');
const { resolveTypesetLayoutStandard } = await import('../src/pipeline/typeset/layout-standards/registry.js');
const { getProductionProfile } = await import('../src/pipeline/production-profiles/registry.js');
const { bundledFontCss } = await import('../src/pipeline/typeset/font-assets.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

const label = process.env.WL_FINGERPRINT_LABEL ?? 'run';
const outPath = process.argv[2] ?? path.join(ROOT, 'qa', `fingerprint-${label}.json`);

const raw = await readFile(MANUSCRIPT, 'utf8');
const markdown = sanitizeManuscript(raw);

const profile = getProductionProfile('bw-educational-nonfiction');
const standard = resolveTypesetLayoutStandard(profile.typesetLayoutStandardId!);

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  productionProfileId: profile.id,
  typesetLayoutStandardId: standard.id,
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  typography: {
    bodyPt: 12,
    lineHeight: 1.3,
    headingFont: standard.type.headingFont,
    bodyFont: standard.type.bodyFont,
  },
  // Same seam shoot-page.ts uses. Without this the fingerprint renders a book
  // with NO local overrides applied, so "override resolution unchanged" would
  // be comparing two empty sets and proving nothing about p152.
  layoutOverrides: process.env.WL_OVERRIDES ? JSON.parse(process.env.WL_OVERRIDES) : {},
});

// Hash the font payloads actually inlined. This is the input under test, and a
// fingerprint that did not record it could not tell you which fonts produced it.
const fonts = bundledFontCss([standard.type.headingFont, standard.type.bodyFont]);

console.log(`rendering ${label} …`);
const started = Date.now();
const { report, overrides, probe, pdf } = await renderTypesetBook({
  markdown,
  config,
  chaptersStartRecto: standard.chaptersStartRecto,
  layoutStandard: standard,
  deepProbe: true,
});
console.log(`rendered in ${((Date.now() - started) / 1000).toFixed(1)}s`);

/**
 * What the PDF actually says about its fonts.
 *
 * Read from the object graph, not a /BaseFont byte grep: Type3 fonts carry no
 * BaseFont at all, so a text search reports "no fonts" on exactly the file that
 * is broken. A print RIP wants Type0 with an embedded font program; Type3 is
 * glyph-drawing procedures and is what this whole exercise exists to remove.
 */
async function pdfFonts(bytes: Buffer): Promise<{ subtype: string; baseFont: string; embedded: boolean }[]> {
  const { PDFDocument, PDFName, PDFDict } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const seen = new Map<string, { subtype: string; baseFont: string; embedded: boolean }>();
  for (const page of doc.getPages()) {
    const fontDict = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (!fontDict) continue;
    for (const [, ref] of fontDict.entries()) {
      const f = doc.context.lookup(ref) as InstanceType<typeof PDFDict>;
      if (!f?.get) continue;
      const baseFont = String(f.get(PDFName.of('BaseFont')) ?? '(none)').replace(/^\//, '');
      const subtype = String(f.get(PDFName.of('Subtype')) ?? '?').replace(/^\//, '');
      let desc = f.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      if (!desc) {
        const kids = f.get(PDFName.of('DescendantFonts'));
        const arr = kids ? (doc.context.lookup(kids) as { get?: (i: number) => unknown }) : null;
        const kid = arr?.get ? (doc.context.lookup(arr.get(0) as never) as InstanceType<typeof PDFDict>) : null;
        desc = kid?.lookupMaybe?.(PDFName.of('FontDescriptor'), PDFDict) ?? undefined;
      }
      const embedded =
        !!desc && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => desc!.get(PDFName.of(k)) !== undefined);
      // Subsets are tagged AAAAAA+Name per page; collapse to the real face.
      const face = baseFont.replace(/^[A-Z]{6}\+/, '');
      seen.set(`${subtype}:${face}:${embedded}`, { subtype, baseFont: face, embedded });
    }
  }
  return [...seen.values()].sort((a, b) => a.baseFont.localeCompare(b.baseFont));
}

const fontsInPdf = await pdfFonts(pdf);

const out = {
  label,
  capturedAt: new Date().toISOString(),
  fontsInPdf,
  inputs: {
    manuscriptSha256: sha(raw).slice(0, 16),
    workingCopySha256: sha(markdown).slice(0, 16),
    productionProfileId: profile.id,
    layoutStandardId: standard.id,
    trim: `${config.trimSize.widthIn}x${config.trimSize.heightIn} bleed ${config.trimSize.bleedIn}`,
    type: `${config.typography.headingFont} + ${config.typography.bodyFont} @ ${report.bodyPt}pt / ${report.lineHeight}`,
    fontCssSha256: sha(fonts.css).slice(0, 16),
    fontCssBytes: fonts.css.length,
    fontsBundled: fonts.bundled,
    fontsSystemInstalled: fonts.systemInstalled,
    fontsMissing: fonts.missing,
    node: process.version,
    layoutOverrides: process.env.WL_OVERRIDES ?? '(none)',
  },
  geometry: {
    totalPages: report.totalPages,
    blankPages: report.blankPages,
    blankCount: report.blankPages.length,
    overflowPages: report.verticalOverflowPages,
    sectionCount: report.sectionStarts.length,
    sectionStarts: report.sectionStarts.map((s) => `${s.page}:${s.title}`),
    pageBlocks: report.pageBlocks,
  },
  overrides: {
    applied: overrides.applied,
    orphaned: overrides.orphaned,
  },
  pdfBytes: pdf.length,
  probe: probe ?? [],
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(out, null, 1)}\n`);

console.log(
  `\nFINGERPRINT ${out.geometry.totalPages}p/${out.geometry.blankCount}b/${out.geometry.overflowPages.length}o/${out.geometry.sectionCount}s ` +
    `sha=${sha(out.geometry.sectionStarts.join('|')).slice(0, 12)}`,
);
console.log(`blocks probed: ${out.probe.length}   lines: ${out.probe.reduce((n, b) => n + b.lines.length, 0)}`);
console.log('\nFONTS IN THE PDF');
for (const f of fontsInPdf) console.log(`  ${f.subtype.padEnd(8)} ${f.baseFont.padEnd(30)} embedded=${f.embedded}`);
const type3 = fontsInPdf.filter((f) => f.subtype === 'Type3');
const unembedded = fontsInPdf.filter((f) => f.subtype !== 'Type3' && !f.embedded);
console.log(
  `  -> ${type3.length} Type3 reference(s), ${unembedded.length} unembedded face(s)` +
    `${type3.length || unembedded.length ? '  << the interior is NOT print-ready' : '  << every face is an embedded font program'}`,
);
console.log(`overrides applied: ${overrides.applied.length}   orphaned: ${overrides.orphaned.length}`);
console.log(`written to ${outPath}`);
process.exit(0);
