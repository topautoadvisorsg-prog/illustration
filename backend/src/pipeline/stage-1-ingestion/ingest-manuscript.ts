import { z } from 'zod';
import { getProjectStorage, type ProjectStorage, type StoredFile } from '../../services/storage/project-storage.js';
import { assertUsableManuscriptOutline, parseManuscriptOutline, type ManuscriptOutline } from './parse-manuscript-outline.js';
import { extractManuscript } from './extract-manuscript.js';
import { sanitizeManuscript } from './sanitize-manuscript.js';

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
  /** The DERIVED WORKING manuscript (sanitized). Everything downstream reads this. */
  manuscript: StoredFile;
  /**
   * The CANONICAL SOURCE artifact — the operator's exact uploaded bytes, stored
   * verbatim under `manuscripts/source/`. Its hash is the one an author freezes.
   * Never rewritten, never the target of a downstream read.
   */
  canonicalSource: StoredFile;
  /** False when sanitization was a no-op, i.e. working == source byte-for-byte. */
  sanitized: boolean;
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

  // ── 1. CANONICAL SOURCE — write the extracted bytes VERBATIM, first, before
  // anything can transform them. This is the artifact the author froze and
  // hashed; it must round-trip unchanged. Stored under `manuscripts/source/` so
  // it can never collide with, or be mistaken for, the working copy.
  //
  // For .md/.txt this is exactly what the operator uploaded. For .docx/.pdf the
  // canonical artifact is the extracted markdown, since the platform's input to
  // production is text — the binary original is not the publishing source.
  const canonicalSource = await storage.writeProjectFile(
    parsed.projectId,
    ['manuscripts', 'source', extracted.storedFilename],
    extracted.markdown,
  );

  // ── 2. DERIVED WORKING MANUSCRIPT — sanitize ONCE here so breakdown,
  // pagination, prompts, and paid renders all read clean text (no mojibake, no
  // emoji/ICON markers). Everything downstream reads this file, so this is the
  // single chokepoint. It is a DERIVATIVE of the canonical source above, never
  // a replacement for it.
  const cleanMarkdown = sanitizeManuscript(extracted.markdown);
  const sanitized = cleanMarkdown !== extracted.markdown;

  const outline = parseManuscriptOutline(cleanMarkdown);
  assertUsableManuscriptOutline(outline);

  // Store the sanitized markdown (normalized to .md) so downstream stages read one format.
  const manuscript = await storage.writeProjectFile(
    parsed.projectId,
    ['manuscripts', extracted.storedFilename],
    cleanMarkdown,
  );
  return { manuscript, canonicalSource, sanitized, outline, sourceType: extracted.sourceType };
}
