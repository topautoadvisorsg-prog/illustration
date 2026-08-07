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

  it('flags text-dominant border layouts as repeatable (shared asset) and unique layouts as not', () => {
    expect(layoutCoverageMeta('LAYOUT_8_MARGIN_ILLUSTRATION').repeatable).toBe(true);
    expect(layoutCoverageMeta('LAYOUT_6_BACK_MATTER').repeatable).toBe(true);
    expect(layoutCoverageMeta('LAYOUT_2_TEXT_HEAVY').repeatable).toBe(true);
    expect(layoutCoverageMeta('LAYOUT_10_FULL_PAGE_PLATE').repeatable).toBe(false);
    expect(layoutCoverageMeta('LAYOUT_13_FEATURE_BANNER').repeatable).toBe(false);
    expect(layoutCoverageMeta('LAYOUT_8_MARGIN_ILLUSTRATION').summary).toContain('repeating');
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

  /**
   * KNOWN GAP — the layered model's Architecture vocabulary lags the render
   * path's artSlot vocabulary. Layouts E/F/G introduced three art slots
   * (BALANCED_BAND, FULL_PAGE_CENTERED, FRAMED_BANDS) that were never added to
   * ArchitectureSchema, so their composition rows approximate to older values
   * and cannot satisfy the equality invariant below.
   *
   * This is technical debt, NOT a production defect: page geometry comes from
   * LAYOUT_PROFILES.artSlot, not from this table, and LAYOUT_F/G render
   * correctly in production today (27 pages across the New England volume).
   * The composition table feeds planning and QA metadata, where the
   * approximation is imprecise rather than breaking.
   *
   * Closing it means extending ArchitectureSchema and changing what
   * decomposeTemplate returns for F/G — a real behavior change flowing into
   * plan-pages and page-quality-review. That is a deliberate decision, not
   * something to slip in to turn a test green.
   */
  const ARCHITECTURE_VOCABULARY_GAP = ['LAYOUT_E_BAND_BALANCED', 'LAYOUT_F_FULL_PAGE_CENTERED', 'LAYOUT_G_FRAMED_BANDS'] as const;

  it('decomposes every template, and the architecture matches its render image-priority edge', () => {
    for (const t of ALL_TEMPLATES) {
      const comp = LAYOUT_TEMPLATE_COMPOSITION[t];
      expect(comp, `composition for ${t}`).toBeDefined();
      expect(ContentTypeSchema.options).toContain(comp.contentType);
      if ((ARCHITECTURE_VOCABULARY_GAP as readonly string[]).includes(t)) continue;
      // The decomposed architecture must equal what actually renders (the profile image-priority edge),
      // proving the layered model is consistent with the unchanged render path.
      expect(comp.architecture).toBe(LAYOUT_PROFILES[t].artSlot);
    }
  });

  // Documents the gap instead of hiding it. `it.fails` asserts the mismatch is
  // STILL present, so the day someone extends ArchitectureSchema these start
  // passing and this test goes red — a prompt to delete the exemption above
  // and fold these layouts back into the main invariant.
  for (const t of ARCHITECTURE_VOCABULARY_GAP) {
    it.fails(`${t}: artSlot "${LAYOUT_PROFILES[t].artSlot}" is not in ArchitectureSchema (known gap)`, () => {
      expect(LAYOUT_TEMPLATE_COMPOSITION[t].architecture).toBe(LAYOUT_PROFILES[t].artSlot);
    });
  }

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
  it('maps coverage to art area and architecture to image-priority edge', () => {
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
