/**
 * DIAGNOSTIC — why are headings and paragraph last lines stretched?
 *
 * Loads the exact renderer HTML in Chromium and dumps DOM + computed styles for
 * representative elements BEFORE and AFTER Paged.js paginates, so we can tell
 * whether the source CSS is wrong, specificity is wrong, or Paged.js rewrites
 * the tree. Read-only: renders nothing, writes nothing.
 */
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });

const { sanitizeManuscript } = await import('../src/pipeline/stage-1-ingestion/sanitize-manuscript.js');
const { buildTypesetHtml, parseTypesetSections, typesetMarginsForTrim } = await import('../src/pipeline/typeset/typeset-book.js');
const { loadPagedPolyfill, resolveChromiumPath } = await import('../src/pipeline/stage-6-layout/render-pdf.js');
const { STABLE_JS } = await import('../src/pipeline/typeset/render-typeset.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');

const md = sanitizeManuscript(
  await readFile('C:/Users/jovan/Downloads/puberty boy book/export/NO-ONE-TOLD-ME-THAT_FINAL.md', 'utf8'),
);
const config = ProjectConfigSchema.parse({
  volume: 1, title: 'NO ONE TOLD ME THAT', authorName: 'Nolan Whitlow',
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  typography: { bodyPt: 12, lineHeight: 1.3 },
});
const sections = parseTypesetSections(md);
const margins = typesetMarginsForTrim(config.trimSize);

// Probe script: string body (tsx's __name helper breaks serialized functions).
const PROBE = `(() => {
  function info(el, label) {
    if (!el) return { label, MISSING: true };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // Which rules match, and which one wins for text-align.
    return {
      label,
      tag: el.tagName,
      cls: el.className || '(none)',
      parent: el.parentElement ? el.parentElement.tagName + '.' + (el.parentElement.className || '') : null,
      grandparent: el.parentElement && el.parentElement.parentElement
        ? el.parentElement.parentElement.tagName + '.' + (el.parentElement.parentElement.className || '') : null,
      display: cs.display,
      textAlign: cs.textAlign,
      textAlignLast: cs.textAlignLast,
      whiteSpace: cs.whiteSpace,
      wordSpacing: cs.wordSpacing,
      letterSpacing: cs.letterSpacing,
      width: Math.round(r.width),
      fontFamily: cs.fontFamily.slice(0, 60),
      innerHTML: (el.innerHTML || '').slice(0, 120),
      childElementCount: el.childElementCount,
      childTags: [...el.children].map(c => c.tagName + '.' + (c.className||'')).slice(0,5),
    };
  }
  function findByText(sel, needle) {
    return [...document.querySelectorAll(sel)].find(e => (e.textContent||'').trim().startsWith(needle)) || null;
  }
  const out = {};
  // Read the label and the title from the SAME opener. Front matter carries no
  // kicker, so querying '.kicker' and '.tsec .opener h2' independently pairs a
  // chapter's label with the front note's title and invents a defect.
  const firstLabelled = [...document.querySelectorAll('.tsec > .opener')].find(o => o.querySelector('.kicker')) || null;
  out.kicker  = info(firstLabelled && firstLabelled.querySelector('.kicker'), 'chapter label');
  out.title   = info(firstLabelled && firstLabelled.querySelector('h2'), 'chapter title (same opener as label)');
  out.h3      = info(findByText('h3', 'What it isn'), 'section heading "What it isn\\'t"');
  out.h3b     = info(findByText('h3', 'The three things'), 'section heading "The three things"');
  out.para    = info(findByText('p', 'One day your body'), 'body paragraph');
  out.lastLine= info(findByText('p', "Here's something nobody warns"), 'short paragraph (was stretched)');
  out.ragged  = info(findByText('p', "It's not a lecture"), 'paragraph whose last line is "make good choices."');
  out.bodyEl  = info(document.body, 'body');
  // Does the opener still match the > selectors after pagination?
  const op = document.querySelector('.opener');
  out.openerMatchesChildSelector = op ? op.matches('.tsec > .opener') : null;
  const h2 = document.querySelector('.opener h2');
  out.h2MatchesChildSelector = h2 ? h2.matches('.tsec > .opener h2') : null;
  out.pagedPages = document.querySelectorAll('.pagedjs_page').length;
  return out;
})()`;

const chromium = resolveChromiumPath();
const { default: puppeteer } = await import('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: chromium!, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();

/**
 * Never gate on `networkidle0`.
 *
 * The typeset CSS pulls its display faces from the Google Fonts CDN. If that
 * request stalls (offline, proxy, blocked egress) the connection count never
 * returns to zero and setContent hangs until the timeout — which is exactly why
 * this harness's "after" pass used to time out while the production renderer,
 * on a Railway box with clean egress, looked fine. Readiness here is a property
 * of the DOM, not of the network: fonts are awaited on a bounded best-effort
 * basis, then pagination is awaited via the renderer's own STABLE_JS.
 */
const FONTS_SETTLED = `document.fonts.status === 'loaded'`;
async function settleFonts(): Promise<void> {
  try {
    await page.waitForFunction(FONTS_SETTLED, { timeout: 15_000, polling: 250 });
  } catch {
    console.warn('  ! fonts did not finish loading in 15s — measuring with fallbacks in place');
  }
}

// ── BEFORE: same HTML, no Paged.js polyfill ─────────────────────────────────
const htmlNoPaged = buildTypesetHtml({ sections, config, margins });
await page.setContent(htmlNoPaged, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await settleFonts();
const before = await page.evaluate(PROBE);

// ── AFTER: with the polyfill, once pagination settles ───────────────────────
const htmlPaged = buildTypesetHtml({ sections, config, margins, polyfillJs: await loadPagedPolyfill() });
await page.setContent(htmlPaged, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await settleFonts();
await page.waitForFunction(`document.querySelectorAll('.pagedjs_page').length > 0`, { timeout: 180_000 });
await page.waitForFunction(STABLE_JS, { timeout: 300_000, polling: 300 });
const after = await page.evaluate(PROBE);

const outDir = path.join(ROOT, 'outputs', 'typeset-prototype');
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'diagnose.json'), JSON.stringify({ before, after }, null, 2));

const KEYS = ['tag','cls','parent','display','textAlign','textAlignLast','whiteSpace','wordSpacing','letterSpacing','width','childElementCount','childTags'] as const;
for (const which of ['before', 'after'] as const) {
  const set = which === 'before' ? before : after;
  console.log(`\n${'='.repeat(20)} ${which.toUpperCase()} PAGED.JS ${'='.repeat(20)}`);
  console.log('pagedPages:', (set as never as Record<string, unknown>).pagedPages,
    '| opener matches ".tsec > .opener":', (set as never as Record<string, unknown>).openerMatchesChildSelector,
    '| h2 matches:', (set as never as Record<string, unknown>).h2MatchesChildSelector);
  for (const k of ['bodyEl','kicker','title','h3','h3b','para','lastLine','ragged']) {
    const e = (set as never as Record<string, Record<string, unknown>>)[k];
    if (!e) continue;
    if (e.MISSING) { console.log(`\n[${k}] MISSING`); continue; }
    console.log(`\n[${k}] ${e.label}`);
    for (const f of KEYS) console.log(`   ${String(f).padEnd(18)} ${JSON.stringify(e[f])}`);
    console.log(`   ${'innerHTML'.padEnd(18)} ${JSON.stringify(e.innerHTML)}`);
  }
}
await browser.close();
process.exit(0);
