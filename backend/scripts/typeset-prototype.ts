/**
 * TYPESET PROTOTYPE — NO ONE TOLD ME THAT.
 *
 * Standalone. Reads a manuscript file, flows the WHOLE book through Paged.js in
 * one continuous pass, and writes a real vector/searchable PDF. No database, no
 * pipeline integration, no AI, no paid APIs, no manuscript edits.
 *
 * The point is to see the actual book. Page breaking is done by Paged.js, NOT by
 * Pagination v1's character-grid model — the char grid exists so the AI renderer
 * can know a page's text in advance, which a typeset book does not need and
 * which would give a page count that disagrees with the rendered PDF.
 *
 *   tsx scripts/typeset-prototype.ts [outPath]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { sanitizeManuscript } from '../src/pipeline/stage-1-ingestion/sanitize-manuscript.js';
import { loadPagedPolyfill, resolveChromiumPath } from '../src/pipeline/stage-6-layout/render-pdf.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../');
loadDotenv({ path: path.join(REPO_ROOT, '.env') });
loadDotenv({ path: path.join(REPO_ROOT, '.env.development.local'), override: true });

const SOURCE =
  process.env.TYPESET_SOURCE ??
  'C:/Users/jovan/Downloads/puberty boy book/export/NO-ONE-TOLD-ME-THAT_FINAL.md';

// ── Physical spec (CHAPTER_BOOK_STANDARD.md, digest trim) ────────────────────
const TRIM = { w: 5.5, h: 8.5 };
const MARGIN = { top: 0.625, bottom: 0.625, outside: 0.5, gutter: 0.625 };
const TYPE = { bodyPt: 12, leading: 1.3 };
const BOOK_TITLE = 'NO ONE TOLD ME THAT';

// ── Minimal, faithful markdown → HTML ────────────────────────────────────────
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline emphasis only. Applied AFTER escaping so no markup can be injected. */
function inline(s: string): string {
  return esc(s)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>');
}

interface Section { kind: 'chapter' | 'front' | 'back'; number: number | null; title: string; body: string[]; }

/**
 * Split the manuscript on its own structure:
 *   `# Chapter N`  + `## Title`  -> a chapter (title comes from the H2)
 *   `# FRONT MATTER` / `# BACK MATTER` -> matter sections
 *   `###` -> subhead, `####` -> sub-subhead, `---` -> scene break
 * The manuscript's `# NO ONE TOLD ME THAT` title block is dropped: the prototype
 * is the interior, and a title page is generated matter, not manuscript prose.
 */
function parse(md: string): Section[] {
  const lines = md.split('\n');
  const out: Section[] = [];
  let cur: Section | null = null;
  let pendingChapterNo: number | null = null;
  let matter: 'front' | 'back' | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);

    if (h1) {
      const t = h1[1]!.trim();
      const ch = t.match(/^Chapter\s+(\d+)/i);
      if (ch) { pendingChapterNo = Number(ch[1]); matter = null; cur = null; continue; }
      if (/^FRONT MATTER$/i.test(t)) { matter = 'front'; cur = null; continue; }
      if (/^BACK MATTER$/i.test(t)) { matter = 'back'; cur = null; continue; }
      // The book's own title block — skip it and its immediate subtitle lines.
      pendingChapterNo = null; cur = null; matter = null; continue;
    }

    if (h2) {
      const title = h2[1]!.trim();
      cur = {
        kind: pendingChapterNo !== null ? 'chapter' : (matter ?? 'front'),
        number: pendingChapterNo,
        title,
        body: [],
      };
      out.push(cur);
      pendingChapterNo = null;
      continue;
    }

    if (cur) cur.body.push(line);
  }
  return out;
}

/** Body markdown → HTML. Tracks first-paragraph-after-break for flush-left. */
function bodyHtml(lines: string[]): string {
  const html: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  // The first paragraph of a chapter, and the first after any subhead or scene
  // break, is flush-left. Everything else is indented. Classic book convention:
  // the indent marks continuation, so it is wrong where nothing precedes.
  let flushNext = true;

  const flushList = () => {
    if (!list.length) return;
    html.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
    list = [];
    flushNext = false;
  };
  const flushPara = () => {
    if (!para.length) return;
    html.push(`<p class="${flushNext ? 'first' : ''}">${inline(para.join(' '))}</p>`);
    para = [];
    flushNext = false;
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) { flushList(); flushPara(); continue; }

    if (/^-{3,}$/.test(t)) {
      flushList(); flushPara();
      html.push('<p class="scene-break">* * *</p>');
      flushNext = true;                       // first para after a scene break
      continue;
    }
    const h4 = t.match(/^####\s+(.*)$/);
    if (h4) { flushList(); flushPara(); html.push(`<h4>${inline(h4[1]!)}</h4>`); flushNext = true; continue; }
    const h3 = t.match(/^###\s+(.*)$/);
    if (h3) { flushList(); flushPara(); html.push(`<h3>${inline(h3[1]!)}</h3>`); flushNext = true; continue; }
    const li = t.match(/^[-*]\s+(.*)$/);
    if (li) { flushPara(); list.push(li[1]!); continue; }

    flushList();
    para.push(t);
  }
  flushList(); flushPara();
  return html.join('\n');
}

function buildHtml(sections: Section[], polyfill: string): string {
  const chapters = sections.filter((s) => s.kind === 'chapter');
  const body = sections
    .map((s, i) => {
      const label = s.kind === 'chapter' ? `Chapter ${s.number}` : '';
      const cls = s.kind === 'chapter' ? 'chapter' : 'matter';
      return `<section class="${cls}" id="sec-${i}" data-title="${esc(s.title)}" data-label="${esc(label)}">
  <header class="opener">
    ${label ? `<p class="kicker">${esc(label)}</p>` : ''}
    <h2>${esc(s.title)}</h2>
  </header>
  ${bodyHtml(s.body)}
</section>`;
    })
    .join('\n');

  const contentW = TRIM.w - MARGIN.gutter - MARGIN.outside;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(BOOK_TITLE)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Oswald:wght@400;500&display=swap" rel="stylesheet">
<style>
/* ── Page: 5.5x8.5, ZERO bleed, MIRRORED margins (gutter inside) ───────────── */
@page {
  size: ${TRIM.w}in ${TRIM.h}in;
  margin: ${MARGIN.top}in ${MARGIN.outside}in ${MARGIN.bottom}in ${MARGIN.gutter}in;
}
@page :left {
  margin-left: ${MARGIN.outside}in;   /* verso: outside on the left  */
  margin-right: ${MARGIN.gutter}in;   /*        gutter on the right  */
  @top-left  { content: string(booktitle); font-family: 'EB Garamond', serif; font-variant: small-caps; font-size: 9pt; letter-spacing: .06em; }
  @bottom-center { content: counter(page); font-family: 'EB Garamond', serif; font-size: 10pt; }
}
@page :right {
  margin-left: ${MARGIN.gutter}in;
  margin-right: ${MARGIN.outside}in;
  @top-right { content: string(chaptitle); font-family: 'EB Garamond', serif; font-variant: small-caps; font-size: 9pt; letter-spacing: .06em; }
  @bottom-center { content: counter(page); font-family: 'EB Garamond', serif; font-size: 10pt; }
}
/* Chapter-opening pages carry no running head; only a drop folio. */
@page opener { @top-left { content: none; } @top-right { content: none; } }

html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body {
  font-family: 'EB Garamond', Georgia, serif;
  font-size: ${TYPE.bodyPt}pt;
  line-height: ${TYPE.leading};
  text-align: justify;
  hyphens: auto; -webkit-hyphens: auto;
  orphans: 2; widows: 2;                      /* no stranded single lines */
}
.booktitle-src { string-set: booktitle "${esc(BOOK_TITLE)}"; }

/* ── Chapter opening: new page, recto, ~1/3 sink ──────────────────────────── */
section.chapter, section.matter {
  break-before: recto;                        /* always start on a right page */
  page: opener;                               /* first page uses the opener @page */
  string-set: chaptitle attr(data-title);
}
section.chapter > .opener, section.matter > .opener {
  /* ~1/3 of the text block height, the classic drop. */
  padding-top: ${((TRIM.h - MARGIN.top - MARGIN.bottom) / 3).toFixed(3)}in;
  margin-bottom: 2em;
  text-align: center;
  break-after: avoid;
}
.kicker { font-family: 'Oswald', sans-serif; font-weight: 400; font-size: 10pt;
  letter-spacing: .22em; text-transform: uppercase; margin: 0 0 .5em; text-align: center; }
h2 { font-family: 'Oswald', sans-serif; font-weight: 500; font-size: 19pt;
  line-height: 1.15; margin: 0; text-align: center; text-wrap: balance; }

/* ── Body text ────────────────────────────────────────────────────────────── */
p { margin: 0; text-indent: 1.2em; }
p.first { text-indent: 0; }                   /* flush after opener/subhead/break */
h3 { font-family: 'Oswald', sans-serif; font-weight: 500; font-size: 11.5pt;
  letter-spacing: .04em; margin: 1.15em 0 .35em; text-align: left;
  break-after: avoid; break-inside: avoid; }  /* never strand a subhead */
h4 { font-family: 'EB Garamond', serif; font-style: italic; font-weight: 600;
  font-size: 11.5pt; margin: 1em 0 .3em; text-align: left; break-after: avoid; }
ul { margin: .5em 0 .6em 0; padding-left: 1.4em; }
li { margin: 0 0 .18em; text-align: left; }   /* ragged: short items justify badly */
.scene-break { text-indent: 0; text-align: center; margin: .9em 0;
  letter-spacing: .5em; break-after: avoid; break-inside: avoid; }
</style></head>
<body>
<div class="booktitle-src"></div>
${body}
<script>${polyfill}</script>
</body></html>`;
}

async function main(): Promise<void> {
  const chromium = resolveChromiumPath();
  if (!chromium) throw new Error('No Chromium. Set CHROMIUM_PATH in .env.development.local');
  console.log(`chromium : ${chromium}`);
  console.log(`source   : ${SOURCE}`);

  const raw = await readFile(SOURCE, 'utf8');
  // Match what production actually typesets: the sanitized WORKING copy.
  const md = sanitizeManuscript(raw);
  const sections = parse(md);
  const chapters = sections.filter((s) => s.kind === 'chapter');
  console.log(`sections : ${sections.length} (chapters ${chapters.length}, front ${sections.filter(s=>s.kind==='front').length}, back ${sections.filter(s=>s.kind==='back').length})`);

  const polyfill = await loadPagedPolyfill();
  const html = buildHtml(sections, polyfill);

  const outDir = path.join(REPO_ROOT, 'outputs', 'typeset-prototype');
  await mkdir(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'no-one-told-me-that.html');
  await writeFile(htmlPath, html, 'utf8');

  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: chromium, headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser]', m.text().slice(0, 160)); });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 180_000 });

    // Wait for Paged.js to finish: poll until the page count stops growing.
    // Same string-body reason as the report evaluate below.
    await page.waitForFunction(
      `document.querySelectorAll('.pagedjs_page').length > 0`,
      { timeout: 180_000 },
    );
    await page.waitForFunction(
      `(function () {
        const n = document.querySelectorAll('.pagedjs_page').length;
        const s = window.__stable || { n: -1, streak: 0 };
        if (n === s.n) { s.streak++; } else { s.n = n; s.streak = 0; }
        window.__stable = s;
        return s.streak >= 5;
      })()`,
      { timeout: 300_000, polling: 300 },
    );

    // Evaluated as a STRING, not a function. tsx/esbuild injects a `__name`
    // helper into compiled functions; puppeteer serialises the function source
    // into the page, where `__name` does not exist and every evaluate throws
    // "__name is not defined". A string body compiles in the browser untouched.
    const report = (await page.evaluate(`(() => {
      const d = document;
      const total = d.querySelectorAll('.pagedjs_page').length;
      function pageOf(el) {
        const p = el.closest('.pagedjs_page');
        return p ? Number(p.getAttribute('data-page-number')) : null;
      }
      // Paged.js splits one <section> into a fragment PER PAGE, all carrying the
      // same data-title. Only the fragment holding the .opener is the real start.
      const starts = [];
      d.querySelectorAll('section > .opener h2').forEach(function (h) {
        const s = h.closest('section');
        starts.push({ title: s.getAttribute('data-title'), label: s.getAttribute('data-label'), page: pageOf(h) });
      });
      let overflowing = 0;
      const over = [];
      d.querySelectorAll('.pagedjs_page_content').forEach(function (c) {
        const dy = c.scrollHeight - c.clientHeight;
        const dx = c.scrollWidth - c.clientWidth;
        if (dy > 2 || dx > 2) {
          overflowing++;
          const p = c.closest('.pagedjs_page');
          if (p && over.length < 12) over.push({ page: Number(p.getAttribute('data-page-number')), dy: dy, dx: dx });
        }
      });
      const blankPages = [];
      d.querySelectorAll('.pagedjs_page').forEach(function (p) {
        if ((p.textContent || '').replace(/\\s/g, '').length < 4) blankPages.push(Number(p.getAttribute('data-page-number')));
      });
      return { total: total, starts: starts, overflowing: overflowing, overflowPages: over, blank: blankPages.length, blankPages: blankPages };
    })()`)) as {
      total: number;
      starts: Array<{ title: string; label: string; page: number | null }>;
      overflowing: number;
      overflowPages: Array<{ page: number; dy: number; dx: number }>;
      blank: number;
      blankPages: number[];
    };

    const pdfPath = path.join(outDir, 'no-one-told-me-that.pdf');
    const pdf = await page.pdf({
      width: `${TRIM.w}in`, height: `${TRIM.h}in`,
      printBackground: true, preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await writeFile(pdfPath, pdf);

    console.log(`\n=== RESULT ===`);
    console.log(`total pages     : ${report.total}`);
    console.log(`blank-ish pages : ${report.blank}   -> ${report.blankPages.join(', ')}`);
    console.log(`overflowing     : ${report.overflowing}`);
    if (report.overflowPages.length) {
      console.log(`  sample (px over): ${report.overflowPages.map((o) => `p${o.page} dy=${o.dy} dx=${o.dx}`).join('  ')}`);
    }
    console.log(`pdf             : ${pdfPath}`);
    console.log(`html            : ${htmlPath}`);
    console.log(`\n=== SECTION START PAGES ===`);
    for (const s of report.starts) {
      console.log(`  p${String(s.page).padStart(3)}  ${(s.label || 'matter').padEnd(11)} ${s.title}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
