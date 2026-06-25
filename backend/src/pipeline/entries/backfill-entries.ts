/**
 * Phase A — backfill the entries layer for a project. READ-ONLY against pages +
 * manifests; the only write is to the `entries` table (idempotent replace).
 * Changes no pages, no renders, no print output.
 */

import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client.js';
import { manifests } from '../../db/schema/index.js';
import { listPaginatedPagesForProject } from '../../db/repositories/pagination.repo.js';
import { replaceProjectEntries } from '../../db/repositories/entries.repo.js';
import {
  deriveEntries,
  validateEntries,
  type DeriveSourcePage,
  type EntryMetaInput,
  type DerivedEntry,
  type EntryValidationReport,
} from './derive-entries.js';

/** Load the inputs (pages + chapter/page manifests) the derivation needs. */
async function loadDeriveInputs(projectId: string): Promise<{
  pages: DeriveSourcePage[];
  chapterTitles: Map<number, string>;
  entryMeta: Map<string, EntryMetaInput>;
}> {
  const pageRows = await listPaginatedPagesForProject(projectId);
  const pages: DeriveSourcePage[] = pageRows.map((p) => ({
    pageKey: p.pageKey,
    chapterNumber: p.chapterNumber,
    plannedPageNumber: p.plannedPageNumber,
    section: p.section,
    entryKey: p.entryKey,
    pageRole: p.pageRole,
    readingFieldText: p.readingFieldText,
  }));

  const db = getDb();
  const chMans = await db
    .select({ content: manifests.content })
    .from(manifests)
    .where(and(eq(manifests.projectId, projectId), eq(manifests.kind, 'CHAPTER')));
  const chapterTitles = new Map<number, string>();
  for (const m of chMans) {
    const c = m.content as { chapterNumber?: number; chapterTitle?: string };
    if (typeof c.chapterNumber === 'number' && c.chapterTitle) chapterTitles.set(c.chapterNumber, c.chapterTitle);
  }

  const pageMans = await db
    .select({ externalId: manifests.externalId, content: manifests.content })
    .from(manifests)
    .where(and(eq(manifests.projectId, projectId), eq(manifests.kind, 'PAGE')));
  const entryMeta = new Map<string, EntryMetaInput>();
  for (const m of pageMans) {
    const c = m.content as { entryTitle?: string; contentType?: string } | null;
    if (!c) continue;
    entryMeta.set(m.externalId, {
      entryTitle: typeof c.entryTitle === 'string' ? c.entryTitle : undefined,
      contentType: typeof c.contentType === 'string' ? c.contentType : undefined,
    });
  }

  return { pages, chapterTitles, entryMeta };
}

export interface BackfillResult {
  derived: DerivedEntry[];
  report: EntryValidationReport;
  persisted: number;
}

/** Derive + validate + persist the entries for a project. */
export async function backfillProjectEntries(projectId: string, opts: { persist?: boolean } = {}): Promise<BackfillResult> {
  const { pages, chapterTitles, entryMeta } = await loadDeriveInputs(projectId);
  const derived = deriveEntries({ pages, chapterTitles, entryMeta });
  const report = validateEntries(derived, pages);
  let persisted = 0;
  // Only persist a clean derivation — never write entries that fail validation.
  if (opts.persist !== false && report.passed) {
    persisted = await replaceProjectEntries(projectId, derived);
  }
  return { derived, report, persisted };
}
