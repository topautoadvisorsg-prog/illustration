/**
 * WHAT A FAILURE HERE MEANS
 *
 * This is the regression suite for the one cover production path. Every test
 * builds its own inputs in memory — a synthetic interior PDF and a synthetic
 * raster — so the suite is portable and does not depend on any book existing on
 * the machine that runs it.
 *
 * The failures these guard against have all actually happened:
 *
 *   - a hardcover wrap computed from paperback trim arithmetic, short by more
 *     than half an inch;
 *   - a cover sized from a typed page count that no longer matched the interior;
 *   - back-cover copy sitting under the barcode KDP prints;
 *   - artwork upscaled to fill a wrap and shipped at an effective resolution
 *     nobody measured.
 */
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCover, readInteriorPageCount } from '../pipeline/cover/compositor/build-cover.js';
import { resolveCoverGeometry } from '../pipeline/cover/compositor/geometry.js';
import { UnverifiedKdpConfigurationError } from '../pipeline/publishing-standard/kdp-spec.js';

/** An interior with a known page count, built here so no book file is needed. */
async function interiorPdf(pageCount: number, widthIn = 6, heightIn = 9): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([widthIn * 72, heightIn * 72]);
  return Buffer.from(await doc.save());
}

/** A plain raster at a given pixel size. Content is irrelevant; dimensions are not. */
async function art(widthPx: number, heightPx: number): Promise<Buffer> {
  return sharp({
    create: { width: widthPx, height: heightPx, channels: 3, background: { r: 90, g: 110, b: 90 } },
  })
    .png()
    .toBuffer();
}

const BASE = {
  ink: 'BLACK_AND_WHITE',
  paper: 'WHITE',
  trim: '6x9',
  title: 'A Book',
  author: 'An Author',
  spineText: false,
  renderDpi: 50,
  builtAt: '2026-08-26T00:00:00.000Z',
} as const;

describe('page count comes from the interior, never from an argument', () => {
  it('reads the count out of the PDF', async () => {
    expect(await readInteriorPageCount(await interiorPdf(137))).toBe(137);
  });

  it('refuses an unreadable interior rather than falling back', async () => {
    await expect(readInteriorPageCount(Buffer.from('not a pdf'))).rejects.toThrow(/could not be read/i);
  });

  it('sizes the spine from the detected count', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      interiorPdf: await interiorPdf(120),
      artwork: await art(700, 520),
    });
    expect(r.geometry.pageCount).toBe(120);
    expect(r.geometry.spineIn).toBeCloseTo(120 * 0.002252, 10);
  });
});

describe('paperback', () => {
  it('produces the published wrap', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      interiorPdf: await interiorPdf(120),
      artwork: await art(700, 520),
    });
    expect(r.geometry.fullWidthIn).toBeCloseTo(6 * 2 + 120 * 0.002252 + 0.25, 9);
    expect(r.geometry.fullHeightIn).toBeCloseTo(9.25, 9);
    expect(r.geometry.panelIsBoard).toBe(false);
    expect(r.geometry.spineAuthority).toBe('OFFICIAL_FORMULA');
  });

  it('emits a one-page PDF at exactly the wrap size', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      interiorPdf: await interiorPdf(120),
      artwork: await art(700, 520),
    });
    const doc = await PDFDocument.load(r.productionPdf);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width / 72).toBeCloseTo(r.geometry.fullWidthIn, 6);
    expect(height / 72).toBeCloseTo(r.geometry.fullHeightIn, 6);
  });
});

describe('hardcover', () => {
  it('takes its geometry from the calculator, and the board is larger than the trim', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'HARDCOVER',
      interiorPdf: await interiorPdf(120),
      artwork: await art(700, 520),
    });
    expect(r.geometry.spineAuthority).toBe('OFFICIAL_CALCULATOR_FIXTURE');
    expect(r.geometry.panelIsBoard).toBe(true);
    expect(r.geometry.panelWidthIn).toBeGreaterThan(6);
    expect(r.geometry.panelHeightIn).toBeGreaterThan(9);
    expect(r.geometry.fullWidthIn).toBeCloseTo(14.034, 3);
    expect(r.geometry.fullHeightIn).toBeCloseTo(10.417, 3);
  });

  it('is NOT the paperback wrap for the same book', async () => {
    const args = { ...BASE, interiorPdf: await interiorPdf(120), artwork: await art(700, 520) };
    const pb = await buildCover({ ...args, binding: 'PAPERBACK' });
    const hc = await buildCover({ ...args, binding: 'HARDCOVER' });
    // Trim arithmetic would have produced the same height. It must not.
    expect(hc.geometry.fullHeightIn).toBeGreaterThan(pb.geometry.fullHeightIn + 1);
    expect(hc.geometry.spineIn).toBeGreaterThan(pb.geometry.spineIn + 0.1);
  });

  it('does not assert a spine-text page minimum Amazon has not published', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'HARDCOVER',
      interiorPdf: await interiorPdf(120),
      artwork: await art(700, 520),
    });
    expect(r.geometry.spineTextEligible).toBeNull();
  });
});

describe('effective resolution is measured, not claimed', () => {
  it('reports 300 PPI when the raster matches the wrap exactly', async () => {
    const g = resolveCoverGeometry({ binding: 'PAPERBACK', ink: 'BLACK_AND_WHITE', paper: 'WHITE', trim: '6x9', pageCount: 120 });
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      renderDpi: 300,
      interiorPdf: await interiorPdf(120),
      artwork: await art(Math.round(g.fullWidthIn * 300), Math.round(g.fullHeightIn * 300)),
    });
    expect(r.artworkPlan.effectivePpi).toBeCloseTo(300, 0);
    expect(r.checks.find((c) => c.id === 'effective_dpi')!.status).toBe('PASS');
  });

  it('warns when art must be scaled up, and never upscales it silently', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      renderDpi: 300,
      interiorPdf: await interiorPdf(120),
      artwork: await art(2000, 1478),
    });
    expect(r.artworkPlan.effectivePpi).toBeLessThan(300);
    expect(['WARN', 'FAIL']).toContain(r.checks.find((c) => c.id === 'effective_dpi')!.status);
  });

  it('fails outright when the art is far too small', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      renderDpi: 300,
      interiorPdf: await interiorPdf(120),
      artwork: await art(400, 296),
    });
    expect(r.checks.find((c) => c.id === 'effective_dpi')!.status).toBe('FAIL');
    expect(r.status).toBe('BLOCKED');
  });
});

describe('spine text', () => {
  it('is refused below the published paperback minimum', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      spineText: true,
      interiorPdf: await interiorPdf(79),
      artwork: await art(700, 520),
    });
    expect(r.geometry.spineTextEligible).toBe(false);
    expect(r.checks.find((c) => c.id === 'spine_text')!.status).toBe('FAIL');
    expect(r.status).toBe('BLOCKED');
  });

  it('is allowed at the first eligible page count', async () => {
    const g = resolveCoverGeometry({ binding: 'PAPERBACK', ink: 'BLACK_AND_WHITE', paper: 'WHITE', trim: '6x9', pageCount: 80 });
    expect(g.spineTextEligible).toBe(true);
  });
});

describe('the barcode reserve', () => {
  it('sits in a different place on each binding', async () => {
    const pb = resolveCoverGeometry({ binding: 'PAPERBACK', ink: 'BLACK_AND_WHITE', paper: 'WHITE', trim: '6x9', pageCount: 120 });
    const hc = resolveCoverGeometry({ binding: 'HARDCOVER', ink: 'BLACK_AND_WHITE', paper: 'WHITE', trim: '6x9', pageCount: 120 });
    expect(pb.barcodeSafe.xIn).not.toBeCloseTo(hc.barcodeSafe.xIn, 3);
  });

  it('blocks a cover whose declared content invades it', async () => {
    const g = resolveCoverGeometry({ binding: 'PAPERBACK', ink: 'BLACK_AND_WHITE', paper: 'WHITE', trim: '6x9', pageCount: 120 });
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      interiorPdf: await interiorPdf(120),
      artwork: await art(700, 520),
      contentBoxes: [{ id: 'back-copy', rect: { ...g.barcodeSafe, yIn: g.barcodeSafe.yIn - 0.2 } }],
    });
    expect(r.checks.find((c) => c.id === 'barcode_region')!.status).toBe('FAIL');
    expect(r.status).toBe('BLOCKED');
  });

  it('passes content that clears it', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      interiorPdf: await interiorPdf(120),
      artwork: await art(700, 520),
      contentBoxes: [{ id: 'blurb', rect: { xIn: 0.5, yIn: 0.5, widthIn: 4, heightIn: 3 } }],
    });
    expect(r.checks.find((c) => c.id === 'barcode_region')!.status).toBe('PASS');
  });
});

describe('unsupported configurations fail closed', () => {
  it('refuses a trim Amazon does not list for the binding', () => {
    expect(() =>
      resolveCoverGeometry({ binding: 'HARDCOVER', ink: 'BLACK_AND_WHITE', paper: 'WHITE', trim: '5x8', pageCount: 120 }),
    ).toThrow(UnverifiedKdpConfigurationError);
  });

  it('refuses a hardcover page count with no calculator reading near it', () => {
    expect(() =>
      resolveCoverGeometry({ binding: 'HARDCOVER', ink: 'BLACK_AND_WHITE', paper: 'WHITE', trim: '6x9', pageCount: 9000 }),
    ).toThrow();
  });

  it('refuses a nonsense page count', () => {
    expect(() =>
      resolveCoverGeometry({ binding: 'PAPERBACK', ink: 'BLACK_AND_WHITE', paper: 'WHITE', trim: '6x9', pageCount: 0 }),
    ).toThrow(UnverifiedKdpConfigurationError);
  });
});

describe('manifest pairs the cover to the interior it was built from', () => {
  let a: Awaited<ReturnType<typeof buildCover>>;
  let b: Awaited<ReturnType<typeof buildCover>>;

  beforeAll(async () => {
    const artwork = await art(700, 520);
    a = await buildCover({ ...BASE, binding: 'PAPERBACK', interiorPdf: await interiorPdf(116), artwork });
    b = await buildCover({ ...BASE, binding: 'PAPERBACK', interiorPdf: await interiorPdf(118), artwork });
  });

  it('records the interior hash, the cover hash and the detected page count', () => {
    expect(a.manifest.interior.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.manifest.cover.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.manifest.interior.pageCount).toBe(116);
    expect(a.manifest.compositorVersion).toBeTruthy();
  });

  it('makes a 116-vs-118 mismatch mechanically detectable', () => {
    // This is the class of error the manifest exists to catch: the same artwork,
    // a different interior, therefore a different spine and a different cover.
    expect(b.manifest.interior.pageCount).toBe(118);
    expect(b.manifest.interior.sha256).not.toBe(a.manifest.interior.sha256);
    expect(b.manifest.spineIn).not.toBeCloseTo(a.manifest.spineIn, 6);
    expect(b.manifest.cover.sha256).not.toBe(a.manifest.cover.sha256);
  });

  it('carries the provenance of the geometry it used', () => {
    expect(a.manifest.geometryAuthority).toBe('OFFICIAL_FORMULA');
    expect(a.manifest.geometrySource).toMatch(/G201953020/);
  });
});

describe('approved artwork is not altered beyond placement', () => {
  it('never distorts by default', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      interiorPdf: await interiorPdf(120),
      artwork: await art(1000, 500),
    });
    expect(r.artworkPlan.distorted).toBe(false);
    expect(r.checks.find((c) => c.id === 'artwork_aspect')!.status).toBe('PASS');
  });

  it('reports any crop in inches rather than hiding it', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      interiorPdf: await interiorPdf(120),
      artwork: await art(2000, 500),
    });
    expect(r.artworkPlan.cropIn.leftIn).toBeGreaterThan(0);
    expect(r.checks.find((c) => c.id === 'artwork_crop')).toBeTruthy();
  });

  it('treats an explicit stretch as a failure, not a convenience', async () => {
    const r = await buildCover({
      ...BASE,
      binding: 'PAPERBACK',
      fitMode: 'exact',
      interiorPdf: await interiorPdf(120),
      artwork: await art(1000, 500),
    });
    expect(r.artworkPlan.distorted).toBe(true);
    expect(r.checks.find((c) => c.id === 'artwork_aspect')!.status).toBe('FAIL');
    expect(r.status).toBe('BLOCKED');
  });
});
