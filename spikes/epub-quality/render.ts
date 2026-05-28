/**
 * Spike 5 — EPUB Export
 *
 * Renders the same 30-page fixture used by the PDF bake-off into a Kindle-compatible
 * EPUB. This proves content parity: PDF and EPUB are both generated from the
 * identical page-manifest source, so they cannot drift.
 *
 * Per Stage 8 README, the spec's "150 DPI minimum" for EPUB images is a category
 * error (EPUBs don't have DPI). We reinterpret it as: images max 1600 px wide
 * (Kindle practical cap). Sharp downscales any oversize source before embed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import epub from 'epub-gen-memory';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, '../pdf-engine-bakeoff/fixture');
const OUTPUT_DIR = path.resolve(__dirname, 'output');
const MAX_IMG_WIDTH_PX = 1600; // Kindle practical cap

interface Manifest {
  manifest_id: string;
  page_number: number;
  chapter_number: number;
  chapter_name: string;
  entry_name: string;
  scientific_name: string | null;
  layout_template: string;
  is_danger_page: boolean;
  body_text: {
    title: string;
    subtitle: string;
    intro: string;
    sections: Array<{ header: string; body: string }>;
  };
  illustration: { subject: string; annotations: string[] };
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function entryToHtml(m: Manifest, imgFilename: string): string {
  const sectionsHtml = m.body_text.sections
    .map(
      (s) => `<h3 class="section-header">${esc(s.header)}</h3>\n<p class="section-body">${esc(s.body)}</p>`,
    )
    .join('\n');

  const annotationsHtml = m.illustration.annotations
    .map((a) => `<span>${esc(a)}</span>`)
    .join('');

  return `<div class="entry${m.is_danger_page ? ' is-danger' : ''}">
  <h1 class="entry-title">${esc(m.body_text.title)}</h1>
  <p class="scientific-name"><em>${esc(m.body_text.subtitle)}</em></p>
  <figure class="illustration">
    <img src="${imgFilename}" alt="${esc(m.entry_name)}" />
    <figcaption class="annotations">${annotationsHtml}</figcaption>
  </figure>
  ${m.is_danger_page ? '<p class="warning"><strong>⚠ TOXIC — DO NOT EAT</strong></p>' : ''}
  <p class="intro"><em>${esc(m.body_text.intro)}</em></p>
  ${sectionsHtml}
</div>`;
}

const EPUB_CSS = `
body { font-family: Georgia, serif; color: #2C1A0E; background: #F5EDD6; line-height: 1.55; }
.entry { page-break-before: always; margin-bottom: 1.5em; }
.entry-title { font-family: Georgia, serif; font-weight: bold; font-size: 1.8em; margin: 0 0 0.2em 0; text-transform: uppercase; letter-spacing: 0.02em; }
.scientific-name { font-size: 1.05em; color: #6B4C2A; margin: 0 0 1em 0; }
.illustration { margin: 0 0 1em 0; text-align: center; }
.illustration img { max-width: 100%; height: auto; }
.annotations { font-size: 0.8em; font-style: italic; color: #6B4C2A; margin-top: 0.4em; }
.annotations span { display: block; }
.section-header { font-variant: small-caps; font-weight: bold; font-size: 1em; letter-spacing: 0.06em; margin: 1em 0 0.2em 0; }
.section-body { margin: 0 0 0.4em 0; text-align: justify; }
.intro { font-style: italic; font-size: 1.05em; margin-bottom: 1em; }
.warning { color: #8B2020; font-size: 1.1em; margin: 0.5em 0 1em 0; }
.is-danger .entry-title { color: #8B2020; }
`;

interface RenderResult {
  epubPath: string;
  sizeBytes: number;
  renderMs: number;
  chapterCount: number;
  entryCount: number;
  imageBytes: number;
}

export async function renderEpub(manifests: Manifest[]): Promise<RenderResult> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Resize the placeholder to Kindle-compatible width and write to disk so we can
  // reference it via file:// URL (epub-gen-memory's node-fetch wrapper rejects data: URIs
  // but supports file:// on Node).
  const srcImg = await readFile(path.join(FIXTURE_DIR, 'placeholder.png'));
  const resizedImg = await sharp(srcImg).resize({ width: MAX_IMG_WIDTH_PX, withoutEnlargement: true }).png().toBuffer();
  const imgDiskPath = path.join(OUTPUT_DIR, 'placeholder-1600.png');
  await writeFile(imgDiskPath, resizedImg);
  const imgUrl = `file://${imgDiskPath}`;

  // Group manifests by chapter. The bake-off fixture is all "Chapter 5" so we get one chapter
  // with 30 entries. In production a real book would have ~7 chapters.
  const byChapter = new Map<string, Manifest[]>();
  for (const m of manifests) {
    const key = `${m.chapter_number}|${m.chapter_name}`;
    const list = byChapter.get(key) ?? [];
    list.push(m);
    byChapter.set(key, list);
  }

  const chapters = Array.from(byChapter.entries()).map(([key, entries]) => {
    const chapterName = key.split('|')[1] ?? 'Chapter';
    const content = entries.map((m) => entryToHtml(m, imgUrl)).join('\n<hr/>\n');
    return {
      title: chapterName,
      content,
      excludeFromToc: false,
      beforeToc: false,
    };
  });

  const options = {
    title: 'The Wildlands: New England (EPUB Spike)',
    author: 'TBD',
    publisher: 'The Wildlands Publishing Platform',
    description: 'Spike 5 — content-parity EPUB rendered from the same page manifests as the PDF.',
    lang: 'en',
    cover: imgUrl,
    css: EPUB_CSS,
    tocTitle: 'Contents',
    tocInTOC: false,
    numberChaptersInTOC: false,
    fonts: [], // Default fonts; custom fonts add Kindle compatibility risk
    version: 3 as const,
  };

  const t0 = Date.now();
  // epub-gen-memory exports its function as default; both signatures are supported across versions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (epub as any).default ?? (epub as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawBuf: Buffer = await fn(options, chapters);

  // Post-process fix: epub-gen-memory emits NCX `playOrder` starting at 0, which fails
  // EPUBCheck (RSC-005). NCX is legacy EPUB2 — modern readers use the EPUB3 nav doc — but
  // we patch it for strict validation cleanliness.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zip = await (JSZip as any).loadAsync(rawBuf);
  const ncxFile = zip.file('OEBPS/toc.ncx');
  if (ncxFile) {
    const ncxText: string = await ncxFile.async('string');
    let counter = 1;
    const patched = ncxText.replace(/playOrder="\d+"/g, () => `playOrder="${counter++}"`);
    zip.file('OEBPS/toc.ncx', patched);
  }
  const buf: Buffer = await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });

  const renderMs = Date.now() - t0;

  const outPath = path.join(OUTPUT_DIR, 'bakeoff.epub');
  await writeFile(outPath, buf);

  return {
    epubPath: outPath,
    sizeBytes: buf.byteLength,
    renderMs,
    chapterCount: chapters.length,
    entryCount: manifests.length,
    imageBytes: resizedImg.byteLength,
  };
}

// Standalone runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const json = await readFile(path.join(FIXTURE_DIR, 'pages.json'), 'utf8');
  const manifests = JSON.parse(json) as Manifest[];
  const r = await renderEpub(manifests);
  // eslint-disable-next-line no-console
  console.log(
    `✓ EPUB — ${r.entryCount} entries in ${r.chapterCount} chapter(s), ${(r.sizeBytes / 1024 / 1024).toFixed(2)} MB, ${r.renderMs}ms`,
  );
  // eslint-disable-next-line no-console
  console.log(`  image embedded at ${(r.imageBytes / 1024).toFixed(1)} KB (≤${MAX_IMG_WIDTH_PX}px wide)`);
  // eslint-disable-next-line no-console
  console.log(`  → ${r.epubPath}`);
}
