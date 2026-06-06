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
    // 459pt / (0.45 * 11pt) = floor(92.7) = 92 chars/line
    expect(r.charsPerLine).toBe(92);
    // floor(666 / (11 * 1.28)) = floor(47.3) = 47 total lines
    expect(r.totalLines).toBe(47);
    // (47 - 3 overhead) * 0.8 factor -> floor(35.2) = 35 usable lines
    expect(r.usableLines).toBe(35);
    expect(r.capacityChars).toBe(92 * 35);
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
    // capacity = 92*35 = 3220; ~95% fill
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
