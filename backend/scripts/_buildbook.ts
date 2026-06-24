/* Render the FULL text chapter book to a real Paged.js PDF on cream, with: front
 * matter (title / copyright / auto Table of Contents), all chapters (each with a
 * reserved full-page illustration slot on the facing verso + the locked Option-B
 * opener), and back matter. Also writes a contact sheet of every page for review.
 * Folio is centered, raised, 11pt. Production file omits the cream tint + guides.
 * Usage: PREVIEW_CREAM=1 CHROMIUM_PATH=... _buildbook.ts <projectId> */
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { projects, pages as pagesTbl, wholePageRenders } from '../src/db/schema/index.js';
import { getProjectStorage, SupabaseStorageService } from '../src/services/storage/project-storage.js';
import { computePageGeometry } from '../src/pipeline/stage-6-layout/page-geometry.js';
import { loadPagedPolyfill, resolveChromiumPath } from '../src/pipeline/stage-6-layout/render-pdf.js';

const ID = process.argv[2]!;
const row = (await getDb().select().from(projects).where(eq(projects.id, ID)))[0]!;
const cfg = (row.config ?? {}) as any;
const trim = cfg.trimSize ?? { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 };
const geometry = computePageGeometry(trim);
const bookTitle = (cfg.title ?? 'THE RAG BALL').toUpperCase();
const md = (await getProjectStorage().readProjectFile((row as any).manuscriptPath)).toString('utf8');
const lines = md.split('\n');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inl = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
// A scene break is ONLY an asterisk/bullet run (e.g. "* * *") — never a "\" spacer
// or a dash. Backslash-only "paragraphs" are markdown blank-line artifacts: dropped.
const isBreak = (p: string) => /[*••]/.test(p) && /^[*••\s]+$/.test(p);
function splitParas(text: string): string[] {
  return text.split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim().replace(/^>\s*/, '')) // strip markdown blockquote marker
    .filter((p) => p && !/^[\\\s]+$/.test(p) && !/^[-–—\s]+$/.test(p)); // drop blank / "\" spacer / "---" rule lines
}
// Body with drop cap on the FIRST paragraph + scene breaks. Drop cap is taken from
// the RAW first letter, so it never splits an HTML tag/entity (the em>/gt; bug).
function bodyToHtml(text: string): string {
  let html = '', first = true;
  for (const p of splitParas(text)) {
    if (isBreak(p)) { html += `<div class="brk">${BALL_SM}</div>`; first = true; continue; }
    if (first && /^[A-Za-z]/.test(p)) { html += `<p class="first"><span class="drop">${esc(p.charAt(0))}</span>${inl(p.slice(1))}</p>`; first = false; }
    else if (first) { html += `<p class="first">${inl(p)}</p>`; first = false; }
    else html += `<p>${inl(p)}</p>`;
  }
  return html;
}
// Front/back matter: clean paragraphs, NO drop cap, NO scene-break balls.
function plainBody(text: string): string {
  return splitParas(text).filter((p) => !isBreak(p)).map((p) => `<p>${inl(p)}</p>`).join('');
}
const BALL = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55z"/><path d="M12 7v-4"/><path d="M15 16l2.5 3"/><path d="M9 16l-2.5 3"/><path d="M16.75 10.5l3.25 -1"/><path d="M7.25 10.5l-3.25 -1"/></svg>`;
const BALL_SM = BALL.replace('width="30" height="30"', 'width="15" height="15"');

interface Sec { heading: string; body: string[] }
const titleLine = (lines.find((l) => /^#\s/.test(l)) ?? '# THE RAG BALL').replace(/^#\s*/, '').trim();
const subtitle = (lines.find((l) => /^###\s*\*/.test(l)) ?? '').replace(/^###\s*/, '').replace(/\*/g, '').trim();
const author = (cfg.authorName ?? 'MARCO DELUNA').toUpperCase();
const secs: Sec[] = [];
let cur: Sec | null = null;
for (const l of lines) {
  if (/^##\s/.test(l)) { if (cur) secs.push(cur); cur = { heading: l.replace(/^##\s*/, '').trim(), body: [] }; }
  else if (cur) cur.body.push(l);
}
if (cur) secs.push(cur);

const chapters = secs.filter((s) => /^chapter\s/i.test(s.heading));
const backMatter = secs.filter((s) => !/^chapter\s/i.test(s.heading) && !/^(copyright|contents)$/i.test(s.heading));
const copyright = secs.find((s) => /^copyright$/i.test(s.heading));

// --- front matter ---
let html = `<section class="front titlepage"><div class="tp-title">${esc(titleLine.toUpperCase())}</div>`
  + (subtitle ? `<div class="tp-sub">${esc(subtitle)}</div>` : '')
  + `<div class="tp-ball">${BALL}</div><div class="tp-author">${esc(author)}</div></section>`;
if (copyright) html += `<section class="front copyright">${plainBody(copyright.body.join('\n'))}</section>`;
// Table of contents (auto page numbers via target-counter)
html += `<section class="front toc"><h2 class="toc-h">Contents</h2><ul>`;
chapters.forEach((c, i) => {
  const m = c.heading.match(/^(chapter\s+[\w-]+)\s*[—–-]\s*(.+)$/i);
  const t = m ? `${m[1]} — ${m[2]}` : c.heading;
  html += `<li><a href="#ch-${i + 1}">${esc(t)}</a></li>`;
});
html += `</ul></section>`;

// --- chapters: reserved illustration verso + opener recto + body ---
chapters.forEach((c, i) => {
  const m = c.heading.match(/^(chapter\s+[\w-]+)\s*[—–-]\s*(.+)$/i);
  const label = (m ? m[1] : 'Chapter').trim();
  const title = (m ? m[2] : c.heading).trim();
  html += `<section class="illo"><div class="illo-frame"><div>Full-page illustration<br><span>${esc(label)}</span></div></div></section>`;
  html += `<section class="chapter" id="ch-${i + 1}">`
    + `<div class="opener"><div class="ch-label">${esc(label)}</div><div class="ch-title">${esc(title)}</div><div class="ch-ball">${BALL}</div></div>`
    + bodyToHtml(c.body.join('\n')) + `</section>`;
});

// --- back matter ---
for (const s of backMatter) {
  html += `<section class="backmatter"><div class="bm-head">${esc(s.heading)}</div>${plainBody(s.body.join('\n'))}</section>`;
}

const creamCss = process.env.PREVIEW_CREAM ? '.pagedjs_sheet,.pagedjs_page{background:#F7F1E1 !important;}' : '';
const fullHtml = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Oswald:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page { size: ${trim.widthIn}in ${trim.heightIn}in; margin: 0.625in 0.5in 0.625in 0.625in;
  @bottom-center { content: counter(page); vertical-align: top; padding-top: 2.5pt; font-family:'EB Garamond',serif; font-size:11pt; color:#000; } }
@page :left { margin: 0.625in 0.625in 0.625in 0.5in; @top-center { content: "${bookTitle}"; font-family:'Oswald',sans-serif; font-size:8pt; letter-spacing:2.5px; color:#6f6552; } }
@page :right { margin: 0.625in 0.5in 0.625in 0.625in; @top-center { content: string(chtitle); font-family:'Oswald',sans-serif; font-size:8pt; letter-spacing:2.5px; color:#6f6552; } }
@page chap:first { @top-center { content: none; } @bottom-center { content: none; } }
@page front { @top-center { content: none; } @bottom-center { content: none; } }
@page illo { @top-center { content: none; } @bottom-center { content: none; } }
@page :blank { @top-center { content: none; } @bottom-center { content: none; } }
html,body{margin:0;padding:0;}
${creamCss}
body{font-family:'EB Garamond',serif;font-size:12pt;line-height:1.3;text-align:left;hyphens:auto;-webkit-hyphens:auto;color:#000;}
section{}
.front{page:front;}
.titlepage{break-before:right;text-align:center;padding-top:2.4in;}
.tp-title{font-family:'Oswald',sans-serif;font-weight:600;font-size:40pt;letter-spacing:2px;text-transform:uppercase;line-height:1.02;}
.tp-sub{font-family:'EB Garamond',serif;font-style:italic;font-size:14pt;color:#333;margin-top:14pt;}
.tp-ball{margin-top:26pt;}
.tp-ball svg{width:40px;height:40px;}
.tp-author{font-family:'Oswald',sans-serif;font-weight:500;font-size:14pt;letter-spacing:3px;text-transform:uppercase;margin-top:24pt;}
.copyright{break-before:left;font-size:9.5pt;line-height:1.4;padding-top:4.4in;}
.copyright p{text-indent:0;margin:0 0 6pt;text-align:left;}
.toc{break-before:right;}
.toc-h{font-family:'Oswald',sans-serif;font-weight:600;font-size:20pt;letter-spacing:1px;text-transform:uppercase;text-align:center;margin:0.3in 0 0.4in;}
.toc ul{list-style:none;margin:0;padding:0;}
.toc li{margin:0 0 9pt;}
.toc a{text-decoration:none;color:#000;display:flex;justify-content:space-between;align-items:baseline;}
.toc a::after{content:target-counter(attr(href), page);padding-left:12px;font-variant-numeric:lining-nums;}
.illo{page:illo;break-before:left;}
.illo-frame{border:1.6px dashed #b3a98f;height:6.9in;display:flex;align-items:center;justify-content:center;text-align:center;color:#9a917d;font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:2px;font-size:11pt;line-height:1.7;}
.illo-frame span{font-weight:600;color:#7d745f;}
.chapter{page:chap;break-before:right;}
.opener{text-align:center;padding-top:1.9in;margin-bottom:0.34in;}
.ch-label{font-family:'Oswald',sans-serif;font-weight:500;font-size:11pt;letter-spacing:4px;text-transform:uppercase;color:#6f6552;text-align:center;}
.ch-title{font-family:'Oswald',sans-serif;font-weight:600;font-size:25pt;letter-spacing:1px;text-transform:uppercase;line-height:1.05;margin:7pt 0 0;text-align:center;text-align-last:center;string-set:chtitle content();}
.ch-ball{margin-top:11pt;text-align:center;}
p{margin:0;text-indent:1.25em;orphans:2;widows:2;text-align:justify;text-align-last:left;}
p.first{text-indent:0;}
.drop{float:left;font-family:'Oswald',sans-serif;font-weight:600;font-size:38pt;line-height:30pt;padding:3pt 7pt 0 0;color:#000;}
.brk{text-align:center;margin:13pt 0;}
.backmatter{break-before:right;}
.bm-head{font-family:'Oswald',sans-serif;font-weight:600;font-size:18pt;letter-spacing:1px;text-transform:uppercase;text-align:center;padding-top:1.4in;margin-bottom:0.3in;string-set:chtitle content();}
em{font-style:italic;}
</style></head><body>${html}
<script>${await loadPagedPolyfill()}</script></body></html>`;

const exe = resolveChromiumPath();
if (!exe) { console.error('No Chromium. Set CHROMIUM_PATH.'); process.exit(1); }
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'] });
try {
  const page = await browser.newPage();
  // 2× device scale → crisp page PNGs (so "open image in new tab" is legible at full size).
  await page.setViewport({ width: 900, height: 1400, deviceScaleFactor: 2 });
  page.setDefaultTimeout(300000);
  await page.setContent(fullHtml, { waitUntil: 'load', timeout: 300000 });
  await page.evaluateHandle('document.fonts.ready');
  await page.waitForFunction(() => (globalThis as any).document.querySelectorAll('.pagedjs_page').length > 0, { timeout: 300000 });
  await page.waitForFunction(() => { const w = globalThis as any; const n = w.document.querySelectorAll('.pagedjs_page').length; const s = w.__st ?? { c: -1, k: 0 }; if (n === s.c && n > 0) s.k++; else { s.c = n; s.k = 0; } w.__st = s; return s.k >= 5; }, { timeout: 300000, polling: 350 });
  const total: number = await page.evaluate(() => (globalThis as any).document.querySelectorAll('.pagedjs_page').length);
  const pdf = await page.pdf({ width: `${geometry.pageWidthIn}in`, height: `${geometry.pageHeightIn}in`, printBackground: true, preferCSSPageSize: true });
  writeFileSync('C:/Users/jovan/Downloads/_ragball_BOOK.pdf', Buffer.from(pdf));
  console.log(`rendered FULL BOOK → ${total} pages · PDF: Downloads/_ragball_BOOK.pdf`);

  // contact sheet of every page (thumbnails) for review
  const handles = await page.$$('.pagedjs_page');
  const thumbs: Buffer[] = [];
  for (const h of handles) {
    const shot = Buffer.from(await h.screenshot({ type: 'png' }));
    thumbs.push(await sharp(shot).resize({ width: 150 }).extend({ bottom: 2, right: 2, background: '#bbb' }).toBuffer());
  }
  const cols = 8, tw = 152;
  const m0 = await sharp(thumbs[0]!).metadata(); const th = m0.height!;
  const rows = Math.ceil(thumbs.length / cols);
  const sheet = sharp({ create: { width: cols * tw + 16, height: rows * (th + 8) + 16, channels: 3, background: '#ffffff' } });
  const comps = thumbs.map((b, i) => ({ input: b, left: 8 + (i % cols) * tw, top: 8 + Math.floor(i / cols) * (th + 8) }));
  writeFileSync('C:/Users/jovan/Downloads/_ragball_CONTACT.png', await sheet.composite(comps).png().toBuffer());
  console.log(`contact sheet (${thumbs.length} pages) → Downloads/_ragball_CONTACT.png`);
  if (process.env.SHOTS) {
    for (const n of process.env.SHOTS.split(',').map((x) => Number(x.trim()))) {
      if (handles[n - 1]) { writeFileSync(`C:/Users/jovan/Downloads/_ragball_page${n}.png`, Buffer.from(await handles[n - 1]!.screenshot({ type: 'png' }))); }
    }
    console.log('full-size shots saved:', process.env.SHOTS);
  }

  // LOAD: publish the typeset pages INTO the platform so the console's Render &
  // Review shows the real book — page rows + active render rows pointing at PNGs
  // stored in SUPABASE (what the deployed backend reads). No AI spend. View-only:
  // do NOT click "render" in the console (that calls the AI engine).
  // Storage MUST live under /experimental/whole-page/ — the file endpoint's allowlist
  // only serves render-artifact folders; anything else returns 400 (broken images).
  const pageKey = (n: number) => ['experimental', 'whole-page', `p${String(n).padStart(3, '0')}.png`];
  if (process.env.RELINK) {
    // Corrective, additive: re-upload PNGs to the allowed folder and UPDATE each
    // existing active render's imagePath. No inserts, no deletes.
    const db = getDb();
    const supa = new SupabaseStorageService();
    const exPages = await db.select().from(pagesTbl).where(eq(pagesTbl.projectId, ID));
    let done = 0;
    for (let i = 0; i < handles.length; i++) {
      const n = i + 1;
      const pr = exPages.find((p) => p.plannedPageNumber === n);
      if (!pr) continue;
      const png = Buffer.from(await handles[i]!.screenshot({ type: 'png' }));
      const stored = await supa.writeProjectFile(ID, pageKey(n), png);
      await db.update(wholePageRenders).set({ imagePath: stored.relativePath }).where(and(eq(wholePageRenders.projectId, ID), eq(wholePageRenders.pageId, pr.id)));
      done++;
      if (n % 25 === 0) console.log(`  relinked ${n}/${handles.length}`);
    }
    console.log(`RELINKED ${done} pages to /experimental/whole-page/ (now served by the file endpoint).`);
  } else if (process.env.LOAD) {
    const db = getDb();
    const supa = new SupabaseStorageService();
    const emptyHash = createHash('sha256').update('').digest('hex');
    const existing = await db.select({ id: pagesTbl.id }).from(pagesTbl).where(eq(pagesTbl.projectId, ID));
    if (existing.length > 0 && !process.env.CLEAR) {
      console.log(`ABORT load: project already has ${existing.length} page rows. Use RELINK=1 to refresh imagePaths, or CLEAR=1 to fully replace.`);
      process.exit(0);
    }
    if (existing.length > 0 && process.env.CLEAR) {
      await db.delete(wholePageRenders).where(eq(wholePageRenders.projectId, ID));
      await db.delete(pagesTbl).where(eq(pagesTbl.projectId, ID));
      console.log(`CLEAR: removed ${existing.length} existing page rows for this project.`);
    }
    for (let i = 0; i < handles.length; i++) {
      const n = i + 1;
      const png = Buffer.from(await handles[i]!.screenshot({ type: 'png' }));
      const stored = await supa.writeProjectFile(ID, pageKey(n), png);
      const [pg] = await db.insert(pagesTbl).values({ projectId: ID, pageKey: `RB_P${String(n).padStart(3, '0')}`, chapterNumber: 0, plannedPageNumber: n }).returning({ id: pagesTbl.id });
      await db.insert(wholePageRenders).values({ pageId: pg!.id, projectId: ID, version: 1, status: 'RENDERED', specJson: {}, assembledPrompt: '', promptSha256: emptyHash, standardVersion: 'typeset-v1', imagePath: stored.relativePath, active: true });
      if (n % 25 === 0) console.log(`  loaded ${n}/${handles.length}`);
    }
    console.log(`LOADED ${handles.length} typeset pages into the platform (Supabase). Open Step 7 · Render & Review to view.`);
  }
} finally { await browser.close(); }
process.exit(0);
