/**
 * Local diagnostic — does rebalanceEntries actually flatten CH02_P016's
 * shape? Pure, no DB, no network. Replicates the entry's paragraph sizes
 * exactly and prints what redistribute produces for opener vs continuation.
 */

import { rebalanceEntries } from '../src/pipeline/stage-1.75-pagination/entry-rebalance.js';
import { computePaginationCapacity } from '../src/pipeline/stage-1.75-pagination/capacity.js';
import { directLayout } from '../src/pipeline/stage-6-layout/layout-director.js';
import { computePageGeometry } from '../src/pipeline/stage-6-layout/page-geometry.js';
import type { PaginatedPage } from '../src/pipeline/stage-1.75-pagination/types.js';

const TRIM = { widthIn: 7, heightIn: 10, bleedIn: 0.125 };
const BODY_PT = 11;
const LINE_HEIGHT = 1.4;

// CH02_P016 "Wild Turkey" paragraph sizes from the live manifest analysis.
// Sizes 14 paragraphs, no headers, no metadata stripped here (they map ~1:1).
const SIZES = [26, 264, 14, 488, 19, 396, 227, 22, 348, 37, 145, 15, 364, 3];

function paragraph(chars: number, label: string): string {
  // Build a paragraph of exactly `chars` characters (close enough — stripMarkdown
  // is identity on plain text). Suffix with a label so we can spot order.
  const base = `${label} `;
  const remaining = Math.max(1, chars - base.length);
  return base + 'x'.repeat(remaining);
}

function zonesFor(text: string, layout: PaginatedPage['layoutTemplate']) {
  return directLayout({
    bodyMarkdown: text,
    layoutTemplate: layout,
    geometry: computePageGeometry(TRIM),
    bodyPt: BODY_PT,
    lineHeight: LINE_HEIGHT,
  });
}

function makePage(
  entryKey: string,
  pageKey: string,
  partN: number,
  totalParts: number,
  layout: PaginatedPage['layoutTemplate'],
  text: string,
): PaginatedPage {
  return {
    plannedPageNumber: 1,
    entryKey,
    entryTitle: 'Wild Turkey',
    pageKey,
    chapterNumber: 2,
    partN,
    totalParts,
    pageRole: partN === 1 ? 'opener' : 'continuation',
    carriesSubject: partN === 1,
    compactedEntryKeys: null,
    imageSubject: partN === 1 ? 'a wild turkey' : null,
    layoutTemplate: layout,
    readingFieldText: text,
    readingFieldChars: text.length,
    readingFieldWords: text.split(/\s+/).filter(Boolean).length,
    fitStatus: 'TIGHT',
    zones: zonesFor(text, layout),
    warnings: [],
  };
}

// Engine's actual split for CH02_P016: opener gets first 7 paragraphs.
const openerText = SIZES.slice(0, 7).map((c, i) => paragraph(c, `p${i + 1}`)).join('\n\n');
const c1Text = SIZES.slice(7).map((c, i) => paragraph(c, `p${i + 8}`)).join('\n\n');

console.log(`Engine's actual split:`);
console.log(`  opener: ${openerText.length} chars (${SIZES.slice(0, 7).reduce((a,b)=>a+b,0)} expected)`);
console.log(`  c1    : ${c1Text.length} chars (${SIZES.slice(7).reduce((a,b)=>a+b,0)} expected)`);

const pages: PaginatedPage[] = [
  makePage('CH02_P016', 'CH02_P016', 1, 2, 'LAYOUT_B_IMAGE_RIGHT', openerText),
  makePage('CH02_P016', 'CH02_P016_c1', 2, 2, 'LAYOUT_2_TEXT_HEAVY', c1Text),
];

for (const p of pages) {
  const fit = computePaginationCapacity({
    readingFieldText: p.readingFieldText,
    layoutTemplate: p.layoutTemplate,
    trimSize: TRIM,
    bodyPt: BODY_PT,
    lineHeight: LINE_HEIGHT,
  });
  console.log(`  ${p.pageKey} layout=${p.layoutTemplate} chars=${fit.charCount} capacity=${fit.capacityChars} fill=${fit.fillRatio} status=${fit.status}`);
}

console.log(`\nRunning rebalanceEntries...`);
const result = rebalanceEntries({ pages, trimSize: TRIM, bodyPt: BODY_PT, lineHeight: LINE_HEIGHT });
console.log(`rebalancedEntryKeys: ${JSON.stringify(result.rebalancedEntryKeys)}`);
console.log(`expandedEntryKeys  : ${JSON.stringify(result.expandedEntryKeys)}`);
console.log(`warnings           : ${JSON.stringify(result.warnings)}`);
console.log(`\nResult pages:`);
for (const p of result.pages) {
  const fit = computePaginationCapacity({
    readingFieldText: p.readingFieldText,
    layoutTemplate: p.layoutTemplate,
    trimSize: TRIM,
    bodyPt: BODY_PT,
    lineHeight: LINE_HEIGHT,
  });
  console.log(
    `  ${p.pageKey} layout=${p.layoutTemplate} chars=${fit.charCount} capacity=${fit.capacityChars} fill=${fit.fillRatio} status=${fit.status}`,
  );
}
