/**
 * Front Matter v1 — deterministic page composer (R2 in FRONT_MATTER_V1_SPEC).
 *
 * The image model mangles exact small text (folios, ISBNs, TOC numbers), so
 * front/back-matter pages are typeset HERE: SVG → sharp PNG at the project's
 * 300-DPI canvas → single-page PDF (pdf-lib), the same output contract as
 * print-prep. No AI anywhere in this module. Pure functions + sharp/pdf-lib.
 *
 * GENERIC: all strings arrive as data. House look comes from the locked
 * Standard (parchment, ink, serif stack) — the same constants every other
 * stage reads.
 */

import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { PALETTE, TYPOGRAPHY, SPACING } from '../publishing-standard/index.js';

const SERIF = TYPOGRAPHY.renderFontFamily;
const INK = PALETTE.ink.hex;
const PARCHMENT = PALETTE.parchment.hex;

// Front-matter PROSE density (introduction, disclaimer, about-author/series).
// TYPOGRAPHY.body is the large display body size used elsewhere; running prose
// at that size leaves the page sparse (~170 words). Real trade books set
// running text at ~11pt / ~1.4 leading, which fills a page like a normal
// premium book (~350 words). Used by BOTH textPageLineCapacity (the splitter)
// AND the TEXT_PAGE renderer so the two never disagree and prose never clips.
const FM_PROSE = { pt: 11, lineHeight: 1.4, paragraphGapLines: 0.6 };

export type FrontMatterPageKind =
  | 'BLANK'
  | 'HALF_TITLE'
  | 'TITLE_PAGE'
  | 'COPYRIGHT_PAGE'
  | 'DEDICATION'
  | 'CONTENTS'
  | 'TEXT_PAGE'
  | 'GLOSSARY'
  | 'INDEX';

export interface TocEntry {
  label: string; // e.g. roman or plain chapter title prefix
  title: string;
  pageNumber: number;
}

export interface ComposeInput {
  kind: FrontMatterPageKind;
  canvasIn: { w: number; h: number };
  /** Printed folio (exactly as printed); null = unprinted. */
  pageLabel: string | null;
  /** HALF_TITLE / TITLE_PAGE */
  title?: string;
  subtitle?: string;
  authors?: string[];
  imprint?: string;
  /** COPYRIGHT_PAGE — pre-built lines (template lives in the planner). */
  copyrightLines?: string[];
  /** DEDICATION */
  dedicationText?: string;
  /** CONTENTS */
  tocHeading?: string;
  tocEntries?: TocEntry[];
  /** TEXT_PAGE — heading (first page of a section only) + flowed paragraphs. */
  heading?: string;
  paragraphs?: string[];
}

export interface ComposedPage {
  pngBuffer: Buffer;
  pdfBuffer: Buffer;
  widthPx: number;
  heightPx: number;
  dpi: number;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Greedy word-wrap on an average-glyph-width estimate (0.5 em for the
 *  Caslon/Liberation class). Deterministic; tested against the composer's
 *  own margins so lines never overrun. */
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line === '') line = w;
    else if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface Frame {
  W: number; // canvas px
  H: number;
  left: number; // text frame px bounds (1in margins inside trim for FM pages)
  right: number;
  top: number;
  bottom: number;
  dpi: number;
}

interface CompactFrame extends Frame {
  columnGap: number;
  columnWidth: number;
}

function frame(canvasIn: { w: number; h: number }): Frame {
  const dpi = SPACING.printDpi;
  const W = Math.round(canvasIn.w * dpi);
  const H = Math.round(canvasIn.h * dpi);
  const bleed = SPACING.bleedIn * dpi;
  // Front-matter pages breathe more than body pages: 1in margins inside trim.
  const m = 1.0 * dpi;
  return { W, H, left: bleed + m, right: W - bleed - m, top: bleed + m, bottom: H - bleed - m, dpi };
}

function compactFrame(canvasIn: { w: number; h: number }): CompactFrame {
  const dpi = SPACING.printDpi;
  const W = Math.round(canvasIn.w * dpi);
  const H = Math.round(canvasIn.h * dpi);
  const bleed = SPACING.bleedIn * dpi;
  // Back-matter reference sections are scanning pages, not ceremonial front
  // pages. Keep a solid print-safe margin but use a denser two-column frame.
  const m = 0.65 * dpi;
  const columnGap = 0.24 * dpi;
  const left = bleed + m;
  const right = W - bleed - m;
  const top = bleed + 0.7 * dpi;
  const bottom = H - bleed - 0.65 * dpi;
  return {
    W,
    H,
    left,
    right,
    top,
    bottom,
    dpi,
    columnGap,
    columnWidth: (right - left - columnGap) / 2,
  };
}

function headingBlock(parts: string[], f: Frame, heading: string, y: number, pt = 16): number {
  const cx = f.W / 2;
  const fitted = fitTitle(heading.toUpperCase(), pt, f.right - f.left, 5, true, 11, 2);
  for (const line of fitted.lines) {
    parts.push(text(cx, y, line, fitted.pt, { tracking: 5 }));
    y += (fitted.pt / 72) * f.dpi * 1.25;
  }
  y += 0.08 * f.dpi;
  parts.push(hairline(cx - 0.7 * f.dpi, cx + 0.7 * f.dpi, y, 1.5));
  return y + 0.28 * f.dpi;
}

/** Conservative width estimate (px) for a line at `pt`. Caps factor 0.72 is
 *  a safe UPPER bound for Liberation Serif capitals; mixed case uses 0.52.
 *  Estimates high on purpose: a too-small title is a style nit, an
 *  edge-clipped title is a print defect (the first live title page clipped
 *  at both edges — this is that fix). */
function estimateWidthPx(content: string, pt: number, tracking: number, allCaps: boolean): number {
  const em = (pt / 72) * 300;
  const factor = allCaps ? 0.72 : 0.52;
  return content.length * (factor * em + tracking);
}

/** Greedy word-wrap into lines that each fit `charBudget` characters. A
 *  single word longer than the budget gets its own line (pathological). */
function greedyWrap(content: string, charBudget: number): string[] {
  const words = content.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= charBudget || !current) current = candidate;
    else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Fit a title into maxWidth: walk pt downward from basePt; at each size,
 * greedy-wrap and accept the first size where the wrap needs ≤ maxLines and
 * every line fits. At minPt, return the wrap regardless (every line fits by
 * construction unless one WORD exceeds the budget — pathological input).
 * The first live title page clipped at both page edges; this is that fix.
 */
export function fitTitle(
  content: string,
  basePt: number,
  maxWidthPx: number,
  tracking: number,
  allCaps: boolean,
  minPt = 14,
  maxLines = 3,
): { lines: string[]; pt: number } {
  const factor = allCaps ? 0.72 : 0.52;
  for (let pt = basePt; pt >= minPt; pt--) {
    const charBudget = Math.max(1, Math.floor(maxWidthPx / (factor * (pt / 72) * 300 + tracking)));
    const lines = greedyWrap(content, charBudget);
    const longest = Math.max(...lines.map((l) => l.length));
    if (lines.length <= maxLines && longest <= charBudget) return { lines, pt };
  }
  const charBudget = Math.max(1, Math.floor(maxWidthPx / (factor * (minPt / 72) * 300 + tracking)));
  return { lines: greedyWrap(content, charBudget), pt: minPt };
}

function text(
  x: number,
  y: number,
  content: string,
  pt: number,
  opts: { anchor?: 'start' | 'middle' | 'end'; italic?: boolean; tracking?: number; bold?: boolean } = {},
): string {
  const px = (pt / 72) * 300;
  return (
    `<text x="${x}" y="${y}" text-anchor="${opts.anchor ?? 'middle'}" ` +
    `font-family="${SERIF}" font-size="${px.toFixed(1)}" fill="${INK}"` +
    (opts.italic ? ' font-style="italic"' : '') +
    (opts.bold ? ' font-weight="bold"' : '') +
    (opts.tracking ? ` letter-spacing="${opts.tracking}"` : '') +
    `>${esc(content)}</text>`
  );
}

function hairline(x1: number, x2: number, y: number, width = 2): string {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${INK}" stroke-width="${width}" stroke-opacity="0.7"/>`;
}

/** Small centered diamond glyph — the deterministic house ornament. */
function diamond(cx: number, cy: number, r: number): string {
  return `<path d="M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z" fill="${INK}" fill-opacity="0.8"/>`;
}

function folioSvg(f: Frame, pageLabel: string | null): string {
  if (!pageLabel) return '';
  return text(f.W / 2, f.H - SPACING.bleedIn * f.dpi - 0.5 * f.dpi, pageLabel, 11);
}

function buildBody(input: ComposeInput, f: Frame): string {
  const cx = f.W / 2;
  const parts: string[] = [];

  switch (input.kind) {
    case 'BLANK':
      break;

    case 'HALF_TITLE': {
      const maxW = f.right - f.left;
      const fitted = fitTitle((input.title ?? '').toUpperCase(), 26, maxW, 6, true);
      let y = f.top + (f.bottom - f.top) * 0.28;
      const lineH = (fitted.pt / 72) * f.dpi * 1.35;
      for (const line of fitted.lines) {
        parts.push(text(cx, y, line, fitted.pt, { tracking: 6 }));
        y += lineH;
      }
      parts.push(diamond(cx, y + 0.25 * f.dpi, 14));
      break;
    }

    case 'TITLE_PAGE': {
      const maxW = f.right - f.left;
      const fitted = fitTitle((input.title ?? '').toUpperCase(), 34, maxW, 8, true);
      let y = f.top + (f.bottom - f.top) * 0.22;
      const lineH = (fitted.pt / 72) * f.dpi * 1.3;
      for (const line of fitted.lines) {
        parts.push(text(cx, y, line, fitted.pt, { tracking: 8 }));
        y += lineH;
      }
      y -= lineH;
      if (input.subtitle) {
        y += 0.55 * f.dpi;
        const sub = fitTitle(input.subtitle, 16, maxW, 0, false, 11);
        for (const line of sub.lines) {
          parts.push(text(cx, y, line, sub.pt, { italic: true }));
          y += (sub.pt / 72) * f.dpi * 1.4;
        }
        y -= (sub.pt / 72) * f.dpi * 1.4;
      }
      y += 0.5 * f.dpi;
      parts.push(hairline(cx - 1.0 * f.dpi, cx + 1.0 * f.dpi, y));
      parts.push(diamond(cx, y, 10));
      if (input.authors?.length) {
        y += 0.7 * f.dpi;
        parts.push(text(cx, y, joinAuthors(input.authors), 18));
      }
      if (input.imprint) {
        parts.push(text(cx, f.bottom - 0.2 * f.dpi, input.imprint.toUpperCase(), 12, { tracking: 4 }));
      }
      break;
    }

    case 'COPYRIGHT_PAGE': {
      const lines = input.copyrightLines ?? [];
      const pt = 9.5;
      const lineH = (pt / 72) * f.dpi * 1.6;
      // Bottom-third block, left-aligned at the text frame.
      let y = f.bottom - lines.length * lineH;
      for (const line of lines) {
        if (line === '') {
          y += lineH * 0.6;
          continue;
        }
        parts.push(text(f.left, y, line, pt, { anchor: 'start' }));
        y += lineH;
      }
      break;
    }

    case 'DEDICATION': {
      const y = f.top + (f.bottom - f.top) * 0.4;
      const wrapped = wrapText(input.dedicationText ?? '', 46);
      const lineH = (13 / 72) * f.dpi * 1.8;
      wrapped.forEach((line, i) => parts.push(text(cx, y + i * lineH, line, 13, { italic: true })));
      break;
    }

    case 'CONTENTS': {
      let y = f.top + 0.3 * f.dpi;
      const tocFit = fitTitle((input.tocHeading ?? 'CONTENTS').toUpperCase(), 20, f.right - f.left, 8, true);
      parts.push(text(cx, y, tocFit.lines[0]!, tocFit.pt, { tracking: 8 }));
      y += 0.25 * f.dpi;
      parts.push(hairline(cx - 0.9 * f.dpi, cx + 0.9 * f.dpi, y));
      y += 0.55 * f.dpi;
      const pt = 12;
      const rowH = (pt / 72) * f.dpi * 2.1;
      for (const e of input.tocEntries ?? []) {
        const label = e.label ? `${e.label}.  ` : '';
        parts.push(text(f.left, y, `${label}${e.title}`, pt, { anchor: 'start' }));
        parts.push(text(f.right, y, String(e.pageNumber), pt, { anchor: 'end' }));
        // Vintage dotted baseline rule between title and number.
        parts.push(
          `<line x1="${f.left}" y1="${y + 0.08 * f.dpi}" x2="${f.right}" y2="${y + 0.08 * f.dpi}" ` +
            `stroke="${INK}" stroke-width="1.5" stroke-opacity="0.35" stroke-dasharray="2 8"/>`,
        );
        y += rowH;
      }
      break;
    }

    case 'TEXT_PAGE': {
      let y = f.top + 0.2 * f.dpi;
      if (input.heading) {
        const hFit = fitTitle(input.heading.toUpperCase(), 18, f.right - f.left, 6, true, 13);
        for (const line of hFit.lines) {
          parts.push(text(cx, y, line, hFit.pt, { tracking: 6 }));
          y += (hFit.pt / 72) * f.dpi * 1.35;
        }
        y -= (hFit.pt / 72) * f.dpi * 1.35;
        y += 0.2 * f.dpi;
        parts.push(hairline(cx - 0.8 * f.dpi, cx + 0.8 * f.dpi, y));
        y += 0.45 * f.dpi;
      }
      const pt = FM_PROSE.pt; // normal trade-book prose density (see FM_PROSE)
      const lineH = (pt / 72) * f.dpi * FM_PROSE.lineHeight;
      const frameWidthIn = (f.right - f.left) / f.dpi;
      const maxChars = Math.floor(frameWidthIn / ((pt / 72) * 0.5));
      for (const para of input.paragraphs ?? []) {
        for (const line of wrapText(para, maxChars)) {
          parts.push(text(f.left, y, line, pt, { anchor: 'start' }));
          y += lineH;
        }
        y += lineH * FM_PROSE.paragraphGapLines; // paragraph gap — matches the splitter
      }
      break;
    }

    case 'GLOSSARY': {
      const cf = compactFrame({ w: f.W / f.dpi, h: f.H / f.dpi });
      let y = cf.top;
      if (input.heading) {
        y = headingBlock(parts, cf, input.heading, y, 16);
      }

      const pt = 9.25;
      const lineH = (pt / 72) * cf.dpi * 1.18;
      const maxChars = referenceTextPageCapacity({ w: f.W / f.dpi, h: f.H / f.dpi }, Boolean(input.heading)).maxCharsPerLine;
      let col = 0;
      const colX = [cf.left, cf.left + cf.columnWidth + cf.columnGap];
      const colY = [y, y];

      for (const para of input.paragraphs ?? []) {
        const lines = wrapText(para, maxChars);
        const blockH = lines.length * lineH + lineH * 0.22;
        if (colY[col]! + blockH > cf.bottom && col === 0) col = 1;
        let currentY = colY[col]!;
        for (const line of lines) {
          parts.push(text(colX[col]!, currentY, line, pt, { anchor: 'start' }));
          currentY += lineH;
        }
        colY[col] = currentY + lineH * 0.22;
      }
      break;
    }

    case 'INDEX': {
      const cf = compactFrame({ w: f.W / f.dpi, h: f.H / f.dpi });
      let y = headingBlock(parts, cf, input.tocHeading ?? 'Index', cf.top, 16);
      const pt = 9.0;
      const lineH = (pt / 72) * cf.dpi * 1.18;
      const pageNumberWidth = 0.34 * cf.dpi;
      const titleWidth = cf.columnWidth - pageNumberWidth - 0.06 * cf.dpi;
      const maxTitleChars = Math.floor((titleWidth / cf.dpi) / ((pt / 72) * 0.5));
      let col = 0;
      const colX = [cf.left, cf.left + cf.columnWidth + cf.columnGap];
      const colY = [y, y];

      for (const entry of input.tocEntries ?? []) {
        const lines = wrapText(entry.title, maxTitleChars);
        const blockH = lines.length * lineH + lineH * 0.18;
        if (colY[col]! + blockH > cf.bottom && col === 0) col = 1;
        const x = colX[col]!;
        let currentY = colY[col]!;
        parts.push(text(x, currentY, lines[0] ?? entry.title, pt, { anchor: 'start' }));
        parts.push(text(x + cf.columnWidth, currentY, String(entry.pageNumber), pt, { anchor: 'end' }));
        currentY += lineH;
        for (const line of lines.slice(1)) {
          parts.push(text(x + 0.12 * cf.dpi, currentY, line, pt, { anchor: 'start' }));
          currentY += lineH;
        }
        colY[col] = currentY + lineH * 0.18;
      }
      break;
    }
  }

  parts.push(folioSvg(f, input.pageLabel));
  return parts.join('');
}

export function joinAuthors(authors: string[]): string {
  if (authors.length <= 1) return authors[0] ?? '';
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
  return `${authors.slice(0, -1).join(', ')}, and ${authors[authors.length - 1]}`;
}

/** Lines a TEXT_PAGE can carry — the planner uses this to split long
 *  sections (introduction, resources) across pages. Mirrors the composer's
 *  own frame + line-height math so the split and the render agree. */
export function textPageLineCapacity(canvasIn: { w: number; h: number }, withHeading: boolean): {
  linesPerPage: number;
  maxCharsPerLine: number;
  paragraphGapLines: number;
} {
  const f = frame(canvasIn);
  const pt = FM_PROSE.pt;
  const lineH = (pt / 72) * f.dpi * FM_PROSE.lineHeight;
  // Heading block (title + rule + spacing) consumes ~1.0in on the first page;
  // continuation pages keep a 0.3in bottom breathing margin. Deductions are
  // generous so the splitter stays just inside what the renderer draws.
  const usable = (f.bottom - f.top) - (withHeading ? 1.0 * f.dpi : 0.3 * f.dpi);
  const frameWidthIn = (f.right - f.left) / f.dpi;
  return {
    linesPerPage: Math.max(8, Math.floor(usable / lineH)),
    maxCharsPerLine: Math.floor(frameWidthIn / ((pt / 72) * 0.5)),
    paragraphGapLines: FM_PROSE.paragraphGapLines,
  };
}

export function referenceTextPageCapacity(canvasIn: { w: number; h: number }, withHeading: boolean): {
  totalLineUnits: number;
  linesPerColumn: number;
  maxCharsPerLine: number;
} {
  const f = compactFrame(canvasIn);
  const pt = 9.25;
  const lineH = (pt / 72) * f.dpi * 1.18;
  const usable = (f.bottom - f.top) - (withHeading ? 0.62 * f.dpi : 0);
  const linesPerColumn = Math.max(12, Math.floor(usable / lineH));
  return {
    totalLineUnits: linesPerColumn * 2 * 10,
    linesPerColumn,
    maxCharsPerLine: Math.floor((f.columnWidth / f.dpi) / ((pt / 72) * 0.5)),
  };
}

export function indexPageCapacity(canvasIn: { w: number; h: number }, withHeading: boolean): {
  totalLineUnits: number;
  linesPerColumn: number;
  maxTitleCharsPerLine: number;
} {
  const f = compactFrame(canvasIn);
  const pt = 9.0;
  const lineH = (pt / 72) * f.dpi * 1.18;
  const usable = (f.bottom - f.top) - (withHeading ? 0.62 * f.dpi : 0);
  const pageNumberWidth = 0.34;
  const titleWidth = f.columnWidth / f.dpi - pageNumberWidth - 0.06;
  const linesPerColumn = Math.max(12, Math.floor(usable / lineH));
  return {
    totalLineUnits: linesPerColumn * 2 * 10,
    linesPerColumn,
    maxTitleCharsPerLine: Math.floor(titleWidth / ((pt / 72) * 0.5)),
  };
}

export async function composeFrontMatterPage(input: ComposeInput): Promise<ComposedPage> {
  const f = frame(input.canvasIn);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f.W}" height="${f.H}" viewBox="0 0 ${f.W} ${f.H}">` +
    `<rect width="100%" height="100%" fill="${PARCHMENT}"/>` +
    buildBody(input, f) +
    `</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().withMetadata({ density: f.dpi }).toBuffer();

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([input.canvasIn.w * 72, input.canvasIn.h * 72]);
  const img = await pdf.embedPng(pngBuffer);
  page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  const pdfBuffer = Buffer.from(await pdf.save());

  return { pngBuffer, pdfBuffer, widthPx: f.W, heightPx: f.H, dpi: f.dpi };
}
