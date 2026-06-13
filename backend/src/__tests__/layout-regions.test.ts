import { describe, it, expect } from 'vitest';
import { directLayout, readingFieldImageConflicts, type RegionType } from '../pipeline/stage-6-layout/layout-director.js';
import { computePageGeometry } from '../pipeline/stage-6-layout/page-geometry.js';
import { LayoutTemplateIdSchema, type LayoutTemplateId } from '@wildlands/shared';

const LAYOUT_TEMPLATE_IDS = LayoutTemplateIdSchema.options;
const geometry = computePageGeometry({ widthIn: 7.13, heightIn: 10.25, bleedIn: 0.125 });
const alloc = (template: LayoutTemplateId) =>
  directLayout({ bodyMarkdown: 'x'.repeat(1500), layoutTemplate: template, geometry, bodyPt: 11, lineHeight: 1.4 });

describe('layout director — four region types', () => {
  it('never lets a reading field overlap an image-priority zone (every layout)', () => {
    for (const template of LAYOUT_TEMPLATE_IDS) {
      const a = alloc(template);
      expect(readingFieldImageConflicts(a), `${template} has a reading-field/image overlap`).toEqual([]);
      expect(a.notes.some((n) => n.includes('Layout conflict'))).toBe(false);
    }
  });

  it('tags every region with one of the four RegionTypes', () => {
    const valid: RegionType[] = ['image-priority', 'background-field', 'reading-field', 'overlay-typography', 'supporting-study'];
    for (const template of LAYOUT_TEMPLATE_IDS) {
      const a = alloc(template);
      expect(a.regions.length).toBeGreaterThan(0);
      for (const r of a.regions) expect(valid).toContain(r.regionType);
    }
  });

  it('keeps focal image detail below the calm title band', () => {
    // The title overlays a calm top band; focal image detail must start below it so the
    // title never sits over the concentrated-detail zone (the blueprint-overlap bug).
    for (const template of LAYOUT_TEMPLATE_IDS) {
      const a = alloc(template);
      const title = a.typographyZones.find((z) => z.role === 'title');
      const titleBottom = title ? title.yPct + title.heightPct : 0;
      for (const img of a.imagePriorityZones.filter((z) => z.regionType === 'image-priority')) {
        expect(img.yPct, `${template} focal image starts above the title band`).toBeGreaterThanOrEqual(titleBottom - 0.01);
      }
    }
  });
});

// ─── Empty space → illustration: underfilled openers go image-dominant ──────

describe('layout director — underfilled opener becomes illustration-dominant', () => {
  const SHORT = 'A short entry opener with only a couple of sentences of text.'; // ~60 chars
  const LONG = 'x'.repeat(1500);
  const run = (body: string, isEntryOpener = true) =>
    directLayout({ bodyMarkdown: body, layoutTemplate: 'LAYOUT_B_IMAGE_LEFT', geometry, bodyPt: 11, lineHeight: 1.4, hasTitle: isEntryOpener, isEntryOpener });

  it('a short ENTRY OPENER hands the empty column to the artwork (image-dominant, no blank)', () => {
    const a = run(SHORT);
    // Image now dominates (well above the ~50% the B template would give)...
    expect(a.openingPageImagePercent ?? Math.round(a.imagePriorityZones[0]!.widthPct)).toBeGreaterThan(60);
    // ...but the short text still has a real reading field (not baked, not gone).
    const reading = a.textSafeZones.filter((z) => z.role === 'body');
    expect(reading.length).toBeGreaterThan(0);
    // whole page is one illustration — a background field is present, no blank.
    expect(a.regions.some((r) => r.regionType === 'background-field')).toBe(true);
    // and nothing overlaps.
    expect(readingFieldImageConflicts(a)).toEqual([]);
  });

  it('a FULL-text opener keeps the normal ~50/50 layout (rule does not fire)', () => {
    const a = run(LONG);
    expect(Math.round(a.imagePriorityZones.find((z) => z.regionType === 'image-priority')!.widthPct)).toBeLessThanOrEqual(60);
  });

  it('a short CONTINUATION (not an entry opener) is NOT affected', () => {
    const a = run(SHORT, false);
    // Continuation keeps the text-led treatment, not the image-dominant opener path.
    const focal = a.imagePriorityZones.find((z) => z.regionType === 'image-priority');
    expect(focal ? Math.round(focal.widthPct) : 0).toBeLessThanOrEqual(60);
  });
});

// ─── P2a — 25 % accent corner geometry (LAYOUT_C rebuilt) ───────────────────

describe('layout director — LAYOUT_C true 25 % accent', () => {
  const corners: Array<[LayoutTemplateId, { top: boolean; left: boolean }]> = [
    ['LAYOUT_C_CORNER_TOP_LEFT', { top: true, left: true }],
    ['LAYOUT_C_CORNER_TOP_RIGHT', { top: true, left: false }],
    ['LAYOUT_C_CORNER_BOTTOM_LEFT', { top: false, left: true }],
    ['LAYOUT_C_CORNER_BOTTOM_RIGHT', { top: false, left: false }],
  ];

  // The accent assertions concern the FOCAL study only; the subtle full-page
  // background illustration field (regionType 'background-field') is a separate
  // calm layer and is intentionally excluded here.
  const focalZones = (template: LayoutTemplateId) =>
    alloc(template).imagePriorityZones.filter((z) => z.regionType === 'image-priority');

  it('accent zone is a true accent (≤ 30 % of the page), never full-page', () => {
    for (const [template] of corners) {
      const focal = focalZones(template);
      expect(focal).toHaveLength(1);
      const img = focal[0]!;
      const areaPct = (img.widthPct * img.heightPct) / 100; // % of page
      expect(areaPct, `${template} accent area`).toBeLessThanOrEqual(30);
      expect(areaPct, `${template} accent area`).toBeGreaterThanOrEqual(10);
    }
  });

  it('accent sits in its named corner', () => {
    for (const [template, pos] of corners) {
      const img = focalZones(template)[0]!;
      const centerX = img.xPct + img.widthPct / 2;
      const centerY = img.yPct + img.heightPct / 2;
      expect(pos.left ? centerX < 50 : centerX > 50, `${template} horizontal`).toBe(true);
      expect(pos.top ? centerY < 56 : centerY > 50, `${template} vertical`).toBe(true);
    }
  });

  it('text owns the page: two reading fields whose area dwarfs the accent', () => {
    for (const [template] of corners) {
      const a = alloc(template);
      expect(a.textSafeZones.length).toBe(2);
      const textArea = a.textSafeZones.reduce((s, z) => s + z.widthPct * z.heightPct, 0);
      const imgArea = focalZones(template).reduce((s, z) => s + z.widthPct * z.heightPct, 0);
      expect(textArea, `${template} text:image ratio`).toBeGreaterThan(imgArea * 2);
    }
  });
});
