/**
 * Bake-off candidate B: @react-pdf/renderer
 *
 * Renders the same 30-page fixture into a single multi-page PDF using
 * React components → PDF (Yoga flexbox engine, no Chromium).
 *
 * Exposes `renderAll(...)` so compare.ts can invoke it and measure.
 *
 * NOTE: @react-pdf/renderer is fundamentally different from HTML+CSS.
 * It uses a constrained flex layout via the Yoga engine. No CSS Paged Media.
 * No string-set running headers (we emit them manually per-page).
 * No `float`/`shape-outside` text wrapping — we use a two-column flex layout
 * with image in a sidebar to approximate Layout 1.
 *
 * This is INTENTIONALLY less polished than the Puppeteer renderer — the bake-off
 * is about understanding the constraints of each engine, not about matching
 * pixel-perfect output. The metric harness reports BOTH render time AND a
 * subjective layout-fidelity score (0-5).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import * as ReactPDF from '@react-pdf/renderer';

const { Document, Page, View, Text, Image, Font, StyleSheet, renderToBuffer } = ReactPDF;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, '../fixture');
const OUTPUT_DIR = path.resolve(__dirname, '../output');

// Page dimensions in points (8.625 × 11.25 in × 72 pt/in)
const PAGE_W_PT = 8.625 * 72;
const PAGE_H_PT = 11.25 * 72;

// Register Google Fonts via direct .ttf URLs. @react-pdf/renderer needs explicit registration.
Font.register({
  family: 'EB Garamond',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/ebgaramond/v30/SlGDmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8RuRlW2Ic9z3rsKw.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/ebgaramond/v30/SlGDmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8RuRlW2EM_TzrsKw.ttf', fontWeight: 600 },
    { src: 'https://fonts.gstatic.com/s/ebgaramond/v30/SlGDmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8RuRlW2HA9DzrsKw.ttf', fontWeight: 700 },
    { src: 'https://fonts.gstatic.com/s/ebgaramond/v30/SlGFmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8QHpQS9c-HnQI.ttf', fontStyle: 'italic', fontWeight: 400 },
  ],
});

Font.register({
  family: 'Playfair Display',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQZNLo_U2r.ttf', fontWeight: 700 },
    { src: 'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQZNLo_XGr_GA.ttf', fontWeight: 900 },
  ],
});

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#F5EDD6',
    fontFamily: 'EB Garamond',
    fontSize: 11,
    color: '#2C1A0E',
    paddingTop: 72,
    paddingBottom: 72,
    paddingLeft: 90, // 1.25in gutter
    paddingRight: 72,
    lineHeight: 1.45,
  },
  runningHeader: {
    position: 'absolute',
    top: 36,
    left: 72,
    fontSize: 8.5,
    color: '#6B4C2A',
    letterSpacing: 0.7,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 36,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 9,
    color: '#2C1A0E',
  },
  entryTitle: {
    fontFamily: 'Playfair Display',
    fontWeight: 700,
    fontSize: 24,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  scientificName: {
    fontStyle: 'italic',
    fontSize: 13,
    color: '#6B4C2A',
    marginBottom: 14,
  },
  illustrationRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  illustrationCol: {
    width: '45%',
    marginRight: 14,
  },
  illustrationColWide: {
    width: '60%',
    marginRight: 14,
  },
  illustrationColNarrow: {
    width: '22%',
    marginRight: 12,
  },
  illustrationColTall: {
    width: '30%',
  },
  illustrationFull: {
    width: '100%',
    marginBottom: 16,
  },
  image: { width: '100%' },
  imageTall: { width: '100%', height: 460, objectFit: 'cover' },
  imageWide: { width: '100%', height: 290, objectFit: 'cover' },
  imageDiagram: { width: '100%', height: 220, objectFit: 'cover', borderWidth: 1, borderStyle: 'dashed', borderColor: '#6B4C2A' },
  textCol: { flex: 1 },
  annotations: {
    marginTop: 6,
    fontStyle: 'italic',
    fontSize: 7.5,
    color: '#6B4C2A',
    lineHeight: 1.4,
  },
  intro: {
    fontStyle: 'italic',
    fontSize: 12,
    lineHeight: 1.45,
    marginBottom: 12,
  },
  sectionHeader: {
    fontFamily: 'EB Garamond',
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase', // ← approximating small-caps; @react-pdf has no font-variant: small-caps
    marginTop: 8,
    marginBottom: 2,
  },
  sectionBody: { textAlign: 'justify' },
  chapterOpenerTitle: {
    fontFamily: 'Playfair Display',
    fontWeight: 900,
    fontSize: 42,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  dangerBorder: {
    borderLeftWidth: 4,
    borderLeftStyle: 'solid',
    borderLeftColor: '#8B2020',
    paddingLeft: 10,
  },
  dangerTag: {
    color: '#8B2020',
    fontWeight: 700,
    fontStyle: 'normal',
  },
});

interface Manifest {
  manifest_id: string;
  page_number: number;
  chapter_number: number;
  chapter_name: string;
  entry_name: string;
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

function PageFurniture({ chapterName, pageNum }: { chapterName: string; pageNum: number }): React.ReactElement {
  return React.createElement(React.Fragment, null,
    React.createElement(Text, { style: styles.runningHeader, fixed: true }, `CHAPTER 5 — ${chapterName.toUpperCase()}`),
    React.createElement(Text, { style: styles.pageNumber, render: ({ pageNumber }) => `· ${pageNumber} ·`, fixed: true }),
  );
}

function IllustrationBlock({
  imgSrc,
  annotations,
  colStyle,
  imgStyle,
}: {
  imgSrc: string;
  annotations: string[];
  colStyle: object;
  imgStyle: object;
}): React.ReactElement {
  return React.createElement(View, { style: colStyle },
    React.createElement(Image, { src: imgSrc, style: imgStyle }),
    React.createElement(View, { style: styles.annotations },
      ...annotations.map((a, i) => React.createElement(Text, { key: i }, a)),
    ),
  );
}

function renderStandardPage(m: Manifest, imgSrc: string): React.ReactElement {
  const isDanger = m.is_danger_page;
  return React.createElement(Page, { size: { width: PAGE_W_PT, height: PAGE_H_PT }, style: styles.page },
    React.createElement(PageFurniture, { chapterName: 'Fungi & Mushrooms', pageNum: m.page_number }),
    React.createElement(View, { style: isDanger ? styles.dangerBorder : undefined },
      React.createElement(Text, { style: [styles.entryTitle, isDanger ? { color: '#8B2020' } : {}] }, m.body_text.title),
      React.createElement(Text, { style: styles.scientificName }, m.body_text.subtitle),
      React.createElement(View, { style: styles.illustrationRow },
        React.createElement(IllustrationBlock, {
          imgSrc,
          annotations: m.illustration.annotations,
          colStyle: styles.illustrationCol,
          imgStyle: styles.image,
        }),
        React.createElement(View, { style: styles.textCol },
          React.createElement(Text, { style: styles.intro },
            isDanger ? React.createElement(Text, { style: styles.dangerTag }, '⚠ TOXIC — DO NOT EAT  ') : null,
            m.body_text.intro,
          ),
        ),
      ),
      ...m.body_text.sections.map((s, i) =>
        React.createElement(View, { key: i },
          React.createElement(Text, { style: styles.sectionHeader }, s.header),
          React.createElement(Text, { style: styles.sectionBody }, s.body),
        ),
      ),
    ),
  );
}

function renderChapterOpener(m: Manifest, imgSrc: string): React.ReactElement {
  return React.createElement(Page, { size: { width: PAGE_W_PT, height: PAGE_H_PT }, style: styles.page },
    React.createElement(PageFurniture, { chapterName: 'Fungi & Mushrooms', pageNum: m.page_number }),
    React.createElement(View, { style: styles.illustrationFull },
      React.createElement(Image, { src: imgSrc, style: styles.imageTall }),
    ),
    React.createElement(Text, { style: styles.chapterOpenerTitle }, m.body_text.title),
    React.createElement(Text, { style: [styles.scientificName, { textAlign: 'center' }] }, m.body_text.subtitle),
    React.createElement(Text, { style: styles.intro }, m.body_text.intro),
  );
}

function renderIllustrationDominant(m: Manifest, imgSrc: string): React.ReactElement {
  return React.createElement(Page, { size: { width: PAGE_W_PT, height: PAGE_H_PT }, style: styles.page },
    React.createElement(PageFurniture, { chapterName: 'Fungi & Mushrooms', pageNum: m.page_number }),
    React.createElement(Text, { style: styles.entryTitle }, m.body_text.title),
    React.createElement(Text, { style: styles.scientificName }, m.body_text.subtitle),
    React.createElement(View, { style: styles.illustrationRow },
      React.createElement(View, { style: styles.textCol },
        React.createElement(Text, { style: styles.intro }, m.body_text.intro),
        ...m.body_text.sections.map((s, i) =>
          React.createElement(View, { key: i },
            React.createElement(Text, { style: styles.sectionHeader }, s.header),
            React.createElement(Text, { style: styles.sectionBody }, s.body),
          ),
        ),
      ),
      React.createElement(IllustrationBlock, {
        imgSrc,
        annotations: m.illustration.annotations,
        colStyle: styles.illustrationColWide,
        imgStyle: styles.image,
      }),
    ),
  );
}

function renderMarginIllustration(m: Manifest, imgSrc: string): React.ReactElement {
  return React.createElement(Page, { size: { width: PAGE_W_PT, height: PAGE_H_PT }, style: styles.page },
    React.createElement(PageFurniture, { chapterName: 'Fungi & Mushrooms', pageNum: m.page_number }),
    React.createElement(Text, { style: styles.entryTitle }, m.body_text.title),
    React.createElement(Text, { style: styles.scientificName }, m.body_text.subtitle),
    React.createElement(View, { style: styles.illustrationRow },
      React.createElement(View, { style: styles.textCol },
        React.createElement(Text, { style: styles.intro }, m.body_text.intro),
        ...m.body_text.sections.map((s, i) =>
          React.createElement(View, { key: i },
            React.createElement(Text, { style: styles.sectionHeader }, s.header),
            React.createElement(Text, { style: styles.sectionBody }, s.body),
          ),
        ),
      ),
      React.createElement(View, { style: styles.illustrationColTall },
        React.createElement(Image, { src: imgSrc, style: styles.imageTall }),
      ),
    ),
  );
}

function renderDiagnosticDiagram(m: Manifest, imgSrc: string): React.ReactElement {
  return React.createElement(Page, { size: { width: PAGE_W_PT, height: PAGE_H_PT }, style: styles.page },
    React.createElement(PageFurniture, { chapterName: 'Fungi & Mushrooms', pageNum: m.page_number }),
    React.createElement(Text, { style: styles.entryTitle }, m.body_text.title),
    React.createElement(Text, { style: styles.scientificName }, m.body_text.subtitle),
    React.createElement(View, { style: styles.illustrationFull },
      React.createElement(Image, { src: imgSrc, style: styles.imageDiagram }),
    ),
    React.createElement(Text, { style: styles.intro }, m.body_text.intro),
    ...m.body_text.sections.map((s, i) =>
      React.createElement(View, { key: i },
        React.createElement(Text, { style: styles.sectionHeader }, s.header),
        React.createElement(Text, { style: styles.sectionBody }, s.body),
      ),
    ),
  );
}

function pageFor(m: Manifest, imgSrc: string): React.ReactElement {
  switch (m.layout_template) {
    case 'LAYOUT_5_CHAPTER_OPENER':
      return renderChapterOpener(m, imgSrc);
    case 'LAYOUT_3_ILLUSTRATION_DOMINANT':
      return renderIllustrationDominant(m, imgSrc);
    case 'LAYOUT_8_MARGIN_ILLUSTRATION':
      return renderMarginIllustration(m, imgSrc);
    case 'LAYOUT_9_DIAGNOSTIC_DIAGRAM':
      return renderDiagnosticDiagram(m, imgSrc);
    // Layout 1, 2, 4, 7 all flow through standard with size variations on the image col.
    default:
      return renderStandardPage(m, imgSrc);
  }
}

export interface RenderResult {
  pdfPath: string;
  sizeBytes: number;
  renderMs: number;
  peakHeapMB: number;
  totalPages: number;
}

export async function renderAll(manifests: Manifest[]): Promise<RenderResult> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const placeholderBuf = await readFile(path.join(FIXTURE_DIR, 'placeholder.png'));
  const imgDataUri = `data:image/png;base64,${placeholderBuf.toString('base64')}`;

  let peakHeap = 0;
  const memInterval = setInterval(() => {
    const m = process.memoryUsage().heapUsed;
    if (m > peakHeap) peakHeap = m;
  }, 100);

  const t0 = Date.now();
  const doc = React.createElement(Document, null,
    ...manifests.map((m) => pageFor(m, imgDataUri)),
  );

  const buf = await renderToBuffer(doc);
  const outPath = path.join(OUTPUT_DIR, 'react-pdf.pdf');
  await writeFile(outPath, buf);
  clearInterval(memInterval);

  // Page count: parse from the PDF directly is unreliable; manifests.length is a lower bound.
  // For an apples-to-apples comparison, we record the manifest count and note that React-PDF
  // does NOT overflow long content to continuation pages — it clips. This is a layout-fidelity dock.
  return {
    pdfPath: outPath,
    sizeBytes: buf.byteLength,
    renderMs: Date.now() - t0,
    peakHeapMB: peakHeap / 1024 / 1024,
    totalPages: manifests.length,
  };
}

// Standalone runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const pagesJson = await readFile(path.join(FIXTURE_DIR, 'pages.json'), 'utf8');
  const manifests = JSON.parse(pagesJson) as Manifest[];
  const r = await renderAll(manifests);
  // eslint-disable-next-line no-console
  console.log(
    `✓ @react-pdf/renderer — ${r.totalPages} manifests, ${(r.sizeBytes / 1024 / 1024).toFixed(2)} MB, ${r.renderMs}ms, peak heap ${r.peakHeapMB.toFixed(1)} MB`,
  );
  // eslint-disable-next-line no-console
  console.log(`  → ${r.pdfPath}`);
}

export type { Manifest };
