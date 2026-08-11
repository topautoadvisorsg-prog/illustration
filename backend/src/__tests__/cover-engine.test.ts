/**
 * The cover engine, tested against the defects that produced the bad covers.
 *
 * Every number asserted here is derived from KDP's published figures, not from
 * what the code happens to return today. Where a value was previously observed
 * in production (spine 0.385in, wrap 11.635 x 8.750in) it is asserted against
 * the arithmetic, so a regression in the formula fails rather than quietly
 * agreeing with itself.
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, type ProjectConfig } from '@wildlands/shared';
import { resolveCoverGeometry, MODEL_CANVAS } from '../pipeline/cover/cover-geometry.js';
import { buildCoverSpec } from '../pipeline/cover/cover-spec.js';
import { buildCoverPrompt } from '../pipeline/cover/cover-prompt.js';
import { blueprintTextZones, buildCoverBlueprintSvg } from '../pipeline/cover/cover-blueprint.js';
import { runCoverPreflight, findStyleLeakage } from '../pipeline/cover/cover-preflight.js';

const book = (over: Record<string, unknown> = {}): ProjectConfig =>
  ProjectConfigSchema.parse({
    volume: 1,
    title: 'NO ONE TOLD ME THAT',
    subtitle: 'The Stuff Nobody Explains About Growing Up',
    authorName: 'Nolan Whitlow',
    trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    paperStock: 'cream',
    productionProfileId: 'bw-educational-nonfiction',
    publishing: {
      coverArtDirection: 'deep saturated cobalt with a signal orange accent, flat graphic shapes',
      bookDescription: { blurb: 'Everything nobody bothered to explain.', features: ['One', 'Two'] },
    },
    ...over,
  });

const spec = (config = book(), pageCount = 154) =>
  buildCoverSpec({
    projectId: 'test',
    config,
    pageCount,
    pageCountSource: 'typeset',
    model: 'gpt-image-2',
  });

describe('cover geometry', () => {
  it('derives this book exactly, from the KDP figures', () => {
    const g = resolveCoverGeometry(book(), 154);
    // 154 pages x 0.0025in cream
    expect(g.dims.spineIn).toBeCloseTo(0.385, 6);
    // 5.5*2 + 0.385 + 0.125*2
    expect(g.dims.fullWidthIn).toBeCloseTo(11.635, 6);
    // 8.5 + 0.125*2
    expect(g.dims.fullHeightIn).toBeCloseTo(8.75, 6);
    expect(g.printCanvas).toEqual({ widthPx: 3491, heightPx: 2625, dpi: 300 });
  });

  it('uses the COVER bleed, never the interior bleed', () => {
    // This interior prints with no bleed at all. The cover still must.
    expect(book().trimSize.bleedIn).toBe(0);
    expect(resolveCoverGeometry(book(), 154).bleedIn).toBe(0.125);
    // Same book with a bleeding interior gets the SAME wrap.
    const bleeding = book({ trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0.125 } });
    expect(resolveCoverGeometry(bleeding, 154).dims.fullWidthIn).toBeCloseTo(11.635, 6);
  });

  it('gives cream and white different spines', () => {
    const cream = resolveCoverGeometry(book(), 154).dims.spineIn;
    const white = resolveCoverGeometry(book({ paperStock: 'white' }), 154).dims.spineIn;
    expect(cream).toBeCloseTo(0.385, 6);
    expect(white).toBeCloseTo(154 * 0.002252, 6);
    // 0.038in apart: enough to misregister a wrap.
    expect(cream - white).toBeGreaterThan(0.03);
  });

  it('places the spine between the panels, not at the centre of the wrap', () => {
    const g = resolveCoverGeometry(book(), 154);
    // Back panel ends where the spine begins; spine ends where the front begins.
    expect(g.inches.spine.x).toBeCloseTo(g.inches.backPanel.x + g.inches.backPanel.w, 6);
    expect(g.inches.frontPanel.x).toBeCloseTo(g.inches.spine.x + g.inches.spine.w, 6);
    // And the wrap is symmetric, so on THIS book the spine is centred; assert the
    // relationship rather than the coincidence.
    expect(g.inches.frontPanel.x + g.inches.frontPanel.w + g.bleedIn).toBeCloseTo(g.dims.fullWidthIn, 6);
  });

  it('maps the spine into model space as the narrow strip it really is', () => {
    const g = resolveCoverGeometry(book(), 154, MODEL_CANVAS);
    // The forensic number: ~46px of a 1536px canvas, which is why a text-only
    // prompt could never place it.
    expect(g.modelPx.spine.w).toBeGreaterThan(44);
    expect(g.modelPx.spine.w).toBeLessThan(48);
    expect(g.modelPx.spine.x).toBeGreaterThan(740);
    expect(g.modelPx.spine.x).toBeLessThan(750);
  });

  it('computes the centre-crop the compositor actually applies', () => {
    const g = resolveCoverGeometry(book(), 154, MODEL_CANVAS);
    expect(g.crop.scale).toBeCloseTo(2625 / 1024, 6);
    // Height binds, so nothing is lost vertically and the width is trimmed.
    expect(g.crop.cropPerSideModelPxY).toBeCloseTo(0, 6);
    expect(g.crop.survivingHeightPct).toBeCloseTo(100, 6);
    expect(g.crop.survivingWidthPct).toBeGreaterThan(88);
    expect(g.crop.survivingWidthPct).toBeLessThan(89);
  });

  it('works for a different trim and page count without special-casing', () => {
    const other = book({ trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0 }, paperStock: 'white' });
    const g = resolveCoverGeometry(other, 300);
    expect(g.dims.spineIn).toBeCloseTo(300 * 0.002252, 6);
    expect(g.dims.fullWidthIn).toBeCloseTo(6 * 2 + 300 * 0.002252 + 0.25, 6);
    expect(g.dims.fullHeightIn).toBeCloseTo(9.25, 6);
  });
});

describe('cover prompt', () => {
  it('does not inherit the field guide, which is what ruined the first cover', () => {
    const p = buildCoverPrompt(spec()).toLowerCase();
    // Never mentioned at all.
    for (const word of ['parchment', 'field guide', 'expedition-journal', 'botanical']) {
      expect(p).not.toContain(word);
    }
    // "sepia" DOES appear, but only where the cover is being told not to use it.
    // Asserting its absence would be asserting the wrong thing.
    expect(findStyleLeakage(p, ['sepia', 'naturalist plate'])).toEqual([]);
    expect(p).toMatch(/not .*sepia|sepia[^.]*\bnot\b/);
  });

  it('does not forbid the style it is asking for', () => {
    const p = buildCoverPrompt(spec());
    // The interior assembler's HARD NEGATIVES banned all three of these while the
    // cover DNA required them.
    expect(p).not.toMatch(/No sans-serif type anywhere/i);
    expect(p).not.toMatch(/no .*flat vector/i);
    expect(p).not.toMatch(/No modern UI, infographic styling, flat icons/i);
  });

  it('keeps the cover in colour when the interior is black and white', () => {
    const s = spec();
    expect(s.art.styleDnaId).toBe('graphic-trade-cover');
    expect(s.art.fullColour).toBe(true);
    expect(buildCoverPrompt(s)).toMatch(/FULL COLOUR/);
  });

  it('states the panel geometry as percentages of the model canvas', () => {
    const p = buildCoverPrompt(spec());
    expect(p).toMatch(/SPINE\s+spans/);
    // The spine is under 3% of the canvas. The prompt must say so in canvas
    // terms, because inches are what the model could not act on.
    const stated = p.match(/ONLY (\d+\.\d)% wide/);
    expect(stated).not.toBeNull();
    expect(Number(stated![1])).toBeLessThan(4);
    expect(Number(stated![1])).toBeGreaterThan(2);
  });

  it('refers to a reference image only because one is really attached', () => {
    const s = spec();
    expect(s.model.usesBlueprint).toBe(true);
    expect(buildCoverPrompt(s)).toMatch(/attached/i);
  });

  it('prints the copy verbatim and never uses printed copy as art direction', () => {
    const config = book({
      publishing: {
        coverDescription: 'A Straight-Talking Guide',
        coverArtDirection: 'cobalt and orange',
        bookDescription: { blurb: 'Everything nobody bothered to explain.' },
      },
    });
    const s = spec(config);
    const p = buildCoverPrompt(s);
    expect(s.copy.coverDescription).toBe('A Straight-Talking Guide');
    // It appears as copy to be painted...
    expect(p).toContain('FRONT — COVER LINE: "A Straight-Talking Guide"');
    // ...and never as a description of the scene.
    expect(p).not.toMatch(/scene evoking .*A Straight-Talking Guide/i);
    expect(p).not.toMatch(/environment.*A Straight-Talking Guide/i);
  });

  it('suppresses spine text under KDP\'s 79-page minimum, whoever sets the type', () => {
    // The page floor outranks the spine-type decision. Below it the model must
    // not letter the spine AND code must not typeset it afterwards.
    const thin = spec(book(), 40);
    expect(thin.spineTextAllowed).toBe(false);
    expect(buildCoverPrompt(thin)).toMatch(/SPINE — NO TEXT/);
    expect(buildCoverPrompt(thin)).not.toMatch(/LEAVE COMPLETELY EMPTY/);
  });

  it('asks the model to leave the spine empty when code sets the type', () => {
    const s = spec();
    expect(s.spineTypeSetBy).toBe('deterministic');
    expect(buildCoverPrompt(s)).toMatch(/SPINE — LEAVE COMPLETELY EMPTY/);
    expect(buildCoverPrompt(s)).not.toMatch(/SPINE — TITLE/);
  });

  it('still asks the model for spine type when that mode is chosen', () => {
    const s = buildCoverSpec({
      projectId: 'test', config: book(), pageCount: 154,
      pageCountSource: 'typeset', model: 'gpt-image-2', spineTypeSetBy: 'ai',
    });
    expect(buildCoverPrompt(s)).toMatch(/SPINE — TITLE/);
  });
});

describe('cover blueprint', () => {
  it('puts every text zone inside the safe area and inside the surviving crop', () => {
    const s = spec();
    const { safe } = s.geometry.modelPx;
    const surv = s.geometry.crop.survivingModelRect;
    for (const z of blueprintTextZones(s)) {
      expect(z.rect.x).toBeGreaterThanOrEqual(safe.x - 0.5);
      expect(z.rect.x + z.rect.w).toBeLessThanOrEqual(safe.x + safe.w + 0.5);
      expect(z.rect.x).toBeGreaterThanOrEqual(surv.x - 0.5);
      expect(z.rect.x + z.rect.w).toBeLessThanOrEqual(surv.x + surv.w + 0.5);
    }
  });

  it('is drawn at the model canvas size, not the wrap size', () => {
    const svg = buildCoverBlueprintSvg(spec());
    expect(svg).toContain(`width="${MODEL_CANVAS.widthPx}"`);
    expect(svg).toContain(`height="${MODEL_CANVAS.heightPx}"`);
  });

  it('carries no book-specific hardcoding', () => {
    const svg = buildCoverBlueprintSvg(spec(book({ title: 'A DIFFERENT BOOK' })));
    expect(svg).not.toContain('THE WILDLANDS');
    expect(svg).not.toContain('Wade Brannock');
    expect(svg).toContain('A DIFFERENT BOOK');
  });

  it('drops the spine zones when spine text is not allowed', () => {
    const labels = blueprintTextZones(spec(book(), 40)).map((z) => z.label);
    expect(labels.some((l) => l.startsWith('SPINE'))).toBe(false);
  });

  it('escapes XML so a title with an ampersand cannot break the SVG', () => {
    const svg = buildCoverBlueprintSvg(spec(book({ title: 'THIS & THAT' })));
    expect(svg).toContain('THIS &amp; THAT');
    expect(svg).not.toMatch(/THIS & THAT/);
  });
});

describe('cover preflight', () => {
  const run = (config: ProjectConfig, pageCount = 154) => {
    const s = spec(config, pageCount);
    return runCoverPreflight({ spec: s, config, prompt: buildCoverPrompt(s) });
  };

  it('passes this book and does not block it', () => {
    const r = run(book());
    const errors = r.checks.filter((c) => c.status === 'ERROR');
    expect(errors).toEqual([]);
    expect(r.blocked).toBe(false);
  });

  it('blocks when there is no interior to size the spine from', () => {
    const r = run(book(), 0);
    expect(r.blocked).toBe(true);
    expect(r.checks.find((c) => c.key === 'page_count')?.status).toBe('ERROR');
  });

  it('blocks a monochrome cover on a black-and-white interior', () => {
    // Force the cover to inherit the interior DNA, which is the original defect.
    const s = buildCoverSpec({
      projectId: 'test',
      config: book(),
      pageCount: 154,
      pageCountSource: 'typeset',
      model: 'gpt-image-2',
      editionStyleDnaId: 'bw-educational-clearline',
    });
    const r = runCoverPreflight({ spec: s, config: book(), prompt: buildCoverPrompt(s) });
    expect(r.blocked).toBe(true);
    expect(r.checks.find((c) => c.key === 'colour_mode')?.status).toBe('ERROR');
  });

  it('blocks when field-guide language leaks into another book class', () => {
    const s = spec();
    const r = runCoverPreflight({
      spec: s,
      config: book(),
      prompt: `${buildCoverPrompt(s)}\nThe page paper is parchment and all ink is warm sepia.`,
    });
    expect(r.blocked).toBe(true);
    expect(r.checks.find((c) => c.key === 'no_style_leakage')?.status).toBe('ERROR');
  });

  it('does not flag field-guide language on the field guide itself', () => {
    const fg = book({ productionProfileId: 'wildlands-field-guide' });
    const s = spec(fg);
    const r = runCoverPreflight({ spec: s, config: fg, prompt: 'parchment and sepia field guide' });
    expect(r.checks.find((c) => c.key === 'no_style_leakage')?.status).toBe('PASS');
  });

  it('warns rather than fails when KDP has no verified reading to compare against', () => {
    // No cream 5.5x8.5 paperback anchor exists, so this must not be an error.
    const check = run(book()).checks.find((c) => c.key === 'geometry_cross_check');
    expect(check?.status).toBe('WARNING');
    expect(check?.detail).toMatch(/cover-calculator/);
  });

  it('reports a cost with its provenance rather than asserting a price', () => {
    const r = run(book());
    expect(r.cost.estimatedUsd).toBeGreaterThan(0);
    expect(r.cost.basis).toMatch(/estimate/i);
  });
});
