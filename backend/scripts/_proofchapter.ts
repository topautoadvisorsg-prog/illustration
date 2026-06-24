/* Typeset a chapter of a TEXT chapter book to a real Paged.js PDF + page PNGs, using
 * the locked middle-grade standard (5.5x8.5, EB Garamond 12/1.3, Option-B centered
 * opener with a soccer-ball mark, recto start, drop folios, drop cap). Reads the
 * manuscript from storage, extracts one chapter, renders with the LOCAL Chrome.
 * Usage: CHROMIUM_PATH=... _proofchapter.ts <projectId> "<chapter heading substring>" */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { getDb } from '../src/db/client.js';
import { projects } from '../src/db/schema/index.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { computePageGeometry } from '../src/pipeline/stage-6-layout/page-geometry.js';
import { loadPagedPolyfill, resolveChromiumPath } from '../src/pipeline/stage-6-layout/render-pdf.js';

const ID = process.argv[2]!;
const WANT = (process.argv[3] ?? 'Chapter One').toLowerCase();
const row = (await getDb().select().from(projects).where(eq(projects.id, ID)))[0]!;
const cfg = (row.config ?? {}) as any;
const trim = cfg.trimSize ?? { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 };
const geometry = computePageGeometry(trim);
const bookTitle = (cfg.title ?? 'THE RAG BALL').toUpperCase();

const md = (await getProjectStorage().readProjectFile((row as any).manuscriptPath)).toString('utf8');
const lines = md.split('\n');
const start = lines.findIndex((l) => /^##\s/.test(l) && l.toLowerCase().includes(WANT));
if (start < 0) { console.error('chapter not found:', WANT); process.exit(1); }
let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
if (end < 0) end = lines.length;
const headingRaw = lines[start]!.replace(/^##\s*/, '').trim();           // "Chapter One — The Rag Ball"
const m = headingRaw.match(/^(chapter\s+[\w-]+)\s*[—–-]\s*(.+)$/i);
const chLabel = (m ? m[1] : 'Chapter').trim();
const chTitle = (m ? m[2] : headingRaw).trim();
const bodyLines = lines.slice(start + 1, end);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inl = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
const paras = bodyLines.join('\n').split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
const isBreak = (p: string) => /^[*•\-—\s\\]+$/.test(p);

const BALL = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#26211b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55z"/><path d="M12 7v-4"/><path d="M15 16l2.5 3"/><path d="M9 16l-2.5 3"/><path d="M16.75 10.5l3.25 -1"/><path d="M7.25 10.5l-3.25 -1"/></svg>`;

let bodyHtml = '';
let first = true;
for (const p of paras) {
  if (isBreak(p)) { bodyHtml += `<div class="brk">${BALL.replace('width="30" height="30"', 'width="16" height="16"')}</div>`; first = true; continue; }
  if (first) { const t = inl(p); bodyHtml += `<p class="first"><span class="drop">${t.charAt(0)}</span>${t.slice(1)}</p>`; first = false; }
  else bodyHtml += `<p>${inl(p)}</p>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Oswald:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page { size: ${trim.widthIn}in ${trim.heightIn}in; margin: 0.625in 0.5in 0.625in 0.625in;
  @bottom-center { content: counter(page); vertical-align: top; padding-top: 2.5pt; font-family:'EB Garamond',serif; font-size:9pt; color:#000; } }
@page :left { margin: 0.625in 0.625in 0.625in 0.5in;
  @top-center { content: "${bookTitle}"; font-family:'Oswald',sans-serif; font-size:8pt; letter-spacing:2.5px; color:#8a7d68; } }
@page :right { margin: 0.625in 0.5in 0.625in 0.625in;
  @top-center { content: string(chtitle); font-family:'Oswald',sans-serif; font-size:8pt; letter-spacing:2.5px; color:#8a7d68; } }
@page chap:first { @top-center { content: none; } @bottom-center { content: none; } }
html,body{margin:0;padding:0;}
${process.env.PREVIEW_CREAM ? '.pagedjs_sheet,.pagedjs_page{background:#F7F1E1 !important;}' : ''}
body{font-family:'EB Garamond',serif;font-size:12pt;line-height:1.3;text-align:left;hyphens:auto;-webkit-hyphens:auto;color:#26211b;}
.chapter{page:chap;break-before:right;}
.opener{text-align:center;padding-top:1.9in;margin-bottom:0.34in;}
.ch-label{font-family:'Oswald',sans-serif;font-weight:500;font-size:11pt;letter-spacing:4px;text-transform:uppercase;color:#8a7d68;text-align:center;}
.ch-title{font-family:'Oswald',sans-serif;font-weight:600;font-size:25pt;letter-spacing:1px;text-transform:uppercase;line-height:1.05;margin:7pt 0 0;text-align:center;text-align-last:center;string-set:chtitle content();}
.ch-ball{margin-top:11pt;text-align:center;}
p{margin:0;text-indent:1.25em;orphans:2;widows:2;text-align:justify;text-align-last:left;}
p.first{text-indent:0;}
.drop{float:left;font-family:'Oswald',sans-serif;font-weight:600;font-size:38pt;line-height:30pt;padding:3pt 7pt 0 0;color:#26211b;}
.brk{text-align:center;margin:13pt 0;}
em{font-style:italic;}
</style></head><body>
<section class="chapter">
  <div class="opener"><div class="ch-label">${esc(chLabel)}</div><div class="ch-title">${esc(chTitle)}</div><div class="ch-ball">${BALL}</div></div>
  ${bodyHtml}
</section>
<script>${await loadPagedPolyfill()}</script>
</body></html>`;

const exe = resolveChromiumPath();
if (!exe) { console.error('No Chromium. Set CHROMIUM_PATH to chrome.exe'); process.exit(1); }
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'] });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  await page.setContent(html, { waitUntil: 'load', timeout: 120000 });
  await page.evaluateHandle('document.fonts.ready');
  await page.waitForFunction(() => (globalThis as any).document.querySelectorAll('.pagedjs_page').length > 0, { timeout: 120000 });
  await page.waitForFunction(() => { const w = globalThis as any; const n = w.document.querySelectorAll('.pagedjs_page').length; const s = w.__st ?? { c: -1, k: 0 }; if (n === s.c && n > 0) s.k++; else { s.c = n; s.k = 0; } w.__st = s; return s.k >= 4; }, { timeout: 120000, polling: 250 });
  const total = await page.evaluate(() => (globalThis as any).document.querySelectorAll('.pagedjs_page').length);
  const pdf = await page.pdf({ width: `${geometry.pageWidthIn}in`, height: `${geometry.pageHeightIn}in`, printBackground: true, preferCSSPageSize: true });
  writeFileSync('C:/Users/jovan/Downloads/_ragball_ch.pdf', Buffer.from(pdf));
  const handles = await page.$$('.pagedjs_page');
  const TOP = 0.625, BOT = 0.625, GUT = 0.625, OUT = 0.5;
  async function withGuides(png: Buffer, idx: number): Promise<Buffer> {
    const meta = await sharp(png).metadata();
    const W = meta.width!, H = meta.height!;
    const sx = W / trim.widthIn, sy = H / trim.heightIn;
    const recto = idx % 2 === 0; // page 1 = recto (gutter on left)
    const left = recto ? GUT : OUT, right = recto ? OUT : GUT;
    const sX = left * sx, sY = TOP * sy, sW = (trim.widthIn - left - right) * sx, sH = (trim.heightIn - TOP - BOT) * sy;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
      + `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" fill="none" stroke="#cc3a2f" stroke-width="2.5" stroke-dasharray="9 6"/>`
      + `<rect x="${sX.toFixed(1)}" y="${sY.toFixed(1)}" width="${sW.toFixed(1)}" height="${sH.toFixed(1)}" fill="none" stroke="#2f7fb5" stroke-width="1.8" stroke-dasharray="7 6"/>`
      + `<text x="9" y="20" font-family="sans-serif" font-size="13" fill="#cc3a2f">trim — cut line</text>`
      + `<text x="${(sX + 6).toFixed(1)}" y="${(sY - 7).toFixed(1)}" font-family="sans-serif" font-size="12" fill="#2f7fb5">text margin — keep inside</text>`
      + `</svg>`;
    return sharp(png).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  }
  const bufs: Buffer[] = [];
  for (let i = 0; i < Math.min(3, handles.length); i++) {
    let png = Buffer.from(await handles[i]!.screenshot({ type: 'png' }));
    if (process.env.GUIDES) png = await withGuides(png, i);
    writeFileSync(`C:/Users/jovan/Downloads/_ragball_p${i + 1}.png`, png);
    bufs.push(png);
  }
  // Reading spread of the verso+recto pair (p2 left, p3 right) so BOTH outer-corner
  // folios are visible; falls back to p1+p2 if the chapter is only 2 pages.
  const pair = bufs.length >= 3 ? [bufs[1]!, bufs[2]!] : bufs.slice(0, 2);
  if (pair.length === 2) {
    const m0 = await sharp(pair[0]!).metadata();
    const W = m0.width!, H = m0.height!, gap = 30, pad = 24;
    const spread = await sharp({ create: { width: W * 2 + gap + pad * 2, height: H + pad * 2, channels: 3, background: '#d8d3c6' } })
      .composite([{ input: pair[0]!, top: pad, left: pad }, { input: pair[1]!, top: pad, left: pad + W + gap }])
      .png().toBuffer();
    writeFileSync('C:/Users/jovan/Downloads/_ragball_spread.png', spread);
  }
  console.log(`rendered "${chLabel} — ${chTitle}" → ${total} pages · spread + PDF in Downloads`);
} finally { await browser.close(); }
process.exit(0);
