/**
 * Book intake + the pre-spend readiness gate.
 *
 * The behaviours worth pinning are the ones that cost money when they are
 * wrong: a brief that names a profile the registry does not have must be
 * REFUSED rather than silently turned into a field guide, and re-posting the
 * same brief must not make a second book.
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';

import { briefHash, configFromBrief, resolveTrim, type IntakeBody } from '../api/books.routes.js';
import { countNumberedEntries } from '../pipeline/readiness/audit-readiness.js';
import { getProductionProfile, isKnownProductionProfile } from '../pipeline/production-profiles/registry.js';
import { TYPESET_LAYOUT_STANDARDS } from '../pipeline/typeset/layout-standards/registry.js';
import { bundledFontCss } from '../pipeline/typeset/font-assets.js';

const brief = (over: Record<string, unknown> = {}) => ({
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  volume: 1,
  trimPreset: '5.5x8.5' as const,
  paperStock: 'cream' as const,
  productionProfileId: 'bw-educational-nonfiction',
  ...over,
});

const body = (over: Partial<IntakeBody> = {}): IntakeBody =>
  ({ brief: brief(), setupOnly: false, ...over }) as IntakeBody;

describe('brief → config', () => {
  it('produces a config the real schema accepts', () => {
    const cfg = configFromBrief(brief());
    expect(() => ProjectConfigSchema.parse(cfg)).not.toThrow();
    expect(cfg.trimSize).toEqual({ widthIn: 5.5, heightIn: 8.5, bleedIn: 0 });
    expect(cfg.productionProfileId).toBe('bw-educational-nonfiction');
  });

  it('lets an explicit trimSize win over the preset', () => {
    const cfg = configFromBrief(brief({ trimPreset: '6x9', trimSize: { widthIn: 7, heightIn: 10, bleedIn: 0.125 } }));
    expect(cfg.trimSize.widthIn).toBe(7);
  });

  it('refuses a brief with no trim at all rather than guessing one', () => {
    expect(() => resolveTrim(brief({ trimPreset: undefined }) as never)).toThrow(/trimPreset or an explicit trimSize/);
  });

  /**
   * The whole point of the 422: `getProductionProfile` falls back to the field
   * guide on an unknown id, so without an explicit check the operator gets a
   * different book and no error.
   */
  it('the registry can tell a real profile from a typo', () => {
    expect(isKnownProductionProfile('bw-educational-nonfiction')).toBe(true);
    expect(isKnownProductionProfile('bw-educatoinal-nonfiction')).toBe(false);
  });
});

describe('intake idempotency', () => {
  it('hashes the same brief to the same value', () => {
    expect(briefHash(body())).toBe(briefHash(body()));
  });

  it('changes the hash when the brief changes', () => {
    expect(briefHash(body())).not.toBe(briefHash(body({ brief: brief({ title: 'Something Else' }) } as Partial<IntakeBody>)));
  });

  it('changes the hash when the manuscript changes but the brief does not', () => {
    const a = body({ manuscript: { filename: 'b.md', markdown: '# One' } } as Partial<IntakeBody>);
    const b = body({ manuscript: { filename: 'b.md', markdown: '# Two' } } as Partial<IntakeBody>);
    expect(briefHash(a)).not.toBe(briefHash(b));
  });

  /**
   * The config schema is not `.strict()`, so an undeclared key is STRIPPED
   * rather than rejected. If `intake` were not a declared field the hash would
   * vanish on the first parse and every retry would create another book.
   */
  it('survives a schema round-trip, or idempotency is silently dead', () => {
    const cfg = ProjectConfigSchema.parse({
      ...configFromBrief(brief()),
      intake: { briefHash: 'abc123', takenInAt: '2026-08-13T00:00:00Z' },
    });
    expect(cfg.intake?.briefHash).toBe('abc123');
  });
});

/**
 * The gate must not cry wolf.
 *
 * The first live run reported BLOCKED on NO ONE TOLD ME THAT — a book that was
 * already printed — because it demanded breakdown manifests and paginated page
 * rows of every project. Those belong to the AI whole-page track. A typeset
 * book goes manuscript → Paged.js and legitimately has neither. A gate that
 * fails a shipped book is a gate the operator learns to ignore.
 */
describe('track-aware checks', () => {
  it('the two tracks are distinguishable from the profile alone', () => {
    expect(getProductionProfile('bw-educational-nonfiction').bodyRenderTrack).toBe('typeset');
    expect(getProductionProfile('wildlands-field-guide').bodyRenderTrack).toBe('ai-whole-page');
  });

  it('the typeset profile names both font roles, so the vendored-face check has something to check', () => {
    const standard = TYPESET_LAYOUT_STANDARDS[getProductionProfile('bw-educational-nonfiction').typesetLayoutStandardId!];
    expect(standard?.type.headingFont).toBeTruthy();
    expect(standard?.type.bodyFont).toBeTruthy();
  });

  it('every face the typeset standard names is vendored, not fetched at render time', () => {
    const standard = TYPESET_LAYOUT_STANDARDS[getProductionProfile('bw-educational-nonfiction').typesetLayoutStandardId!]!;
    const { missing } = bundledFontCss([standard.type.headingFont, standard.type.bodyFont]);
    expect(missing).toEqual([]);
  });
});

describe('entry parity counting', () => {
  it('counts numbered entry headings at any heading level', () => {
    const md = ['## 1. Black Bear', '### 2. Grey Wolf', '#### 3) Elk', '## Not An Entry'].join('\n');
    expect(countNumberedEntries(md)).toBe(3);
  });

  /**
   * A chapter book legitimately has no numbered entries. Reporting that as a
   * failure would train the operator to ignore the report, so the audit treats
   * zero as "nothing to compare", not "broken".
   */
  it('returns zero for a manuscript that does not use numbered entries', () => {
    expect(countNumberedEntries('# Chapter One\n\nSome prose.\n\n## A Section\n')).toBe(0);
  });

  it('does not count a numbered list item as an entry heading', () => {
    expect(countNumberedEntries('1. first thing\n2. second thing\n')).toBe(0);
  });

  /**
   * Measured on the shipped New England manuscript: 75 numbered catalog entries
   * among 178 h3 headings, producing 127 entry rows. Hazards, primers and other
   * unnumbered sections legitimately become entries. An equality check called
   * that book BLOCKED — it is on sale. The rule is a floor, not equality.
   */
  it('counts only numbered headings, not every heading — the two differ by design', () => {
    const md = [
      '## INTRODUCTION',
      '### Welcome to the Wilderness',
      '### Hazard 1 — Extreme Weather',
      '## THE CATALOG',
      '### 1. Black Bear',
      '### 2. Grey Wolf',
    ].join('\n');
    expect(countNumberedEntries(md)).toBe(2);
    // Four other headings exist and may each become an entry; that is not a defect.
    expect((md.match(/^#{2,3}\s+\S/gm) ?? []).length).toBe(6);
  });
});
