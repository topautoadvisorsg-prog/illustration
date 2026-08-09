/**
 * DIAGNOSTIC — why are headings and paragraph last lines stretched?
 *
 * Loads the exact renderer HTML in Chromium and dumps DOM + computed styles for
 * representative elements BEFORE and AFTER Paged.js paginates, so we can tell
 * whether the source CSS is wrong, specificity is wrong, or Paged.js rewrites
 * the tree. Read-only: renders nothing, writes nothing.
 */
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });

const { sanitizeManuscript } = await import('../src/pipeline/stage-1-ingestion/sanitize-manuscript.js');
const { buildTypesetHtml, parseTypesetSections, typesetMarginsForTrim } = await import('../src/pipeline/typeset/typeset-book.js');
const { loadPagedPolyfill, resolveChromiumPath } = await import('../src/pipeline/stage-6-layout/render-pdf.js');
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
  out.kicker  = info(document.querySelector('.kicker'), 'chapter label');
  out.title   = info(document.querySelector('.tsec .opener h2'), 'chapter title');
  out.h3      = info(findByText('h3', 'What it isn'), 'section heading "What it isn\\'t"');
  out.para    = info(findByText('p', 'One day your body'), 'body paragraph');
  out.lastLine= info(findByText('p', "Here's something nobody warns"), 'short paragraph (stretched line)');
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

// ── BEFORE: same HTML, no Paged.js polyfill ─────────────────────────────────
const htmlNoPaged = buildTypesetHtml({ sections, config, margins });
await page.setContent(htmlNoPaged, { waitUntil: 'networkidle0', timeout: 120_000 });
const before = await page.evaluate(PROBE);

// ── AFTER: with the polyfill, once pagination settles ───────────────────────
const htmlPaged = buildTypesetHtml({ sections, config, margins, polyfillJs: await loadPagedPolyfill() });
await page.setContent(htmlPaged, { waitUntil: 'networkidle0', timeout: 180_000 });
await page.waitForFunction(`document.querySelectorAll('.pagedjs_page').length > 0`, { timeout: 180_000 });
await page.waitForFunction(
  `(function(){const n=document.querySelectorAll('.pagedjs_page').length;const s=window.__s||{n:-1,k:0};if(n===s.n)s.k++;else{s.n=n;s.k=0;}window.__s=s;return s.k>=5;})()`,
  { timeout: 300_000, polling: 300 },
);
const after = await page.evaluate(PROBE);

await writeFile(path.join(ROOT, 'outputs', 'typeset-prototype', 'diagnose.json'), JSON.stringify({ before, after }, null, 2));

const KEYS = ['tag','cls','parent','display','textAlign','textAlignLast','whiteSpace','wordSpacing','width','childElementCount','childTags'] as const;
for (const which of ['before', 'after'] as const) {
  const set = which === 'before' ? before : after;
  console.log(`\n${'='.repeat(20)} ${which.toUpperCase()} PAGED.JS ${'='.repeat(20)}`);
  console.log('pagedPages:', (set as never as Record<string, unknown>).pagedPages,
    '| opener matches ".tsec > .opener":', (set as never as Record<string, unknown>).openerMatchesChildSelector,
    '| h2 matches:', (set as never as Record<string, unknown>).h2MatchesChildSelector);
  for (const k of ['bodyEl','kicker','title','h3','para','lastLine']) {
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
