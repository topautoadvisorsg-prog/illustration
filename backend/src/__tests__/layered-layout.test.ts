import { describe, expect, it } from 'vitest';
import { ContentTypeSchema, LayoutTemplateIdSchema, type PageManifest } from '@wildlands/shared';
import {
  CONTENT_TYPE_POLICY,
  LAYOUT_TEMPLATE_COMPOSITION,
  classifyContentType,
  composeProfile,
  decomposeTemplate,
  getContentTypeGuide,
} from '../pipeline/stage-2-planner/layered-layout.js';
import { LAYOUT_PROFILES, getLayoutProfile, layoutCoverageMeta } from '../pipeline/stage-6-layout/layout-profiles.js';

const ALL_TEMPLATES = LayoutTemplateIdSchema.options;
const ALL_CONTENT_TYPES = ContentTypeSchema.options;

describe('layoutCoverageMeta (metadata, not pixels)', () => {
  it('reports image/text split + placement for a full-page plate', () => {
    const meta = layoutCoverageMeta('LAYOUT_10_FULL_PAGE_PLATE'); // artAreaFraction 0.95, FULL_PAGE
    expect(meta.imagePercent).toBe(95);
    expect(meta.textPercent).toBe(5);
    expect(meta.placement).toBe('FULL_PAGE');
    expect(meta.summary).toBe('95% image · 5% text · full page');
  });

  it('reports a text-heavy float as mostly text', () => {
    const meta = layoutCoverageMeta('LAYOUT_2_TEXT_HEAVY'); // artAreaFraction 0.14, FLOAT_LEFT
    expect(meta.imagePercent).toBe(14);
    expect(meta.textPercent).toBe(86);
    expect(meta.placementLabel).toBe('inset left');
  });

  it('every template yields percentages that sum to 100', () => {
    for (const template of ALL_TEMPLATES) {
      const meta = layoutCoverageMeta(template);
      expect(meta.imagePercent + meta.textPercent).toBe(100);
    }
  });
});

function page(overrides: Partial<PageManifest> = {}): PageManifest {
  return {
    pageId: 'CH01_P001',
    chapterNumber: 1,
    pageNumber: 1,
    entryTitle: 'Chanterelle',
    imageSubject: 'golden chanterelle mushroom',
    layoutTemplate: 'LAYOUT_1_STANDARD',
    bodyMarkdown: 'A prized edible mushroom.',
    warnings: [],
    ...overrides,
  };
}

describe('layered model — policy + composition tables', () => {
  it('defines a policy for every content type, resolving to a valid template', () => {
    for (const ct of ALL_CONTENT_TYPES) {
      const policy = CONTENT_TYPE_POLICY[ct];
      expect(policy, `policy for ${ct}`).toBeDefined();
      expect(LayoutTemplateIdSchema.options).toContain(policy.template);
    }
  });

  it('decomposes every existing template, and the architecture matches its render art slot', () => {
    for (const t of ALL_TEMPLATES) {
      const comp = LAYOUT_TEMPLATE_COMPOSITION[t];
      expect(comp, `composition for ${t}`).toBeDefined();
      // The decomposed architecture must equal what actually renders (the profile art slot),
      // proving the layered model is consistent with the unchanged render path.
      expect(comp.architecture).toBe(LAYOUT_PROFILES[t].artSlot);
      expect(ContentTypeSchema.options).toContain(comp.contentType);
    }
  });

  it('decomposeTemplate falls back to standard for safety', () => {
    expect(decomposeTemplate('LAYOUT_1_STANDARD').contentType).toBe('SPECIES_PROFILE');
  });

  it('gives every content type non-empty usage guidance (the agent go-to reference)', () => {
    for (const ct of ALL_CONTENT_TYPES) {
      const policy = CONTENT_TYPE_POLICY[ct];
      expect(policy.purpose.length, `purpose for ${ct}`).toBeGreaterThan(0);
      expect(policy.usedFor.length, `usedFor for ${ct}`).toBeGreaterThan(0);
      expect(typeof policy.multiSubject).toBe('boolean');
    }
  });

  it('exposes the full catalog via getContentTypeGuide', () => {
    const guide = getContentTypeGuide();
    expect(guide).toHaveLength(ALL_CONTENT_TYPES.length);
    const comparison = guide.find((g) => g.contentType === 'COMPARISON');
    expect(comparison?.usedFor.join(' ')).toMatch(/look-alike/);
    expect(comparison?.multiSubject).toBe(true);
  });
});

describe('classifyContentType', () => {
  it('uses the manifest contentType when already classified', () => {
    expect(classifyContentType(page({ contentType: 'BOTANICAL_PLATE' })).contentType).toBe('BOTANICAL_PLATE');
  });

  it('classifies a toxic subject as WARNING_PAGE', () => {
    expect(classifyContentType(page({ category: 'TOXIC', entryTitle: 'Death Cap' })).contentType).toBe('WARNING_PAGE');
  });

  it('classifies a comparison title as COMPARISON', () => {
    expect(classifyContentType(page({ entryTitle: 'Chanterelle vs False Chanterelle' })).contentType).toBe('COMPARISON');
  });

  it('defaults a plain entry to SPECIES_PROFILE', () => {
    expect(classifyContentType(page()).contentType).toBe('SPECIES_PROFILE');
  });
});

describe('composeProfile — forward engine (coverage + architecture only)', () => {
  it('maps coverage to art area and architecture to art slot', () => {
    const p = composeProfile(50, 'TOP_BAND');
    expect(p.artSlot).toBe('TOP_BAND');
    expect(p.artAreaFraction).toBe(0.5);
  });

  it('gives wrap architectures more text room than band architectures at equal coverage', () => {
    const wrap = composeProfile(50, 'FLOAT_LEFT');
    const band = composeProfile(50, 'TOP_BAND');
    expect(wrap.textAreaFactor).toBeGreaterThan(band.textAreaFactor);
  });

  it('marks 100% coverage as text-light', () => {
    expect(composeProfile(100, 'FULL_PAGE').textLight).toBe(true);
    expect(composeProfile(40, 'FLOAT_LEFT').textLight).toBe(false);
  });
});

describe('render path is unchanged (old layouts still render)', () => {
  it('keeps every template profile intact and resolvable', () => {
    for (const t of ALL_TEMPLATES) {
      expect(getLayoutProfile(t)).toBe(LAYOUT_PROFILES[t]);
    }
  });
});
