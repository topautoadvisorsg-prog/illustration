import { describe, expect, it } from 'vitest';
import type { LayoutTemplateId } from '@wildlands/shared';
import { computePageGeometry, DEFAULT_MARGINS } from '../pipeline/stage-6-layout/page-geometry.js';
import { analyzeTextFit } from '../pipeline/stage-6-layout/text-fit.js';

const geometry = computePageGeometry({ widthIn: 8.5, heightIn: 11, bleedIn: 0.125 }, DEFAULT_MARGINS);

function fit(body: string, layoutTemplate: LayoutTemplateId = 'LAYOUT_1_STANDARD') {
  return analyzeTextFit({ bodyMarkdown: body, layoutTemplate, geometry, bodyPt: 11, lineHeight: 1.28 });
}

describe('analyzeTextFit', () => {
  it('derives a deterministic character grid for the standard layout', () => {
    const r = fit('x'.repeat(1500));
    // Content frame derives from the TRIM box: textWidthPt 450, heightPt 648.
    // LAYOUT_1_STANDARD is FLOAT_LEFT with artAreaFraction=0.32 — ≥ the parallel-
    // column threshold (0.25), so the text panel is a NARROWER column at FULL
    // height (not the old full-width × reduced-lines model).
    //   panelWidthPt  = 450 × (1 − 0.32) = 306
    //   panelHeightPt = 648
    //   charsPerLine  = floor(306 / (0.45 × 11)) = floor(61.8) = 61
    //   totalLines    = floor(648 / (11 × 1.28)) = floor(46.0) = 46
    //   usableLines   = 46 − 3 overhead          = 43
    expect(r.charsPerLine).toBe(61);
    expect(r.totalLines).toBe(46);
    expect(r.usableLines).toBe(43);
    expect(r.capacityChars).toBe(61 * 43);
  });

  it('classifies a comfortably-fitting page as FITS', () => {
    const r = fit('x'.repeat(1500));
    expect(r.status).toBe('FITS');
    expect(r.fits).toBe(true);
  });

  it('treats long text-led entries as continuation flow instead of lost text', () => {
    const r = fit('x'.repeat(5000));
    expect(r.status).toBe('TIGHT');
    expect(r.fits).toBe(true);
    expect(r.fillRatio).toBeGreaterThan(1);
    expect(r.estimatedRenderedPages).toBeGreaterThan(1);
    expect(r.notes.join(' ')).toMatch(/continuation flow/);
  });

  it('still blocks huge copy in an illustration-dominant layout', () => {
    const r = fit('x'.repeat(5000), 'LAYOUT_3_ILLUSTRATION_DOMINANT');
    expect(r.status).toBe('OVERFLOW');
    expect(r.fits).toBe(false);
    expect(r.notes.join(' ')).toMatch(/Route to a more text-heavy layout/);
  });

  it('flags a nearly-full page as TIGHT', () => {
    // capacity = 61 × 43 = 2623; 3050 chars → fillRatio ≈ 1.16. LAYOUT_1_STANDARD
    // is FLOAT_LEFT artAreaFraction=0.32 — not textLight, not (a≥0.5 &&
    // fillRatio>1.25) — so the analyzer maps to TIGHT (not OVERFLOW).
    const r = fit('x'.repeat(3050));
    expect(r.status).toBe('TIGHT');
    expect(r.fits).toBe(true);
  });

  it('flags an almost-empty page as UNDERFILLED', () => {
    const r = fit('x'.repeat(120));
    expect(r.status).toBe('UNDERFILLED');
    expect(r.notes.join(' ')).toMatch(/fills only/);
  });

  it('reduces capacity as section headers consume lines', () => {
    const plain = fit('x'.repeat(1500));
    const withHeaders = fit(`## A\n## B\n## C\n${'x'.repeat(1500)}`);
    expect(withHeaders.usableLines).toBeLessThan(plain.usableLines);
  });

  it('gives an illustration-dominant layout less text capacity than text-heavy', () => {
    const body = 'x'.repeat(1500);
    const dominant = fit(body, 'LAYOUT_3_ILLUSTRATION_DOMINANT');
    const heavy = fit(body, 'LAYOUT_2_TEXT_HEAVY');
    expect(dominant.capacityChars).toBeLessThan(heavy.capacityChars);
  });

  it('reports layout allocation for previewing text-safe and image-priority zones', () => {
    const r = fit('x'.repeat(1500), 'LAYOUT_2_TEXT_HEAVY');
    expect(r.allocation.openingPageImagePercent).toBe(14);
    expect(r.allocation.openingPageTextPercent).toBe(86);
    expect(r.allocation.imagePriorityZone.recommendedWidthPx).toBeGreaterThan(0);
    expect(r.allocation.textSafeZones[0]?.instruction).toMatch(/body text|readable/i);
    expect(r.allocation.imagePriorityZones[0]?.instruction).toMatch(/focal|detail/i);
  });
});
