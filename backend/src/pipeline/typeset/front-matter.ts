/**
 * TYPESET FRONT MATTER — title, copyright and contents, set like the book.
 *
 * ─── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * The typeset interior opened on the first manuscript section: no title page,
 * no copyright page, no contents. `parseTypesetSections` deliberately drops the
 * manuscript's own title block with a comment saying the title page is
 * "generated matter" — and the generator it meant belongs to the OTHER render
 * track, the AI whole-page one, and was never wired into this one. So the book
 * was missing front matter that a published book cannot be missing.
 *
 * These pages are built here as real typeset HTML flowed by the same Paged.js
 * pass as the body, in the same faces and the same measure. Not an image, not a
 * separate PDF stitched on afterwards: the type stays vector and searchable and
 * the pages are numbered by the same counter as everything else.
 *
 * ─── WHY THE CONTENTS NEEDS TWO PASSES ────────────────────────────────────
 * A contents page states where things start, and where things start depends on
 * how long the contents page is. Nothing can resolve that in one pass. So the
 * book is rendered twice: once to learn the real section start pages, then
 * again with those numbers filled in. The entries are laid out so the numbers
 * cannot change the line count when they arrive — see `TOC_NUMBER_WIDTH_CH` —
 * and `render-typeset` asserts the two passes agree rather than trusting it.
 */
import type { ProjectConfig } from '@wildlands/shared';

import type { TypesetSection } from './typeset-book.js';

/**
 * Reserved width for a page number, in `ch` units.
 *
 * The number is right-aligned in a fixed box, so a blank first pass and a
 * numbered second pass occupy identical space and the entry cannot rewrap when
 * the real value arrives. Three digits covers any book this platform sets.
 */
export const TOC_NUMBER_WIDTH_CH = 3;

export interface TocEntry {
  /** Stable section slug, so an entry survives a title being re-cased. */
  slug: string;
  /** "Chapter One" and similar. Empty for unlabelled matter. */
  label: string;
  title: string;
  kind: TypesetSection['kind'];
  /** Resolved on the second pass. `null` on the first. */
  page: number | null;
}

export interface FrontMatterInput {
  config: ProjectConfig;
  entries: TocEntry[];
  /**
   * Publication facts. Anything absent is OMITTED rather than invented: an
   * invented ISBN or copyright year on a real book is worse than a gap someone
   * has to fill in.
   */
  publication?: {
    isbn?: string;
    publisher?: string;
    year?: number;
    edition?: string;
    rightsStatement?: string;
    disclaimer?: string;
  };
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The front matter, as HTML to prepend to the body.
 *
 * NO HALF-TITLE. It is traditional and it costs a leaf; this book does not need
 * a page whose only job is to say the title twice.
 */
export function buildFrontMatterHtml(input: FrontMatterInput): string {
  const { config, entries, publication } = input;
  const title = config.title;
  const subtitle = config.subtitle ?? '';
  const author = config.authorName;

  const year = publication?.year ?? new Date().getFullYear();
  const rights =
    publication?.rightsStatement ??
    `All rights reserved. No part of this book may be reproduced in any form without written permission from the publisher, except for brief quotations in a review.`;

  // Publication facts, each omitted when unknown. An ISBN in particular is
  // never fabricated: it is a registered identifier, and a plausible-looking
  // wrong one is far worse than none.
  /**
   * The accuracy note, when the book is set to carry one.
   *
   * Reads off the project, not off a caller argument, so it cannot be switched
   * on for a preview and quietly off for the export. When a reviewer is named,
   * their name is appended — that is the whole point of naming them.
   */
  const note = config.publishing.accuracyNote;
  const accuracyNote =
    note?.enabled && note.text.trim()
      ? [note.text.trim(), note.reviewerName?.trim() ? `Reviewed by ${note.reviewerName.trim()}${note.reviewerCredentials?.trim() ? `, ${note.reviewerCredentials.trim()}` : ''}.` : '']
          .filter(Boolean)
          .join(' ')
      : '';

  const facts: string[] = [];
  if (publication?.edition) facts.push(escapeHtml(publication.edition));
  if (publication?.publisher) facts.push(escapeHtml(publication.publisher));
  if (publication?.isbn) facts.push(`ISBN ${escapeHtml(publication.isbn)}`);

  const toc = entries
    .map((e) => {
      const label = e.label ? `<span class="toc-label">${escapeHtml(e.label)}</span>` : '';
      const num = e.page === null ? '' : String(e.page);
      return (
        `<li class="toc-entry toc-${e.kind}">` +
        `<span class="toc-text">${label}<span class="toc-title">${escapeHtml(e.title)}</span></span>` +
        `<span class="toc-dots" aria-hidden="true"></span>` +
        `<span class="toc-page">${num}</span>` +
        `</li>`
      );
    })
    .join('\n');

  return `
<section class="tmatter title-page">
  <div class="tp-block">
    <h1 class="tp-title">${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="tp-subtitle">${escapeHtml(subtitle)}</p>` : ''}
  </div>
  <p class="tp-author">${escapeHtml(author)}</p>
</section>

<section class="tmatter copyright-page">
  <div class="cp-block">
    <p class="cp-line">${escapeHtml(title)}</p>
    <p class="cp-line">Copyright &copy; ${year} ${escapeHtml(author)}</p>
    <p class="cp-rights">${escapeHtml(rights)}</p>
    ${publication?.disclaimer ? `<p class="cp-rights">${escapeHtml(publication.disclaimer)}</p>` : ''}
    ${accuracyNote ? `<p class="cp-rights cp-accuracy">${escapeHtml(accuracyNote)}</p>` : ''}
    ${facts.length ? `<p class="cp-facts">${facts.join('<br>')}</p>` : ''}
  </div>
</section>

<section class="tmatter toc-page">
  <h2 class="toc-heading">Contents</h2>
  <ul class="toc">
${toc}
  </ul>
</section>`;
}

/**
 * Stylesheet for the front matter.
 *
 * Title and copyright pages carry NO running head and NO folio: they are
 * furniture-free by convention, and a folio on a title page reads as an error.
 * The contents page keeps its folio, because a reader looking up a page number
 * benefits from knowing where they are.
 */
export function frontMatterCss(t: {
  headingFont: string;
  bodyFont: string;
  bodyPt: number;
  displayPt: number;
  labelPt: number;
  captionPt: number;
}): string {
  return `
/* ── Front matter ──────────────────────────────────────────────────────── */
/* Named page strips the running head and folio. Paged.js resolves margin boxes
   per named page, so this is the only reliable way to leave a page bare. */
@page plate { @top-left { content: none; } @top-right { content: none; } @bottom-center { content: none; } }
.title-page, .copyright-page { page: plate; }

/* NO flexbox and NO percentage heights here. Paged.js fragments the flow by
   walking boxes; a flex container with a percentage min-height gives it a box
   whose height depends on a page it has not created yet, and the whole render
   collapsed to zero sections. Vertical position is set with plain top padding,
   which fragments predictably. */
.tmatter { break-before: page; break-after: page; }
.title-page { break-before: recto; }

.title-page { padding-top: 2.1in; }
/* Two-class selectors on purpose. Paged.js reparents content into its page
   containers, and a single-class rule was losing to the body's justified
   default once the element had been moved; the rendered page came out flush
   left while getComputedStyle on the source copy still reported centre. */
.title-page .tp-title,
.title-page .tp-subtitle,
.title-page .tp-author { text-align: center; text-align-last: center; }
/* text-align-last matters as much as text-align here. The body rule for a
   paragraph is justify with text-align-last set to left, so every paragraph's
   LAST line goes flush left - and a one-line title-page paragraph is nothing
   but a last line, which is why centring alone appeared to do nothing.
   NOTE: no backticks in these comments; this whole stylesheet is a template
   literal and a backtick silently ends it. */
.tp-title { text-align: center; font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 600;
  font-size: ${t.displayPt.toFixed(1)}pt; line-height: 1.12; letter-spacing: .01em; margin: 0; }
.tp-subtitle { text-align: center; font-family: '${t.bodyFont}', serif; font-style: italic;
  font-size: ${(t.bodyPt * 1.05).toFixed(2)}pt; line-height: 1.35; margin: 1.1em auto 0; max-width: 86%; }
.tp-author { text-align: center; font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 500;
  font-size: ${t.labelPt + 1}pt; letter-spacing: .12em; text-transform: uppercase; margin: 2.6em 0 0; }

/* Copyright is set flush left and small, never justified. */
.cp-line, .cp-rights, .cp-facts { text-align: left; }

/* Copyright sits low on its page, which is where a reader expects it. */
.copyright-page { padding-top: 4.3in; }
.cp-block { font-family: '${t.bodyFont}', serif; font-size: ${t.captionPt}pt; line-height: 1.45; }
.cp-line { margin: 0 0 .35em; }
.cp-rights { margin: .9em 0 0; }
.cp-facts { margin: .9em 0 0; }

.toc-heading { font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 500;
  font-size: ${(t.displayPt * 0.5).toFixed(2)}pt; letter-spacing: .04em; margin: 0 0 1.2em; }
.toc { list-style: none; margin: 0; padding: 0; font-family: '${t.bodyFont}', serif; font-size: ${t.bodyPt}pt; }
.toc-entry { display: flex; align-items: baseline; gap: .4em; margin: 0 0 .62em; break-inside: avoid; }
.toc-text { flex: 0 1 auto; }
/* The label is set in the display face so a chapter reads as a chapter without
   the word being repeated inside the title. */
.toc-label { font-family: '${t.headingFont}', 'Oswald', sans-serif; font-weight: 500;
  font-size: ${t.labelPt}pt; letter-spacing: .06em; text-transform: uppercase; margin-right: .55em;
  white-space: nowrap; }
.toc-dots { flex: 1 1 auto; border-bottom: 1pt dotted currentColor; opacity: .45; transform: translateY(-.22em); min-width: 1.5em; }
/* Fixed-width and right-aligned: a blank first pass and a numbered second pass
   occupy the same space, so filling the numbers in cannot rewrap an entry. */
.toc-page { flex: 0 0 ${TOC_NUMBER_WIDTH_CH}ch; text-align: right; font-variant-numeric: tabular-nums; }
.toc-back .toc-title, .toc-front .toc-title { font-style: italic; }
`;
}
