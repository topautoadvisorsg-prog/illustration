/**
 * Phase A — derive first-class ENTRIES from existing pages + manifests (PURE).
 *
 * An entry = one BODY opener page + its continuations, grouped by `entryKey`. This
 * mirrors EXACTLY how the Kindle builder (assemble-epub.ts) groups body pages, so an
 * entries-sourced build produces identical output. No I/O, no DB — fully testable.
 *
 * READ-ONLY intent: this only reads page content; it changes no pages/renders/print.
 */

import { markdownToBlocks } from '../whole-page-render/markdown-blocks.js';
import { extractBinomial, stripReadingFieldMetadata } from '../subject-badges/extract-badges.js';

/** Minimal page shape needed to derive an entry (subset of the `pages` row). */
export interface DeriveSourcePage {
  pageKey: string;
  chapterNumber: number;
  plannedPageNumber: number;
  section: string; // FRONT_MATTER | BODY | BACK_MATTER
  entryKey?: string | null;
  pageRole: string; // opener | continuation | compacted
  readingFieldText?: string | null;
}

/** Per-entry manifest metadata (entryKey → …). */
export interface EntryMetaInput {
  entryTitle?: string;
  contentType?: string;
}

export interface DeriveEntriesInput {
  pages: DeriveSourcePage[];
  /** chapterNumber → chapter title (from CHAPTER manifests). */
  chapterTitles: Map<number, string>;
  /** entryKey → { entryTitle, contentType } (from PAGE manifests). */
  entryMeta: Map<string, EntryMetaInput>;
}

/** A derived entry record (DB columns minus id/projectId/timestamps). */
export interface DerivedEntry {
  entryKey: string;
  chapterNumber: number;
  chapterTitle: string | null;
  entryTitle: string;
  scientificName: string | null;
  section: 'BODY';
  entryType: string | null;
  firstPageKey: string;
  pageKeys: string[];
  pageCount: number;
  readingOrder: number;
  wordCount: number;
}

function wordCount(s: string): number {
  const t = (s ?? '').trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Group BODY pages into entries in the exact order the Kindle builder uses:
 * chapters ascending; within a chapter, pages by plannedPageNumber; group by
 * `entryKey` (first-seen). Skips a group that has neither title nor text.
 */
export function deriveEntries(input: DeriveEntriesInput): DerivedEntry[] {
  const { pages, chapterTitles, entryMeta } = input;
  const body = pages.filter((p) => p.section === 'BODY');
  const chapterNums = [...new Set(body.map((p) => p.chapterNumber))].sort((a, b) => a - b);

  const out: DerivedEntry[] = [];
  let order = 0;
  for (const chNum of chapterNums) {
    const chPages = body.filter((p) => p.chapterNumber === chNum).sort((a, b) => a.plannedPageNumber - b.plannedPageNumber);
    const seen: string[] = [];
    const groups = new Map<string, DeriveSourcePage[]>();
    for (const p of chPages) {
      const key = p.entryKey ?? p.pageKey;
      if (!groups.has(key)) { groups.set(key, []); seen.push(key); }
      groups.get(key)!.push(p);
    }
    for (const key of seen) {
      const grp = groups.get(key)!;
      const meta = entryMeta.get(key) ?? entryMeta.get(grp[0]!.pageKey) ?? {};
      const title = meta.entryTitle || '';
      const raw = grp.map((p) => (p.readingFieldText ?? '').trim()).filter(Boolean).join('\n\n');
      if (!raw && !title) continue; // matches assemble-epub: skip empty+titleless
      const cleaned = stripReadingFieldMetadata(raw);
      // Touch markdownToBlocks so wordCount reflects the rendered body (parity w/ builder).
      const blockText = markdownToBlocks(cleaned).map((b) => b.text).join(' ');
      order += 1;
      out.push({
        entryKey: key,
        chapterNumber: chNum,
        chapterTitle: chapterTitles.get(chNum) ?? null,
        entryTitle: title || 'Untitled',
        scientificName: extractBinomial(raw) ?? null,
        section: 'BODY',
        entryType: meta.contentType ?? null,
        firstPageKey: grp[0]!.pageKey,
        pageKeys: grp.map((p) => p.pageKey),
        pageCount: grp.length,
        readingOrder: order,
        wordCount: wordCount(blockText),
      });
    }
  }
  return out;
}

export interface EntryValidationReport {
  passed: boolean;
  entryCount: number;
  bodyOpeners: number;
  checks: { name: string; passed: boolean; detail: string }[];
}

/** Verify the derived entries against the body pages (the Phase A invariants). */
export function validateEntries(entries: DerivedEntry[], pages: DeriveSourcePage[]): EntryValidationReport {
  const body = pages.filter((p) => p.section === 'BODY');
  const checks: EntryValidationReport['checks'] = [];
  const keySet = new Set(entries.map((e) => e.entryKey));

  // 1. no duplicate entryKeys
  const dupes = entries.length - keySet.size;
  checks.push({ name: 'no duplicate entryKeys', passed: dupes === 0, detail: dupes === 0 ? 'unique' : `${dupes} duplicate(s)` });

  // 2. every BODY opener maps to exactly one entry
  const openers = body.filter((p) => p.pageRole === 'opener');
  const openersMapped = openers.filter((p) => keySet.has(p.entryKey ?? p.pageKey));
  checks.push({
    name: 'every body opener maps to one entry',
    passed: openersMapped.length === openers.length,
    detail: `${openersMapped.length}/${openers.length} openers mapped`,
  });

  // 3. continuations attach to the correct entry (their entryKey is a known entry)
  const conts = body.filter((p) => p.pageRole !== 'opener');
  const contsAttached = conts.filter((p) => keySet.has(p.entryKey ?? p.pageKey));
  checks.push({
    name: 'continuations attach to correct entry',
    passed: contsAttached.length === conts.length,
    detail: `${contsAttached.length}/${conts.length} continuations attached`,
  });

  // 4. no orphan body pages (every body page belongs to an entry)
  const orphans = body.filter((p) => !keySet.has(p.entryKey ?? p.pageKey));
  checks.push({ name: 'no orphan body pages', passed: orphans.length === 0, detail: orphans.length === 0 ? 'none' : `${orphans.length}: ${orphans.slice(0, 5).map((p) => p.pageKey).join(', ')}` });

  // 5. entries ordered correctly (readingOrder is 1..N contiguous, ascending)
  const orders = entries.map((e) => e.readingOrder);
  const contiguous = orders.every((o, i) => o === i + 1);
  checks.push({ name: 'reading order is 1..N contiguous', passed: contiguous, detail: contiguous ? `1..${entries.length}` : `gaps in ${orders.slice(0, 8).join(',')}…` });

  // 6. pageCount + pageKeys consistent
  const countOk = entries.every((e) => e.pageCount === e.pageKeys.length && e.pageCount >= 1);
  checks.push({ name: 'pageCount matches pageKeys', passed: countOk, detail: countOk ? 'consistent' : 'mismatch' });

  return {
    passed: checks.every((c) => c.passed),
    entryCount: entries.length,
    bodyOpeners: openers.length,
    checks,
  };
}
