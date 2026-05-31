import path from 'node:path';
import { z } from 'zod';
import { LocalStorageService, type StoredFile } from '../../services/storage/local-storage.js';
import { assertUsableManuscriptOutline, parseManuscriptOutline, type ManuscriptOutline } from './parse-manuscript-outline.js';

export const IngestManuscriptInputSchema = z.object({
  projectId: z.string().uuid(),
  filename: z.string().min(1),
  markdown: z.string().min(1),
});

export type IngestManuscriptInput = z.infer<typeof IngestManuscriptInputSchema>;

export interface IngestManuscriptResult {
  manuscript: StoredFile;
  outline: ManuscriptOutline;
}

export async function ingestManuscript(
  input: IngestManuscriptInput,
  storage = new LocalStorageService(),
): Promise<IngestManuscriptResult> {
  const parsed = IngestManuscriptInputSchema.parse(input);
  const ext = path.extname(parsed.filename).toLowerCase();
  if (ext !== '.md') {
    throw new Error(`Manuscript must be a .md file; received ${parsed.filename}`);
  }

  const outline = parseManuscriptOutline(parsed.markdown);
  assertUsableManuscriptOutline(outline);

  const manuscript = await storage.writeProjectFile(parsed.projectId, ['manuscripts', parsed.filename], parsed.markdown);
  return { manuscript, outline };
}
