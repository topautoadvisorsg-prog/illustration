/**
 * Stage 1 — manuscript text extraction.
 *
 * Turns an uploaded file (Markdown, plain text, DOCX, or PDF) into the markdown
 * text the outline parser consumes. Binary formats arrive base64-encoded.
 *
 * - .md / .markdown / .txt : used as-is (text).
 * - .docx                  : mammoth -> markdown (Word heading styles become #/##).
 * - .pdf                   : unpdf -> plain text (flat; structure depends on content).
 */

import path from 'node:path';

export const SUPPORTED_MANUSCRIPT_EXTENSIONS = ['.md', '.markdown', '.txt', '.docx', '.pdf'] as const;

export class UnsupportedManuscriptError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'UnsupportedManuscriptError';
  }
}

export interface ManuscriptSource {
  /** Plain-text content (for .md / .markdown / .txt). */
  text?: string;
  /** Base64-encoded file bytes (required for .docx / .pdf). */
  base64?: string;
}

export interface ExtractedManuscript {
  /** The markdown/text fed to the outline parser. */
  markdown: string;
  /** Storage filename — extracted formats are normalized to .md. */
  storedFilename: string;
  sourceType: 'markdown' | 'text' | 'docx' | 'pdf';
}

function manuscriptExt(filename: string): string {
  return path.extname(filename).toLowerCase();
}

function decodeBase64(base64: string): Buffer {
  // Tolerate data-URL prefixes ("data:...;base64,XXXX").
  const comma = base64.indexOf(',');
  const payload = base64.startsWith('data:') && comma !== -1 ? base64.slice(comma + 1) : base64;
  return Buffer.from(payload, 'base64');
}

function baseName(filename: string): string {
  const base = path.basename(filename, path.extname(filename)).trim();
  return (base || 'manuscript').replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function extractManuscript(filename: string, source: ManuscriptSource): Promise<ExtractedManuscript> {
  const ext = manuscriptExt(filename);
  const stored = `${baseName(filename)}.md`;

  if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    const text = source.text ?? (source.base64 ? decodeBase64(source.base64).toString('utf8') : '');
    if (!text.trim()) {
      throw new UnsupportedManuscriptError('Uploaded text file is empty.', 'empty_file');
    }
    return { markdown: text, storedFilename: stored, sourceType: ext === '.txt' ? 'text' : 'markdown' };
  }

  if (ext === '.docx') {
    if (!source.base64) throw new UnsupportedManuscriptError('DOCX upload requires file bytes.', 'missing_bytes');
    const mammothModule = await import('mammoth');
    const mammoth = (mammothModule.default ?? mammothModule) as unknown as {
      convertToMarkdown: (i: { buffer: Buffer }) => Promise<{ value: string }>;
    };
    const { value } = await mammoth.convertToMarkdown({
      buffer: decodeBase64(source.base64),
    });
    if (!value.trim()) throw new UnsupportedManuscriptError('No text could be extracted from the DOCX.', 'empty_extract');
    return { markdown: value, storedFilename: stored, sourceType: 'docx' };
  }

  if (ext === '.pdf') {
    if (!source.base64) throw new UnsupportedManuscriptError('PDF upload requires file bytes.', 'missing_bytes');
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(decodeBase64(source.base64)));
    const { text } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join('\n\n') : text;
    if (!merged.trim()) throw new UnsupportedManuscriptError('No selectable text found in the PDF (it may be scanned images).', 'empty_extract');
    return { markdown: merged, storedFilename: stored, sourceType: 'pdf' };
  }

  throw new UnsupportedManuscriptError(
    `Unsupported manuscript type "${ext || '(none)'}". Supported: ${SUPPORTED_MANUSCRIPT_EXTENSIONS.join(', ')}.`,
    'unsupported_type',
  );
}
