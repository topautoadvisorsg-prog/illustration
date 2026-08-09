/**
 * Render a typeset book: HTML -> Paged.js -> vector PDF, plus a page report.
 *
 * Chromium is required (puppeteer-core bundles no browser). `resolveChromiumPath()`
 * probes CHROMIUM_PATH / PUPPETEER_EXECUTABLE_PATH first, then common Linux
 * paths — on Windows the env var is mandatory.
 */

import type { ProjectConfig } from '@wildlands/shared';
import { loadPagedPolyfill, resolveChromiumPath } from '../stage-6-layout/render-pdf.js';
import {
  buildTypesetHtml,
  parseTypesetSections,
  typesetMarginsForTrim,
  TYPESET_DONE_JS,
  type TypesetMargins,
  type TypesetReport,
} from './typeset-book.js';
import type { TypesetLayoutStandard } from './layout-standards/types.js';
import type { TypesetBlockRef } from './block-identity.js';
import type { OverrideCssResult } from './layout-overrides.js';

export interface RenderTypesetInput {
  markdown: string;
  config: ProjectConfig;
  margins?: TypesetMargins;
  chaptersStartRecto?: boolean;
  /** The project's pinned layout standard. Omitted only by tests. */
  layoutStandard?: TypesetLayoutStandard;
  /**
   * Also collect per-block line geometry. Off by default: it costs an extra DOM
   * pass and nothing in the production path needs it. Used to prove that a
   * change touching text metrics did not move a single line break.
   */
  deepProbe?: boolean;
}

/**
 * One addressable block, measured after pagination.
 *
 * `lines` holds the block's line BOXES, not its characters. `getClientRects()`
 * over a range spanning the block returns one rect per line fragment, so both
 * the count and the widths change the moment a word moves to another line —
 * which makes it a cheap whole-book detector for "did this wrap differently".
 * `textSha` catches the coarser failure a geometry check would miss: text lost,
 * duplicated, or reordered.
 */
export interface TypesetBlockProbe {
  blockId: string;
  /**
   * Which fragment of the block this is, 0-based. Paged.js splits a block that
   * crosses a page break into one element per page, all carrying the SAME
   * data-block-id. Without this index a comparison keyed on the id alone lines
   * up one run's first fragment against the other's second and reports a
   * whole-book repagination that never happened.
   */
  frag: number;
  page: number | null;
  /** Tag plus classes, so a heading, a list item and an alert panel differ. */
  kind: string;
  /** Per line: [top, left, width] relative to the page box, 2dp. */
  lines: [number, number, number][];
  textSha: string;
  chars: number;
}

export interface RenderTypesetResult {
  pdf: Buffer;
  report: TypesetReport;
  /** The HTML actually rendered, for debugging a layout complaint. */
  html: string;
  /** Every addressable block in the book, in reading order. */
  blocks: TypesetBlockRef[];
  /** Which local overrides applied, and which matched no block. */
  overrides: OverrideCssResult;
  /** Present only when `deepProbe` was requested. Reading order. */
  probe?: TypesetBlockProbe[];
}

export class TypesetUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TypesetUnavailableError';
  }
}

/**
 * Browser-side measurement, passed as a STRING rather than a function.
 *
 * tsx/esbuild injects a `__name` helper into compiled functions; puppeteer
 * serialises the function source into the page, where `__name` does not exist,
 * and every `page.evaluate` throws "__name is not defined". A string body is
 * compiled by the browser untouched. Do not convert these back to arrow
 * functions.
 */
const MEASURE_JS = `(() => {
  const d = document;
  function pageNumOf(el) {
    const p = el.closest('.pagedjs_page');
    return p ? Number(p.getAttribute('data-page-number')) : null;
  }
  // Paged.js splits one <section> into a fragment per page, each carrying the
  // same data-title. Only the fragment holding .opener is the true start.
  const sectionStarts = [];
  d.querySelectorAll('section.tsec > .opener h2').forEach(function (h) {
    const s = h.closest('section');
    sectionStarts.push({
      title: s.getAttribute('data-title'),
      label: s.getAttribute('data-label') || '',
      kind: s.getAttribute('data-kind') || '',
      page: pageNumOf(h),
    });
  });
  // Only VERTICAL overflow means text is at risk of being cut. Paged.js page
  // containers routinely report a large constant horizontal scrollWidth that is
  // a container artifact, not content, so measuring dx produces false alarms.
  const verticalOverflowPages = [];
  d.querySelectorAll('.pagedjs_page_content').forEach(function (c) {
    if (c.scrollHeight - c.clientHeight > 2) {
      const p = c.closest('.pagedjs_page');
      if (p) verticalOverflowPages.push(Number(p.getAttribute('data-page-number')));
    }
  });
  const blankPages = [];
  d.querySelectorAll('.pagedjs_page').forEach(function (p) {
    if ((p.textContent || '').replace(/\\s/g, '').length < 4) {
      blankPages.push(Number(p.getAttribute('data-page-number')));
    }
  });
  // Which stable blocks landed on which page. This is the ONLY honest way to
  // answer "what is on page 88?" — the block ids come from the manuscript, but
  // where they end up is a pagination result, so it must be measured after
  // Paged.js has finished rather than predicted. A block split across a spread
  // appears under both pages.
  const pageBlocks = {};
  d.querySelectorAll('[data-block-id]').forEach(function (el) {
    const n = pageNumOf(el);
    if (!n) return;
    const id = el.getAttribute('data-block-id');
    if (!pageBlocks[n]) pageBlocks[n] = [];
    if (pageBlocks[n].indexOf(id) === -1) pageBlocks[n].push(id);
  });
  return {
    totalPages: d.querySelectorAll('.pagedjs_page').length,
    sectionStarts: sectionStarts,
    verticalOverflowPages: verticalOverflowPages,
    blankPages: blankPages,
    pageBlocks: pageBlocks,
  };
})()`;

/**
 * Line-level probe. A string for the same reason as MEASURE_JS above — do not
 * convert it to a function.
 *
 * Line boxes are recorded RELATIVE to their page box. Absolute coordinates
 * would differ between two runs for reasons that have nothing to do with
 * wrapping (a block landing on a later page sits lower on the strip), and a
 * detector that fires on everything tells you nothing.
 */
const DEEP_PROBE_JS = `(() => {
  const d = document;
  // Synchronous FNV-1a. crypto.subtle is async and this runs inside a single
  // evaluate; the hash only has to detect change, not resist an adversary.
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  const r2 = function (n) { return Math.round(n * 100) / 100; };
  const out = [];
  const fragSeen = {};
  d.querySelectorAll('[data-block-id]').forEach(function (el) {
    const pageEl = el.closest('.pagedjs_page');
    const page = pageEl ? Number(pageEl.getAttribute('data-page-number')) : null;
    const origin = pageEl ? pageEl.getBoundingClientRect() : { top: 0, left: 0 };
    const range = d.createRange();
    range.selectNodeContents(el);
    const lines = [];
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const b = rects[i];
      if (b.width < 0.5 && b.height < 0.5) continue; // collapsed artifacts
      lines.push([r2(b.top - origin.top), r2(b.left - origin.left), r2(b.width)]);
    }
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    const id = el.getAttribute('data-block-id');
    fragSeen[id] = fragSeen[id] === undefined ? 0 : fragSeen[id] + 1;
    out.push({
      blockId: id,
      frag: fragSeen[id],
      page: page,
      kind: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\\s+/).join('.') : ''),
      lines: lines,
      textSha: hash(text),
      chars: text.length,
    });
  });
  return out;
})()`;

export class TypesetIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TypesetIncompleteError';
  }
}

/**
 * Second gate: every section in the manuscript must appear in the paginated DOM.
 *
 * The completion hook is the primary signal, but a page count alone cannot tell
 * you whether the END of the book made it — a truncated render reports a
 * plausible number of pages and zero overflow, because the pages it did lay out
 * are all fine. Comparing rendered section openers against the sections we fed
 * in makes "the book stopped early" structurally impossible to accept, whatever
 * the cause.
 */
export function assertTypesetComplete(
  renderedSectionTitles: readonly string[],
  expectedSectionTitles: readonly string[],
): void {
  if (renderedSectionTitles.length === expectedSectionTitles.length) return;
  const missing = expectedSectionTitles.filter((t) => !renderedSectionTitles.includes(t));
  throw new TypesetIncompleteError(
    `Typesetting stopped early: ${renderedSectionTitles.length} of ${expectedSectionTitles.length} sections reached the page. ` +
      `Missing: ${missing.slice(0, 3).map((t) => JSON.stringify(t)).join(', ')}${missing.length > 3 ? ` (+${missing.length - 3} more)` : ''}. ` +
      `The PDF would have been a partial book reporting no overflow.`,
  );
}

export async function renderTypesetBook(input: RenderTypesetInput): Promise<RenderTypesetResult> {
  const chromium = resolveChromiumPath();
  if (!chromium) {
    throw new TypesetUnavailableError(
      'Typesetting needs a Chromium browser and none was found. Set CHROMIUM_PATH (or PUPPETEER_EXECUTABLE_PATH) to a Chrome/Chromium executable.',
    );
  }

  const margins = input.margins ?? typesetMarginsForTrim(input.config.trimSize);
  const sections = parseTypesetSections(input.markdown);
  if (sections.length === 0) {
    throw new TypesetUnavailableError(
      'No typesettable sections found. The manuscript needs chapter headings (e.g. "# Chapter 1" followed by "## Title").',
    );
  }

  const polyfillJs = await loadPagedPolyfill();
  const blocks: TypesetBlockRef[] = [];
  const overrideReport: OverrideCssResult[] = [];
  const html = buildTypesetHtml({
    ...input,
    sections,
    margins,
    polyfillJs,
    layoutStandard: input.layoutStandard,
    collectBlocks: blocks,
    overrideReport,
  });

  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: chromium,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    // Fonts are vendored into the document, so nothing is fetched at render
    // time and there is no network to go idle. Completion comes from Paged.js.
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForFunction(TYPESET_DONE_JS, { timeout: 300_000, polling: 250 });

    const measured = (await page.evaluate(MEASURE_JS)) as Omit<
      TypesetReport,
      'trim' | 'marginsIn' | 'bodyPt' | 'lineHeight'
    >;

    assertTypesetComplete(
      measured.sectionStarts.map((s) => s.title),
      sections.map((s) => s.title),
    );

    // Measured before page.pdf(), so the probe describes the same layout the
    // PDF is generated from rather than a state the printing pass may perturb.
    const probe = input.deepProbe ? ((await page.evaluate(DEEP_PROBE_JS)) as TypesetBlockProbe[]) : undefined;

    const pdf = await page.pdf({
      width: `${input.config.trimSize.widthIn}in`,
      height: `${input.config.trimSize.heightIn}in`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return {
      pdf: Buffer.from(pdf),
      html,
      blocks,
      probe,
      overrides: overrideReport[0] ?? { css: '', orphaned: [], applied: [] },
      report: {
        ...measured,
        trim: { widthIn: input.config.trimSize.widthIn, heightIn: input.config.trimSize.heightIn },
        marginsIn: margins,
        bodyPt: input.config.typography.bodyPt,
        lineHeight: input.config.typography.lineHeight,
      },
    };
  } finally {
    await browser.close();
  }
}
