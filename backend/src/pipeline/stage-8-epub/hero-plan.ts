/**
 * Hero image plan for the Kindle EPUB. Reads the mapping written by
 * scripts/embed-heroes-prep.ts (storage: <projectId>/heroes/mapping.json) and
 * turns it into entryKey/section → { storage kindle key, alt text }. Both the
 * EPUB export (build-epub) and the in-console preview consume this; they only
 * differ in how they turn a kindle key into an <img src> (temp file vs API URL).
 *
 * Alt text (accessibility — KDP checks this):
 *   entry hero   → entry title (+ scientific name when present)
 *   section hero → section purpose
 *   frontispiece → the book's opening-illustration description
 */
import { getProjectStorage } from '../../services/storage/project-storage.js';
import type { HeroAssembleInput, HeroRef } from './assemble-epub.js';

export interface HeroEntryPlan { heroId: string; kindleKey: string; alt: string; }
export interface HeroPlan {
  /** entryKey → hero */
  entries: Map<string, HeroEntryPlan>;
  /** 'INTRODUCTION' | 'GLOSSARY' | 'ABOUT' → hero */
  sections: Map<string, HeroEntryPlan>;
  /** Front opening illustration (reused print half-title), if available. */
  frontispiece?: HeroEntryPlan;
  counts: { entries: number; sections: number; frontispiece: boolean };
}

interface RawMapping {
  entries: { readingOrder: number; entryKey: string; title: string; scientificName: string | null; heroId: string; kindleKey: string | null }[];
  sections: { section: string; heroId: string; kindleKey: string | null }[];
  /** Either a legacy label string (no embed) or a resolved frontispiece. */
  frontispiece?: string | { heroId: string; kindleKey: string | null; alt?: string };
}

const SECTION_LABEL: Record<string, string> = {
  introduction: 'INTRODUCTION',
  glossary: 'GLOSSARY',
  'about-series': 'ABOUT',
};
const SECTION_ALT: Record<string, string> = {
  introduction: 'Introduction — a forest trail opening into the wild at first light.',
  glossary: 'Glossary — a naturalist’s field desk with journal, feather, and hand lens.',
  'about-series': 'About the Series — a field journal and lantern by a campfire under the stars.',
};

/** Load the hero plan from storage. Returns an EMPTY plan (heroMode stays OFF)
 *  if no mapping has been imported yet — so the EPUB still builds text-only. */
export async function loadHeroPlan(projectId: string): Promise<HeroPlan> {
  const empty: HeroPlan = { entries: new Map(), sections: new Map(), counts: { entries: 0, sections: 0, frontispiece: false } };
  let raw: RawMapping;
  try {
    const bytes = await getProjectStorage().readProjectFile(`${projectId}/heroes/mapping.json`);
    raw = JSON.parse(bytes.toString('utf8')) as RawMapping;
  } catch {
    return empty;
  }

  const entries = new Map<string, HeroEntryPlan>();
  for (const e of raw.entries) {
    if (!e.kindleKey) continue;
    const alt = e.scientificName ? `${e.title} (${e.scientificName})` : e.title;
    entries.set(e.entryKey, { heroId: e.heroId, kindleKey: e.kindleKey, alt });
  }

  const sections = new Map<string, HeroEntryPlan>();
  for (const s of raw.sections) {
    if (!s.kindleKey) continue;
    const label = SECTION_LABEL[s.section];
    if (!label) continue;
    sections.set(label, { heroId: s.heroId, kindleKey: s.kindleKey, alt: SECTION_ALT[s.section] ?? s.section });
  }

  let frontispiece: HeroEntryPlan | undefined;
  const fp = raw.frontispiece;
  if (fp && typeof fp === 'object' && fp.kindleKey) {
    frontispiece = {
      heroId: fp.heroId,
      kindleKey: fp.kindleKey,
      alt: fp.alt ?? 'The Wildlands — opening illustration: a misty boreal pond at sunrise.',
    };
  }

  return {
    entries,
    sections,
    frontispiece,
    counts: { entries: entries.size, sections: sections.size, frontispiece: Boolean(frontispiece) },
  };
}

/** Build the assembler's hero input for the in-CONSOLE PREVIEW: each <img src>
 *  points at the hero-serving route (the live backend streams the JPEG from R2).
 *  Returns undefined when nothing is imported (preview stays text-only). */
export function heroAssembleInputForPreview(plan: HeroPlan, projectId: string): HeroAssembleInput | undefined {
  if (plan.entries.size === 0 && plan.sections.size === 0 && !plan.frontispiece) return undefined;
  const url = (heroId: string) => `/api/projects/${projectId}/export/kindle-epub/hero/${heroId}`;
  const map = (src: Map<string, HeroEntryPlan>): Map<string, HeroRef> => {
    const out = new Map<string, HeroRef>();
    for (const [k, h] of src) out.set(k, { src: url(h.heroId), alt: h.alt });
    return out;
  };
  return {
    entries: map(plan.entries),
    sections: map(plan.sections),
    frontispiece: plan.frontispiece ? { src: url(plan.frontispiece.heroId), alt: plan.frontispiece.alt } : undefined,
  };
}
