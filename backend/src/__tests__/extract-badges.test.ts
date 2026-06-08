/**
 * Subject + Badge extractor — deterministic, no AI, no DB.
 *
 * Verifies the core rule: warnings/markup never leak into cleanSubject, and the
 * hazard/region/source data is preserved as structured fields. Uses inputs that
 * mirror the real manifest body headers (*Binomial* | markers).
 */

import { describe, expect, it } from 'vitest';
import {
  cleanTitle,
  extractBinomial,
  detectHazards,
  inferRegion,
  composeBadgeSet,
  extractBadgeMetadata,
} from '../pipeline/subject-badges/extract-badges.js';

describe('cleanTitle — strips numbering, emoji, editorial tags', () => {
  it('drops list numbering', () => {
    expect(cleanTitle('22. Black-Legged Tick / Deer Tick')).toBe('Black-Legged Tick / Deer Tick');
  });
  it('drops Hazard N — prefix', () => {
    expect(cleanTitle('Hazard 3 — Moose')).toBe('Moose');
  });
  it('strips ☠️ DEADLY tags', () => {
    expect(cleanTitle('10. Destroying Angel ☠️ DEADLY')).toBe('Destroying Angel');
  });
  it('strips PRIORITY ENTRY and emoji', () => {
    expect(cleanTitle('22. Black-Legged Tick ⚠️ PRIORITY ENTRY')).toBe('Black-Legged Tick');
  });
  it('strips multi-tag toxic plant titles', () => {
    expect(cleanTitle('20. Wild Parsnip ⚠️ BURNS — PHOTOTOXIC')).toBe('Wild Parsnip');
  });
});

describe('extractBinomial — reads the body first line', () => {
  it('parses *Genus species*', () => {
    expect(extractBinomial('*Cicuta maculata* | ☠️\n...')).toBe('Cicuta maculata');
  });
  it('parses *Genus* spp.', () => {
    expect(extractBinomial('*Morchella* spp. | ⚠️\n...')).toBe('Morchella spp.');
  });
  it('returns null when no binomial', () => {
    expect(extractBinomial('To walk the wilds of New England...')).toBeNull();
  });
});

describe('detectHazards — preserves the warning, most-severe-first', () => {
  it('DEADLY from skull', () => {
    expect(detectHazards('Destroying Angel', '*Amanita bisporigera* | ☠️')).toContain('DEADLY');
  });
  it('EDIBLE + EXPERT_REVIEW for a morel (multiple non-contradictory)', () => {
    const h = detectHazards('7. Morel', '*Morchella* spp. | ⚠️\n**EDIBLE** *(false morel look-alike critical)*');
    expect(h).toContain('EDIBLE');
    expect(h).toContain('EXPERT_REVIEW');
  });
  it('resolves contradiction: never DEADLY + EDIBLE together', () => {
    const h = detectHazards('Test', 'DEADLY but also EDIBLE');
    expect(h).toContain('DEADLY');
    expect(h).not.toContain('EDIBLE');
  });
  it('NONE when nothing applies', () => {
    expect(detectHazards('Sugar Maple', '*Acer saccharum* | a common tree')).toEqual(['NONE']);
  });
});

describe('inferRegion — habitat scan (correct use)', () => {
  it('FOREST for spruce/hardwood', () => {
    expect(inferRegion('Black Bear', 'lives in the boreal spruce-fir forest')).toBe('FOREST');
  });
  it('RIVER for stream/crossing', () => {
    expect(inferRegion('River Crossings', 'fording the spring snowmelt river')).toBe('RIVER');
  });
  it('ALPINE above treeline', () => {
    expect(inferRegion('Above-Treeline Weather', 'the alpine tundra of the Presidential Range')).toBe('ALPINE');
  });
});

describe('composeBadgeSet — ordered region, hazard, source', () => {
  it('orders families and drops NONE hazards', () => {
    const set = composeBadgeSet('FOREST', ['DEADLY'], 'GENERAL_REFERENCE');
    expect(set.map((b) => b.family)).toEqual(['region', 'hazard', 'source']);
    const none = composeBadgeSet('FOREST', ['NONE'], 'GENERAL_REFERENCE');
    expect(none.map((b) => b.family)).toEqual(['region', 'source']);
  });
});

describe('extractBadgeMetadata — the five flagged offenders resolve', () => {
  const cases = [
    { title: 'Hazard 3 — Moose', body: 'A moose is not a large deer. *Alces alces* roams the boreal forest.', wantSubjectIncludes: 'Moose', wantHazard: 'AGGRESSIVE' },
    { title: '23. Yellow Jacket', body: '*Vespula* spp. | ⚠️\nThe sting is incidental. open meadow and forest edge.', wantSubjectIncludes: 'Yellow Jacket', wantHazard: 'CAUTION' },
    { title: '7. Morel', body: '*Morchella* spp. | ⚠️\n**EDIBLE** *(false morel look-alike critical)*', wantSubjectIncludes: 'Morel', wantHazard: 'EDIBLE' },
    { title: '8. Honey Mushroom', body: '*Armillaria* spp. | ⚠️\n**EDIBLE — USE CAUTION** *(toxic look-alikes)*', wantSubjectIncludes: 'Honey Mushroom', wantHazard: 'EDIBLE' },
    { title: '14. False Morel ⚠️ TOXIC / DEADLY', body: '*Gyromitra* spp. | ☠️ deadly in the hardwood forest', wantSubjectIncludes: 'False Morel', wantHazard: 'DEADLY' },
  ];
  for (const c of cases) {
    it(`${c.title} → clean subject + hazard preserved`, () => {
      const m = extractBadgeMetadata({ entryTitle: c.title, bodyMarkdown: c.body, imageSubject: 'OLD' });
      expect(m.cleanSubject).toContain(c.wantSubjectIncludes);
      expect(m.hazard).toContain(c.wantHazard);
      // The core rule: NO editorial markup leaks into the subject.
      expect(m.cleanSubject).not.toMatch(/DEADLY|TOXIC|PRIORITY|⚠|☠|\bCAUTION\b/);
    });
  }

  it('clean species subject composes "Common (Binomial)"', () => {
    const m = extractBadgeMetadata({ entryTitle: '1. Black Bear', bodyMarkdown: '*Ursus americanus* | ⚠️', imageSubject: 'x' });
    expect(m.cleanSubject).toBe('Black Bear (Ursus americanus)');
    expect(m.region).toBe('GENERAL'); // no habitat nouns in this tiny body
  });
});
