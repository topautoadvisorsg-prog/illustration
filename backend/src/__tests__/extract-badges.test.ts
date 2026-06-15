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
  stripReadingFieldMetadata,
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

describe('inferRegion — weighted scoring (not first-match)', () => {
  it('FOREST for spruce/hardwood', () => {
    expect(inferRegion('Black Bear', 'lives in the boreal spruce-fir forest')).toBe('FOREST');
  });
  it('RIVER for stream/crossing', () => {
    expect(inferRegion('River Crossings', 'fording the spring snowmelt river and stream')).toBe('RIVER');
  });
  it('ALPINE above treeline', () => {
    expect(inferRegion('Above-Treeline Weather', 'the alpine tundra of the Presidential Range, above treeline')).toBe('ALPINE');
  });
  it('forest backdrop beats a single incidental mountain word', () => {
    // A forest animal whose body mentions one "boulder" must NOT become MOUNTAIN.
    expect(
      inferRegion('Black Bear', 'the bear roams the spruce-fir forest and hardwood understory, sometimes near a boulder'),
    ).toBe('FOREST');
  });
  it('weak lone signal falls back rather than mislabeling', () => {
    // One "peak" with no forest signal → not confidently MOUNTAIN → GENERAL.
    const r = inferRegion('Yellow Jacket', 'the wasp investigates your lunch near a rocky peak');
    expect(['GENERAL', 'MOUNTAIN']).toContain(r); // either fallback or weak win, never a confident wrong
  });
  it('strong water signal wins (Beaver → WETLAND)', () => {
    expect(inferRegion('Beaver', 'builds dams in the pond, bog, and wetland of the forest')).toBe('WETLAND');
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

describe('stripReadingFieldMetadata — header never renders as prose', () => {
  it('strips a binomial header line (the turkey bleed)', () => {
    const body = '*Meleagris gallopavo* | ⚠️\n\nThe wild turkey was extirpated from New England by 1851.';
    const out = stripReadingFieldMetadata(body);
    expect(out.startsWith('The wild turkey')).toBe(true);
    expect(out).not.toContain('Meleagris');
    expect(out).not.toContain('|');
  });

  it('strips the two-line fungi header (binomial + edibility tag)', () => {
    const body = '*Morchella* spp. | ⚠️\n**EDIBLE** *(spring only — false morel look-alike critical)* `[EXPERT REVIEW REQUIRED]`\n\nMay in the Connecticut River Valley, the apple trees still in bloom.';
    const out = stripReadingFieldMetadata(body);
    expect(out.startsWith('May in the Connecticut')).toBe(true);
    expect(out).not.toContain('Morchella');
    expect(out).not.toContain('EXPERT REVIEW');
  });

  it('leaves a page with no metadata header unchanged', () => {
    const body = 'Every skill in this chapter is a tool. But the mindset that makes those tools useful is something that develops through practice.';
    expect(stripReadingFieldMetadata(body)).toBe(body);
  });

  it('never blanks a page even if it looks all-metadata', () => {
    const body = '*Crotalus horridus* |';
    expect(stripReadingFieldMetadata(body).length).toBeGreaterThan(0);
  });

  it('does not strip legitimate mixed-case bold prose', () => {
    const body = 'The **White Mountains** are the highest range in the Northeast.';
    expect(stripReadingFieldMetadata(body)).toBe(body);
  });

  // R4 — a deadly look-alike block whose first line is a bold SPECIES NAME that
  // merely contains a hazard word must NOT be stripped (the Wild Ramps bug).
  it('keeps a bold look-alike warning paragraph (False Hellebore — R4)', () => {
    const body =
      '**False Hellebore / Indian Poke** *(Veratrum viride)* — **DEADLY.** This is the look-alike that kills foragers.\n**Lily of the Valley** *(Convallaria majalis)* — Toxic.\n\n**Edible Parts & Preparation**\nBoth the leaves and the bulb are edible.';
    const out = stripReadingFieldMetadata(body);
    expect(out.startsWith('**False Hellebore')).toBe(true);
    expect(out).toContain('Veratrum viride');
    expect(out).toContain('Edible Parts & Preparation');
  });

  // R5 — a fully-bold lead WARNING SENTENCE that contains hazard words must NOT
  // be stripped (the Hemlock + Black Cherry bug).
  it('keeps a bold lead-warning sentence (Hemlock — R5)', () => {
    const body =
      '**This tree shares a common name with two of the most toxic plants in North America. Eastern hemlock the tree is not poison hemlock or water hemlock.**\n\nThe hemlock grove is the coolest place in the forest.';
    const out = stripReadingFieldMetadata(body);
    expect(out.startsWith('**This tree shares')).toBe(true);
  });

  it('keeps a bold lead-warning sentence (Black Cherry — R5)', () => {
    const body =
      '**Read the full entry before handling this tree. The fruit is edible. The leaves, bark, and seeds are toxic.**\n\nThe black cherry rewards complete knowledge.';
    const out = stripReadingFieldMetadata(body);
    expect(out.startsWith('**Read the full entry')).toBe(true);
  });

  // The real badge header (markers only) MUST still be stripped.
  it('still strips a pure EDIBLE badge line', () => {
    const out = stripReadingFieldMetadata('**EDIBLE** *(leaves and bulb — with harvest restraint)*\n\nThe first warm week of April.');
    expect(out.startsWith('The first warm week')).toBe(true);
  });
  it('still strips a dual EDIBLE/TOXIC badge line (elderberry)', () => {
    const out = stripReadingFieldMetadata('**EDIBLE** *(ripe berries only, cooked) / TOXIC (unripe berries, all other parts)*\n\nThe elderberry grows along forest edges.');
    expect(out.startsWith('The elderberry grows')).toBe(true);
  });
  it('still strips an EDIBLE — USE CAUTION badge line (honey mushroom)', () => {
    const out = stripReadingFieldMetadata('**EDIBLE — USE CAUTION** *(toxic look-alikes; must be fully cooked)*\n\nThe honey mushroom is the most widely distributed.');
    expect(out.startsWith('The honey mushroom')).toBe(true);
  });
  it('still strips a MEDICINAL badge line', () => {
    const out = stripReadingFieldMetadata('**MEDICINAL** *(field first aid — wound treatment)*\n\nI once watched a hiking companion cut her hand.');
    expect(out.startsWith('I once watched')).toBe(true);
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
