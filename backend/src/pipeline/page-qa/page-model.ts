/**
 * THE CANONICAL PAGE MODEL — what a finished page actually IS, measured.
 *
 * PROMOTED, NOT REWRITTEN. This is the extraction and norm-inference core of
 * `scripts/national-parks-spacing-audit.ts`, which despite its name contained no
 * book-specific logic at all: its only two references to National Parks were its
 * own filename in a usage string. It has been calibrated against a real printed
 * book, including a documented false-positive pass, and throwing that away to
 * write a fresh one would have been the expensive kind of tidy.
 *
 * ─── MEASURED FROM THE SHIPPED BYTES ──────────────────────────────────────
 * Everything here reads the PDF as data: text runs, coordinates, font sizes.
 * Nothing is re-rendered, because a check that rebuilds its own copy proves
 * something about a file nobody will upload. Nothing is OCR'd, because the
 * structural information is already present and reading it back off a picture
 * would be strictly worse.
 *
 * Raster and vision come later, and only for what a machine measures badly:
 * whether a page LOOKS composed. Not for recovering facts we already hold.
 *
 * ─── NORMS COME FROM THE BOOK, NOT FROM A CONSTANT ────────────────────────
 * Body size, leading and measure are inferred statistically from the book being
 * audited. A hardcoded 11pt-on-14 would be wrong for the next title and would
 * quietly mis-flag every page of it.
 */
import { createHash } from 'node:crypto';

export interface PageLine {
  /** PDF baseline. Y grows UPWARD; reading order is descending y. */
  y: number;
  x0: number;
  x1: number;
  size: number;
  text: string;
  font: string;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ModelPage {
  /** 1-based, as a reader counts. */
  n: number;
  widthPt: number;
  heightPt: number;
  lines: PageLine[];
  /** Lines inside the text block: furniture removed. */
  body: PageLine[];
  /** Running heads and folios: everything outside the text block. */
  furniture: PageLine[];
  /** Bounding box of the body text. Null on a page with no body. */
  textBox: Box | null;
  /** Bounding box of everything drawn, furniture included. */
  inkBox: Box | null;
  /** Fraction of the text block's height that carries body lines. */
  density: number;
  /** The tallest continuous vertical gap inside the text block, in points. */
  largestGapPt: number;
  /** Where that gap sits, as a fraction from the top of the text block. */
  largestGapAt: number;
  /** Body lines whose size is meaningfully larger than the body: headings. */
  headings: PageLine[];
  /** True when the page carries no text at all. */
  blank: boolean;
}

export interface BookNorms {
  /** The dominant body text size, by character count. */
  bodySizePt: number;
  /** The dominant baseline-to-baseline pitch between body lines. */
  leadingPt: number;
  /** The measure: the 97th-percentile body line width. */
  measurePt: number;
}

export interface PageModel {
  sha256: string;
  pageCount: number;
  norms: BookNorms;
  pages: ModelPage[];
}

const SIZE_TOLERANCE = 0.6;

/** Is this line set at the book's body size? */
export const isBodySize = (l: PageLine, norms: BookNorms): boolean =>
  Math.abs(l.size - norms.bodySizePt) < SIZE_TOLERANCE;

/** Is this line a heading, rather than body or furniture? */
export const isHeadingSize = (l: PageLine, norms: BookNorms): boolean => l.size > norms.bodySizePt + 1;

/**
 * Margin furniture sits outside the text block.
 *
 * Ported verbatim from the audit this replaces. The second clause catches a
 * small-set running head that sits further in than the folio does.
 */
export function isFurniture(page: { heightPt: number }, l: PageLine, norms: BookNorms): boolean {
  return (
    l.y > page.heightPt - 54 ||
    l.y < 54 ||
    (l.size < norms.bodySizePt - 1.2 && (l.y > page.heightPt - 90 || l.y < 90))
  );
}

/**
 * Read a finished PDF into the page model.
 *
 * pdfjs-dist legacy, with system fonts and font-face disabled: this reads
 * coordinates and text runs, and must not depend on what fonts the auditing
 * machine happens to have installed.
 */
export async function buildPageModel(pdfBytes: Buffer): Promise<PageModel> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
  (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = '';
  const doc = await (
    pdfjs as unknown as { getDocument: (o: unknown) => { promise: Promise<PdfDoc> } }
  ).getDocument({ data: new Uint8Array(pdfBytes), useSystemFonts: false, disableFontFace: true }).promise;

  const raw: Array<{ n: number; widthPt: number; heightPt: number; lines: PageLine[] }> = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    /** Items sharing a baseline within a point are one line. */
    const buckets = new Map<number, Array<{ x: number; w: number; s: string; size: number; font: string }>>();
    for (const it of tc.items) {
      const str: string = it.str ?? '';
      if (!str.trim()) continue;
      const y = Math.round(it.transform[5]! * 2) / 2;
      let key = y;
      for (const k of buckets.keys()) if (Math.abs(k - y) <= 1.2) key = k;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push({
        x: it.transform[4]!,
        w: it.width ?? 0,
        s: str,
        size: Math.abs(it.transform[3]!) || Math.abs(it.transform[0]!),
        font: it.fontName ?? '?',
      });
    }

    const lines: PageLine[] = [];
    for (const [y, items] of buckets) {
      items.sort((a, b) => a.x - b.x);
      const first = items[0]!;
      const last = items[items.length - 1]!;
      lines.push({
        y,
        x0: first.x,
        x1: last.x + last.w,
        size: Math.max(...items.map((t) => t.size)),
        text: items.map((t) => t.s).join(''),
        font: first.font,
      });
    }
    lines.sort((a, b) => b.y - a.y);
    raw.push({ n: i, widthPt: vp.width, heightPt: vp.height, lines });
  }

  const norms = inferNorms(raw);
  const pages: ModelPage[] = raw.map((p) => {
    const furniture = p.lines.filter((l) => isFurniture(p, l, norms));
    const body = p.lines.filter((l) => !isFurniture(p, l, norms));
    const bodySized = body.filter((l) => isBodySize(l, norms));
    const gap = largestGap(body, norms);
    return {
      ...p,
      body,
      furniture,
      textBox: boxOf(body),
      inkBox: boxOf(p.lines),
      density: densityOf(body, bodySized, norms),
      largestGapPt: gap.pt,
      largestGapAt: gap.at,
      headings: body.filter((l) => isHeadingSize(l, norms)),
      blank: p.lines.length === 0,
    };
  });

  return {
    sha256: createHash('sha256').update(pdfBytes).digest('hex'),
    pageCount: pages.length,
    norms,
    pages,
  };
}

function inferNorms(pages: Array<{ lines: PageLine[] }>): BookNorms {
  // Body size: the size carrying the most CHARACTERS, not the most lines. A book
  // with many short headings would otherwise elect a heading size as its body.
  const sizes = new Map<number, number>();
  for (const p of pages) {
    for (const l of p.lines) {
      const k = Math.round(l.size * 2) / 2;
      sizes.set(k, (sizes.get(k) ?? 0) + l.text.length);
    }
  }
  const bodySizePt = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;

  // Leading: the most common baseline pitch between two body-sized lines.
  const counts = new Map<number, number>();
  for (const p of pages) {
    for (let i = 1; i < p.lines.length; i += 1) {
      const a = p.lines[i - 1]!;
      const b = p.lines[i]!;
      if (Math.abs(a.size - bodySizePt) < SIZE_TOLERANCE && Math.abs(b.size - bodySizePt) < SIZE_TOLERANCE) {
        const d = a.y - b.y;
        if (d > 1 && d < 40) {
          const k = Math.round(d * 10) / 10;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
      }
    }
  }
  const leadingPt = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? bodySizePt * 1.3;

  // Measure: the 97th percentile body line width. Not the maximum, which one
  // over-justified line would set for the whole book.
  const widths = pages
    .flatMap((p) => p.lines.filter((l) => Math.abs(l.size - bodySizePt) < SIZE_TOLERANCE))
    .map((l) => l.x1 - l.x0)
    .sort((a, b) => a - b);
  const measurePt = widths.length ? widths[Math.floor(widths.length * 0.97)]! : 0;

  return { bodySizePt, leadingPt, measurePt };
}

function boxOf(lines: PageLine[]): Box | null {
  if (!lines.length) return null;
  return {
    x0: Math.min(...lines.map((l) => l.x0)),
    x1: Math.max(...lines.map((l) => l.x1)),
    y0: Math.min(...lines.map((l) => l.y)),
    y1: Math.max(...lines.map((l) => l.y)),
  };
}

/**
 * How full the text block is.
 *
 * Lines actually present, against how many would fit between the first and last
 * line at the book's own leading. A page whose text stops two thirds of the way
 * down reports about 0.66 — before any judgement is made about whether that is a
 * defect, which depends entirely on what the page is FOR.
 */
function densityOf(body: PageLine[], bodySized: PageLine[], norms: BookNorms): number {
  if (body.length < 2 || norms.leadingPt <= 0) return body.length ? 1 : 0;
  const top = Math.max(...body.map((l) => l.y));
  const bottom = Math.min(...body.map((l) => l.y));
  const capacity = (top - bottom) / norms.leadingPt + 1;
  return capacity > 0 ? Math.min(1, bodySized.length / capacity) : 0;
}

function largestGap(body: PageLine[], norms: BookNorms): { pt: number; at: number } {
  if (body.length < 2) return { pt: 0, at: 0 };
  const top = body[0]!.y;
  const bottom = body[body.length - 1]!.y;
  const span = Math.max(1, top - bottom);
  let pt = 0;
  let at = 0;
  for (let i = 1; i < body.length; i += 1) {
    const d = body[i - 1]!.y - body[i]!.y;
    if (d > pt) {
      pt = d;
      at = (top - body[i - 1]!.y) / span;
    }
  }
  return { pt: Math.max(0, pt - norms.leadingPt), at };
}

// ── the shape pdfjs gives back, narrowed to what is read above ──────────────
interface PdfTextItem {
  str?: string;
  width?: number;
  fontName?: string;
  transform: number[];
}
interface PdfPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
