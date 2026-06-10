/**
 * Front Matter v1 — persistence.
 *
 * Front/back-matter pages live in the same `pages` table as body pages
 * (section ≠ 'BODY'), so assembly reads ONE table in spine order. The
 * planner owns these rows: re-planning replaces every non-BODY row (and
 * cascades their render rows away), never touching BODY.
 */

import { and, eq, ne, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { getDb } from '../client.js';
import { pages, wholePageRenders } from '../schema/index.js';

export interface FrontMatterPageInsert {
  pageKey: string;
  section: 'FRONT_MATTER' | 'BACK_MATTER';
  frontMatterType: string;
  spineOrder: number;
  pageLabel: string | null;
  /** Text payload for audit (intro text, TOC lines…); null for blanks. */
  readingFieldText: string | null;
}

export interface InsertedFrontMatterPage extends FrontMatterPageInsert {
  id: string;
}

/** Replace all non-BODY rows for the project. Returns inserted rows w/ ids. */
export async function replaceFrontBackMatterPages(
  projectId: string,
  rows: FrontMatterPageInsert[],
): Promise<InsertedFrontMatterPage[]> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.delete(pages).where(and(eq(pages.projectId, projectId), ne(pages.section, 'BODY')));
    if (rows.length === 0) return [];
    const inserted = await tx
      .insert(pages)
      .values(
        rows.map((r) => ({
          projectId,
          manifestId: null,
          pageKey: r.pageKey,
          // Spine sections sit outside chapters; 0 keeps NOT NULL satisfied
          // without colliding with real chapter numbers (1-based).
          chapterNumber: 0,
          plannedPageNumber: r.spineOrder,
          layoutTemplate: null,
          status: 'PLANNED' as const,
          entryKey: null,
          pageRole: 'opener' as const,
          carriesSubject: false,
          readingFieldText: r.readingFieldText,
          readingFieldChars: r.readingFieldText?.length ?? 0,
          readingFieldWords: r.readingFieldText
            ? r.readingFieldText.split(/\s+/).filter(Boolean).length
            : 0,
          fitStatus: 'FITS' as const,
          section: r.section,
          frontMatterType: r.frontMatterType,
          spineOrder: r.spineOrder,
          pageLabel: r.pageLabel,
        })),
      )
      .returning({ id: pages.id, pageKey: pages.pageKey });
    const idByKey = new Map(inserted.map((p) => [p.pageKey, p.id]));
    return rows.map((r) => ({ ...r, id: idByKey.get(r.pageKey)! }));
  });
}

export interface DeterministicRenderInsert {
  pageId: string;
  projectId: string;
  imagePath: string;
  printPngPath: string;
  printPdfPath: string;
  widthPx: number;
  heightPx: number;
  standardVersion: string;
  /** What the composer was asked to produce — audit payload. */
  composeSpec: unknown;
}

/**
 * Insert a book-ready render row for a deterministically composed page.
 * status RENDERED + approved_for_book + active, preflight passed — assembly
 * picks it up exactly like an approved AI render. model records the composer
 * so proof tooling can tell the two sources apart.
 */
export async function insertDeterministicRender(input: DeterministicRenderInsert): Promise<string> {
  const db = getDb();
  const prompt = 'deterministic front-matter composition (no AI; see FRONT_MATTER_V1_SPEC R2)';
  const [row] = await db
    .insert(wholePageRenders)
    .values({
      pageId: input.pageId,
      projectId: input.projectId,
      version: 1,
      status: 'APPROVED' as const,
      specJson: input.composeSpec as object,
      assembledPrompt: prompt,
      promptSha256: createHash('sha256').update(prompt).digest('hex'),
      standardVersion: input.standardVersion,
      active: true,
      approvedForBook: true,
      attempts: 0,
      imagePath: input.imagePath,
      printPngPath: input.printPngPath,
      printPdfPath: input.printPdfPath,
      preflightPassed: true,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      model: 'deterministic-composer-v1',
    })
    .returning({ id: wholePageRenders.id });
  return row!.id;
}

/** All non-BODY pages in spine order (for reports + assembly checks). */
export async function listFrontBackMatterPages(projectId: string) {
  const db = getDb();
  return db
    .select()
    .from(pages)
    .where(and(eq(pages.projectId, projectId), ne(pages.section, 'BODY')))
    .orderBy(pages.spineOrder);
}

/** Render rows for a set of pageIds (verification). */
export async function listRendersForPages(pageIds: string[]) {
  if (pageIds.length === 0) return [];
  const db = getDb();
  return db.select().from(wholePageRenders).where(inArray(wholePageRenders.pageId, pageIds));
}
