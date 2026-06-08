/**
 * Badge System (STD-2) — renderer + contract tests.
 *
 * Locks: Rule Zero (no hardcoded hex in the renderer source; colour from the
 * Standard), every value renders valid SVG with the right token, and the
 * stamping contract's ordering / corners / max-2-hazard cap.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HAZARD_BADGES,
  REGION_BADGES,
  SOURCE_BADGES,
  PALETTE,
  renderBadgeSvg,
  renderRegionBadge,
  renderHazardBadge,
  renderSourceBadge,
  badgesForPage,
  MAX_HAZARD_BADGES_PER_PAGE,
} from '../pipeline/publishing-standard/index.js';
import type { Badge } from '@wildlands/shared';

const REGION_VALUES = Object.keys(REGION_BADGES) as Array<keyof typeof REGION_BADGES>;
const HAZARD_VALUES = Object.keys(HAZARD_BADGES) as Array<keyof typeof HAZARD_BADGES>;
const SOURCE_VALUES = Object.keys(SOURCE_BADGES) as Array<keyof typeof SOURCE_BADGES>;

describe('Rule Zero — renderer hardcodes no colour', () => {
  it('render-badge.ts source contains no literal #hex (all colour via Standard tokens)', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(
      path.resolve(__dirname, '../pipeline/publishing-standard/badges/render-badge.ts'),
      'utf8',
    );
    // Strip the doc comment examples are fine; assert no 6-digit hex literal in code.
    const hexMatches = src.match(/#[0-9A-Fa-f]{6}/g) ?? [];
    expect(hexMatches).toEqual([]);
  });
});

describe('renderRegionBadge — every region value', () => {
  for (const v of REGION_VALUES) {
    it(`${v} → valid SVG with ring token + label`, () => {
      const out = renderRegionBadge(v);
      expect(out.startsWith('<svg')).toBe(true);
      expect(out).toContain(REGION_BADGES[v].colorHex); // ring colour from Standard
      expect(out).toContain(PALETTE.ink.hex); // icon/label in ink
      expect(out).toContain(REGION_BADGES[v].label); // small-caps label
    });
  }
});

describe('renderHazardBadge — every hazard value', () => {
  for (const v of HAZARD_VALUES) {
    it(`${v} → shield with hazard token (NONE → empty)`, () => {
      const out = renderHazardBadge(v);
      if (v === 'NONE') {
        expect(out).toBe('');
      } else {
        expect(out.startsWith('<svg')).toBe(true);
        expect(out).toContain(HAZARD_BADGES[v].colorHex);
      }
    });
  }
});

describe('renderSourceBadge — every source value', () => {
  const expectLetter: Record<string, string> = {
    SCIENTIFIC_LITERATURE: '>S<', FIELD_GUIDE: '>F<', TRADITIONAL_USE: '>T<',
    HISTORICAL_SOURCE: '>H<', GENERAL_REFERENCE: '>G<',
  };
  for (const v of SOURCE_VALUES) {
    it(`${v} → seal with lettermark ${expectLetter[v]}`, () => {
      const out = renderSourceBadge(v);
      expect(out.startsWith('<svg')).toBe(true);
      expect(out).toContain(expectLetter[v]);
      expect(out).toContain(PALETTE.ink.hex);
    });
  }
});

describe('renderBadgeSvg — dispatch', () => {
  it('routes by family', () => {
    expect(renderBadgeSvg('region', 'FOREST')).toBe(renderRegionBadge('FOREST'));
    expect(renderBadgeSvg('hazard', 'DEADLY')).toBe(renderHazardBadge('DEADLY'));
    expect(renderBadgeSvg('source', 'FIELD_GUIDE')).toBe(renderSourceBadge('FIELD_GUIDE'));
  });
});

describe('badgesForPage — contract (corners, order, cap)', () => {
  const mk = (region: string, hazards: string[], source: string): Badge[] => [
    { family: 'region', value: region },
    ...hazards.map((h) => ({ family: 'hazard' as const, value: h })),
    { family: 'source', value: source },
  ];

  it('region → bottom-left; source → bottom-right', () => {
    const out = badgesForPage(mk('FOREST', ['NONE'], 'GENERAL_REFERENCE'));
    expect(out.find((b) => b.family === 'region')?.corner).toBe('bottom-left');
    expect(out.find((b) => b.family === 'source')?.corner).toBe('bottom-right');
  });

  it('NONE hazard is omitted (clean corner)', () => {
    const out = badgesForPage(mk('FOREST', ['NONE'], 'GENERAL_REFERENCE'));
    expect(out.some((b) => b.family === 'hazard')).toBe(false);
  });

  it('hazards sort most-severe-first and cap at 2', () => {
    // EDIBLE(low) + EXPERT_REVIEW + DEADLY(high) → keep DEADLY, EXPERT_REVIEW.
    const out = badgesForPage(mk('FOREST', ['EDIBLE', 'EXPERT_REVIEW', 'DEADLY'], 'SCIENTIFIC_LITERATURE'));
    const hz = out.filter((b) => b.family === 'hazard');
    expect(hz.length).toBe(MAX_HAZARD_BADGES_PER_PAGE);
    expect(hz[0]?.value).toBe('DEADLY'); // most severe, outermost
    expect(hz[1]?.value).toBe('EXPERT_REVIEW');
    expect(hz.map((b) => b.value)).not.toContain('EDIBLE'); // least severe dropped
  });

  it('source order sits after the hazards', () => {
    const out = badgesForPage(mk('RIVER', ['DEADLY', 'CAUTION'], 'TRADITIONAL_USE'));
    const source = out.find((b) => b.family === 'source')!;
    expect(source.order).toBe(2); // two hazards before it
  });

  it('handles an empty/undefined badgeSet', () => {
    expect(badgesForPage(undefined)).toEqual([]);
    expect(badgesForPage([])).toEqual([]);
  });
});
