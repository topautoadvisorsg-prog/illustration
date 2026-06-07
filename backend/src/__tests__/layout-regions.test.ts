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
    const valid: RegionType[] = ['image-priority', 'reading-field', 'overlay-typography', 'supporting-study'];
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
