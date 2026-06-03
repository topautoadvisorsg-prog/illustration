import { z } from 'zod';
import { getProjectStorage, type ProjectStorage, type StoredFile } from '../../services/storage/project-storage.js';
import { assertUsableManuscriptOutline, parseManuscriptOutline, type ManuscriptOutline } from './parse-manuscript-outline.js';
import { extractManuscript } from './extract-manuscript.js';

export const IngestManuscriptInputSchema = z
  .object({
    projectId: z.string().uuid(),
    filename: z.string().min(1),
    /** Plain text for .md/.markdown/.txt. */
    markdown: z.string().optional(),
    /** Base64 file bytes for .docx/.pdf (or any type). */
    fileBase64: z.string().optional(),
  })
  .refine((v) => Boolean(v.markdown && v.markdown.length) || Boolean(v.fileBase64 && v.fileBase64.length), {
    message: 'Provide manuscript text (markdown) or file bytes (fileBase64).',
  });

export type IngestManuscriptInput = z.infer<typeof IngestManuscriptInputSchema>;

export interface IngestManuscriptResult {
  manuscript: StoredFile;
  outline: ManuscriptOutline;
  sourceType: string;
}

export async function ingestManuscript(
  input: IngestManuscriptInput,
  storage: ProjectStorage = getProjectStorage(),
): Promise<IngestManuscriptResult> {
  const parsed = IngestManuscriptInputSchema.parse(input);

  // Extract markdown from whatever format was uploaded (md/txt/docx/pdf).
  const extracted = await extractManuscript(parsed.filename, {
    text: parsed.markdown,
    base64: parsed.fileBase64,
  });

  const outline = parseManuscriptOutline(extracted.markdown);
  assertUsableManuscriptOutline(outline);

  // Store the extracted markdown (normalized to .md) so downstream stages read one format.
  const manuscript = await storage.writeProjectFile(
    parsed.projectId,
    ['manuscripts', extracted.storedFilename],
    extracted.markdown,
  );
  return { manuscript, outline, sourceType: extracted.sourceType };
}
