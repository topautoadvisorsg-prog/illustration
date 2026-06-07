/**
 * Stage 1.75 — public types + Zod runtime validation.
 *
 * `PaginatedPageSchema` validates a `PaginatedPage` at the boundary between
 * the in-memory flow engine and the durable `pages` table. Without it, an
 * engine bug could silently write malformed rows.
 *
 * `LayoutAllocation` zones are passed through with `z.custom` rather than
 * deeply validated here — the layout director already enforces their shape.
 */

import { z } from 'zod';
import { LayoutTemplateIdSchema } from '@wildlands/shared';
import type { LayoutAllocation } from '../stage-6-layout/layout-director.js';

/** Mirrors the `page_role` enum in the DB schema. */
export const PageRoleSchema = z.enum(['opener', 'continuation', 'compacted']);
export type PageRole = z.infer<typeof PageRoleSchema>;

/** Mirrors the `fit_status` enum in the DB schema. */
export const PaginationFitStatusSchema = z.enum([
  'PENDING',
  'FITS',
  'TIGHT',
  'OVERFLOW',
  'UNDERFILL',
]);

/** Mirrors the `page_approval_decision` enum in the DB schema. */
export const PageApprovalDecisionSchema = z.enum(['APPROVED', 'REJECTED', 'RESET']);

export const PaginatedPageSchema = z.object({
  /** 1-based global printed page number across the whole book. */
  plannedPageNumber: z.number().int().positive(),
  entryKey: z.string().min(1),
  entryTitle: z.string().min(1),
  /** Display key — opener uses entry key verbatim, continuations append `_c{N}`,
   *  compacted openers append `_m`. */
  pageKey: z.string().min(1),
  chapterNumber: z.number().int().positive(),
  /** N-th printed page in this entry's chain (1 = opener or compacted opener). */
  partN: z.number().int().positive(),
  /** Total pages in this entry's chain (count of pages where entryKey === this
   *  page's entryKey OR compactedEntryKeys contains this page's entryKey). */
  totalParts: z.number().int().positive(),
  pageRole: PageRoleSchema,
  /** True only for the opener that drives the page's illustration. */
  carriesSubject: z.boolean(),
  /** Ordered list of entries living on a compacted page. Null for single-entry pages. */
  compactedEntryKeys: z.array(z.string().min(1)).min(2).nullable(),
  /** Image subject string carried over from the opener entry. Null on
   *  continuation pages where carriesSubject = false. */
  imageSubject: z.string().min(1).nullable(),
  layoutTemplate: LayoutTemplateIdSchema,
  readingFieldText: z.string(),
  readingFieldChars: z.number().int().nonnegative(),
  readingFieldWords: z.number().int().nonnegative(),
  fitStatus: PaginationFitStatusSchema,
  /** Layout director output for this page — text-safe zones, image priority
   *  zones, etc. Carried through so the Stage 1.8 preview renderer doesn't
   *  need to re-run directLayout. */
  zones: z.custom<LayoutAllocation>(),
  warnings: z.array(z.string()),
});

export type PaginatedPage = z.infer<typeof PaginatedPageSchema>;
