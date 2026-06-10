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

export type FrontMatterPageKind =
  | 'BLANK'
  | 'HALF_TITLE'
  | 'TITLE_PAGE'
  | 'COPYRIGHT_PAGE'
  | 'DEDICATION'
  | 'CONTENTS'
  | 'TEXT_PAGE';

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

function frame(canvasIn: { w: number; h: number }): Frame {
  const dpi = SPACING.printDpi;
  const W = Math.round(canvasIn.w * dpi);
  const H = Math.round(canvasIn.h * dpi);
  const bleed = SPACING.bleedIn * dpi;
  // Front-matter pages breathe more than body pages: 1in margins inside trim.
  const m = 1.0 * dpi;
  return { W, H, left: bleed + m, right: W - bleed - m, top: bleed + m, bottom: H - bleed - m, dpi };
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
      const y = f.top + (f.bottom - f.top) * 0.28;
      parts.push(text(cx, y, (input.title ?? '').toUpperCase(), 26, { tracking: 6 }));
      parts.push(diamond(cx, y + 0.5 * f.dpi, 14));
      break;
    }

    case 'TITLE_PAGE': {
      let y = f.top + (f.bottom - f.top) * 0.22;
      parts.push(text(cx, y, (input.title ?? '').toUpperCase(), 34, { tracking: 8 }));
      if (input.subtitle) {
        y += 0.55 * f.dpi;
        parts.push(text(cx, y, input.subtitle, 16, { italic: true }));
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
      parts.push(text(cx, y, (input.tocHeading ?? 'CONTENTS').toUpperCase(), 20, { tracking: 8 }));
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
        parts.push(text(cx, y, input.heading.toUpperCase(), 18, { tracking: 6 }));
        y += 0.2 * f.dpi;
        parts.push(hairline(cx - 0.8 * f.dpi, cx + 0.8 * f.dpi, y));
        y += 0.45 * f.dpi;
      }
      const pt = TYPOGRAPHY.body.pt; // same body size as the rest of the book
      const lineH = (pt / 72) * f.dpi * TYPOGRAPHY.body.lineHeight;
      const frameWidthIn = (f.right - f.left) / f.dpi;
      const maxChars = Math.floor(frameWidthIn / ((pt / 72) * 0.5));
      for (const para of input.paragraphs ?? []) {
        for (const line of wrapText(para, maxChars)) {
          parts.push(text(f.left, y, line, pt, { anchor: 'start' }));
          y += lineH;
        }
        y += lineH * 0.5; // paragraph gap
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
} {
  const f = frame(canvasIn);
  const pt = TYPOGRAPHY.body.pt;
  const lineH = (pt / 72) * f.dpi * TYPOGRAPHY.body.lineHeight;
  const usable = (f.bottom - f.top) - (withHeading ? 0.85 * f.dpi : 0.2 * f.dpi);
  const frameWidthIn = (f.right - f.left) / f.dpi;
  return {
    linesPerPage: Math.max(8, Math.floor(usable / lineH)),
    maxCharsPerLine: Math.floor(frameWidthIn / ((pt / 72) * 0.5)),
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
