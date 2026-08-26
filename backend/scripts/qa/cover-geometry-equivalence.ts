/**
 * COVER GEOMETRY EQUIVALENCE HARNESS — Phase 1A.
 *
 * Phase 1A moves the cover-geometry core out of the legacy Track A renderer and
 * into `publishing-standard/cover-dimensions.ts`. That move must change NOTHING.
 * This captures every geometry figure the platform derives, for every shipped
 * reference configuration, so before and after can be compared byte for byte.
 *
 * It deliberately reads the numbers through the SAME public entry points the
 * pipeline uses — `computeCoverDimensions` and `resolveCoverGeometry` — rather
 * than recomputing them, because the question is whether the callers still get
 * the same answers, not whether the arithmetic is reproducible.
 *
 *   tsx scripts/qa/cover-geometry-equivalence.ts > before.json
 *   ...extract...
 *   tsx scripts/qa/cover-geometry-equivalence.ts > after.json
 *   node -e "..." // diff
 *
 * Free. Reads no database, renders nothing, spends nothing.
 */
import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import { computeCoverDimensions, coverAllowsSpineText, COVER_BLEED_IN } from '../../src/pipeline/publishing-standard/cover-dimensions.js';
import { resolveCoverGeometry } from '../../src/pipeline/cover/cover-geometry.js';
import { VERIFIED_SPECS } from '../../src/pipeline/publishing-standard/kdp-cover-specs.js';

/**
 * The shipped reference books and the verified hardcover configurations.
 *
 * Page counts and trims are the ones the books actually printed at. A
 * configuration nobody shipped is still worth carrying if a verified KDP
 * reading exists for it, because that reading is the only external evidence in
 * the repository.
 */
const CASES: Array<{ label: string; pageCount: number; widthIn: number; heightIn: number; paperStock: 'white' | 'cream' }> = [
  // ── Shipped books. Page count and trim READ from the actual interior PDF on
  //    2026-08-26, not assumed. Paper stock is stated only where the cover
  //    build or a verified KDP reading confirms it.
  { label: '7 NATIONAL PARKS — shipped, 6x9 white [PDF-CONFIRMED]', pageCount: 120, widthIn: 6, heightIn: 9, paperStock: 'white' },
  { label: 'DIRT RICH / SEED PACKET — shipped, 6x9 cream [PDF-CONFIRMED]', pageCount: 126, widthIn: 6, heightIn: 9, paperStock: 'cream' },
  { label: 'NO ONE TOLD ME THAT — shipped rev25, 5.5x8.5 [PDF-CONFIRMED, paper unconfirmed: white assumed]', pageCount: 170, widthIn: 5.5, heightIn: 8.5, paperStock: 'white' },
  { label: 'THE WILDLANDS NEW ENGLAND — shipped, 7x10 white [PDF-CONFIRMED]', pageCount: 275, widthIn: 7, heightIn: 10, paperStock: 'white' },

  // ── Earlier builds of National Parks, for spine-movement regression.
  { label: '7 NATIONAL PARKS — earlier 118pp build', pageCount: 118, widthIn: 6, heightIn: 9, paperStock: 'white' },
  { label: '7 NATIONAL PARKS — earlier 116pp build', pageCount: 116, widthIn: 6, heightIn: 9, paperStock: 'white' },

  // ── Boundaries.
  { label: 'boundary — 79pp, NOT eligible for spine text', pageCount: 79, widthIn: 6, heightIn: 9, paperStock: 'white' },
  { label: 'boundary — 80pp, first eligible for spine text', pageCount: 80, widthIn: 6, heightIn: 9, paperStock: 'white' },
  { label: 'boundary — 24pp, printable minimum', pageCount: 24, widthIn: 6, heightIn: 9, paperStock: 'white' },
  { label: 'boundary — 828pp, printable maximum', pageCount: 828, widthIn: 6, heightIn: 9, paperStock: 'white' },
];

const configFor = (c: (typeof CASES)[number]): ProjectConfig =>
  ProjectConfigSchema.parse({
    volume: 1,
    title: 'Equivalence Fixture',
    authorName: 'An Author',
    trimSize: { widthIn: c.widthIn, heightIn: c.heightIn, bleedIn: 0.125 },
    paperStock: c.paperStock,
    typography: { bodyPt: 11, lineHeight: 1.35, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
  });

const round = (n: number): number => Number(n.toFixed(6));
const rect = (r: { x: number; y: number; w: number; h: number } | undefined) =>
  r ? { x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) } : null;

const out: Record<string, unknown> = { bleedIn: COVER_BLEED_IN, cases: {} };

for (const c of CASES) {
  const config = configFor(c);
  const dims = computeCoverDimensions(config, c.pageCount);

  let zones: Record<string, unknown> | string;
  try {
    const g = resolveCoverGeometry(config, c.pageCount);
    const z = g.inches;
    zones = {
      pageCount: g.pageCount,
      paperStock: g.paperStock,
      trim: { w: round(g.trimIn.widthIn), h: round(g.trimIn.heightIn) },
      bleedIn: round(g.bleedIn),
      dims: { w: round(g.dims.fullWidthIn), h: round(g.dims.fullHeightIn), spine: round(g.dims.spineIn) },
      wrap: rect(z.wrap),
      trimBox: rect(z.trim),
      safe: rect(z.safe),
      backPanel: rect(z.backPanel),
      backSafe: rect(z.backSafe),
      spine: rect(z.spine),
      spineSafe: rect(z.spineSafe),
      frontPanel: rect(z.frontPanel),
      frontSafe: rect(z.frontSafe),
      printCanvas: g.printCanvas,
    };
  } catch (e) {
    zones = `THREW: ${(e as Error).message}`;
  }

  (out.cases as Record<string, unknown>)[c.label] = {
    input: { pageCount: c.pageCount, trim: `${c.widthIn}x${c.heightIn}`, paperStock: c.paperStock, bleedIn: COVER_BLEED_IN },
    spineIn: round(dims.spineIn),
    fullWidthIn: round(dims.fullWidthIn),
    fullHeightIn: round(dims.fullHeightIn),
    spineTextAllowed: coverAllowsSpineText(c.pageCount),
    geometry: zones,
  };
}

/** The verified KDP readings, carried through so a later reconciliation can diff them too. */
out.verifiedSpecs = VERIFIED_SPECS.map((s: { config: Record<string, unknown>; spineIn: number; provenance?: string }) => ({
  config: s.config,
  spineIn: s.spineIn,
  provenance: s.provenance ?? null,
}));

console.log(JSON.stringify(out, null, 2));
