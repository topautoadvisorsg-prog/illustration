/**
 * Export persistence — records produced book artifacts (PREMIUM_PDF / KINDLE_EPUB).
 */

import { eq } from 'drizzle-orm';
import type { ExportKind, ExportStatus } from '@wildlands/shared';
import { getDb } from '../client.js';
import { exports as exportsTable } from '../schema/index.js';

export type ExportRow = typeof exportsTable.$inferSelect;

export interface RecordExportInput {
  projectId: string;
  kind: ExportKind;
  status: ExportStatus;
  filePath?: string | null;
  sha256?: string | null;
  fileSizeBytes?: number | null;
}

export async function recordExport(input: RecordExportInput): Promise<ExportRow> {
  const db = getDb();
  const [row] = await db
    .insert(exportsTable)
    .values({
      projectId: input.projectId,
      kind: input.kind,
      status: input.status,
      filePath: input.filePath ?? null,
      sha256: input.sha256 ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to record export');
  return row;
}

export async function listExports(projectId: string): Promise<ExportRow[]> {
  const db = getDb();
  return db.select().from(exportsTable).where(eq(exportsTable.projectId, projectId)).orderBy(exportsTable.createdAt);
}
