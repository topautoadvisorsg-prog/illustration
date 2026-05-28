/**
 * 30-page fixture generator for the PDF engine bake-off.
 *
 * Produces:
 *   - fixture/pages.json     ← array of 30 PageManifest objects
 *   - fixture/placeholder.png ← shared parchment-toned placeholder image
 *
 * Layout distribution (per Spike 1 plan):
 *   p1     LAYOUT_5_CHAPTER_OPENER
 *   p2-10  LAYOUT_1_STANDARD          (9 pages)
 *   p11-15 LAYOUT_2_TEXT_HEAVY        (5 pages)
 *   p16-18 LAYOUT_4_DANGER_WARNING    (3 pages)
 *   p19-22 LAYOUT_3_ILLUSTRATION_DOMINANT (4 pages)
 *   p23-25 LAYOUT_8_MARGIN_ILLUSTRATION  (3 pages)
 *   p26-28 LAYOUT_9_DIAGNOSTIC_DIAGRAM   (3 pages)
 *   p29-30 LAYOUT_7_SCATTERED_VIGNETTES  (2 pages)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname);

type Layout =
  | 'LAYOUT_1_STANDARD'
  | 'LAYOUT_2_TEXT_HEAVY'
  | 'LAYOUT_3_ILLUSTRATION_DOMINANT'
  | 'LAYOUT_4_DANGER_WARNING'
  | 'LAYOUT_5_CHAPTER_OPENER'
  | 'LAYOUT_7_SCATTERED_VIGNETTES'
  | 'LAYOUT_8_MARGIN_ILLUSTRATION'
  | 'LAYOUT_9_DIAGNOSTIC_DIAGRAM';

interface SyntheticManifest {
  manifest_id: string;
  page_number: number;
  chapter_number: number;
  chapter_name: string;
  entry_name: string;
  scientific_name: string | null;
  layout_template: Layout;
  is_danger_page: boolean;
  word_count: number;
  body_text: {
    title: string;
    subtitle: string;
    intro: string;
    sections: Array<{ header: string; body: string }>;
  };
  illustration: {
    subject: string;
    annotations: string[];
  };
}

const FILLER_SENTENCE =
  'The variations across this region are documented in field notes spanning decades, gathered by hand across thousands of acres of mixed terrain and recorded with the patience of expedition naturalists. ';

function filler(words: number): string {
  // Approximately `words` words of filler text.
  let out = '';
  while (out.split(/\s+/).filter(Boolean).length < words) out += FILLER_SENTENCE;
  return out.trim();
}

function makePage(
  pageNumber: number,
  layout: Layout,
  opts: { entry: string; sectionCount: number; sectionWords: number; introWords: number; isDanger?: boolean },
): SyntheticManifest {
  const sections = Array.from({ length: opts.sectionCount }, (_, i) => {
    const headers = ['WHAT IT IS', 'HOW TO IDENTIFY', 'WHERE & WHEN', 'EAT?', 'CAUTIONS', 'FIELD NOTES', 'HISTORY'];
    return {
      header: headers[i % headers.length] ?? 'NOTES',
      body: filler(opts.sectionWords),
    };
  });
  const wordCount =
    opts.introWords + sections.reduce((acc, s) => acc + s.body.split(/\s+/).filter(Boolean).length, 0);

  return {
    manifest_id: `BAKEOFF_P${String(pageNumber).padStart(3, '0')}`,
    page_number: pageNumber,
    chapter_number: pageNumber === 1 ? 5 : 5,
    chapter_name: 'Bake-off Chapter',
    entry_name: opts.entry,
    scientific_name: `Genus species ${pageNumber}`,
    layout_template: layout,
    is_danger_page: opts.isDanger ?? false,
    word_count: wordCount,
    body_text: {
      title: opts.entry.toUpperCase(),
      subtitle: `Genus species ${pageNumber} | ${opts.isDanger ? 'TOXIC' : 'EDIBLE'}`,
      intro: filler(opts.introWords),
      sections,
    },
    illustration: {
      subject: `A representative specimen of ${opts.entry} in its natural habitat, observed in field.`,
      annotations: ['cap detail', 'stem cross-section', `pg. ${pageNumber}`],
    },
  };
}

const pages: SyntheticManifest[] = [];

// p1 — chapter opener
pages.push(makePage(1, 'LAYOUT_5_CHAPTER_OPENER', { entry: 'Fungi & Mushrooms', sectionCount: 1, sectionWords: 60, introWords: 80 }));

// p2-10 — standard (9)
for (let i = 2; i <= 10; i++) {
  pages.push(makePage(i, 'LAYOUT_1_STANDARD', { entry: `Species ${i}`, sectionCount: 4, sectionWords: 55, introWords: 50 }));
}

// p11-15 — text heavy (5)
for (let i = 11; i <= 15; i++) {
  pages.push(makePage(i, 'LAYOUT_2_TEXT_HEAVY', { entry: `Verbose Species ${i}`, sectionCount: 6, sectionWords: 90, introWords: 70 }));
}

// p16-18 — danger (3)
for (let i = 16; i <= 18; i++) {
  pages.push(makePage(i, 'LAYOUT_4_DANGER_WARNING', { entry: `Toxic Species ${i}`, sectionCount: 5, sectionWords: 50, introWords: 40, isDanger: true }));
}

// p19-22 — illustration dominant (4)
for (let i = 19; i <= 22; i++) {
  pages.push(makePage(i, 'LAYOUT_3_ILLUSTRATION_DOMINANT', { entry: `Striking Species ${i}`, sectionCount: 2, sectionWords: 40, introWords: 30 }));
}

// p23-25 — margin illustration (3)
for (let i = 23; i <= 25; i++) {
  pages.push(makePage(i, 'LAYOUT_8_MARGIN_ILLUSTRATION', { entry: `Tall Tree ${i}`, sectionCount: 4, sectionWords: 50, introWords: 50 }));
}

// p26-28 — diagnostic diagram (3)
for (let i = 26; i <= 28; i++) {
  pages.push(makePage(i, 'LAYOUT_9_DIAGNOSTIC_DIAGRAM', { entry: `Technical Subject ${i}`, sectionCount: 3, sectionWords: 45, introWords: 30 }));
}

// p29-30 — scattered vignettes (2)
for (let i = 29; i <= 30; i++) {
  pages.push(makePage(i, 'LAYOUT_7_SCATTERED_VIGNETTES', { entry: `Tracks Study ${i}`, sectionCount: 3, sectionWords: 50, introWords: 40 }));
}

async function main(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });

  // Write the JSON fixture
  const pagesPath = path.join(FIXTURE_DIR, 'pages.json');
  await writeFile(pagesPath, JSON.stringify(pages, null, 2));
  // eslint-disable-next-line no-console
  console.log(`✓ Wrote ${pages.length} page manifests → ${pagesPath}`);

  // Generate a shared placeholder image (~3000x2000 parchment-toned, with subtle texture noise)
  const placeholderPath = path.join(FIXTURE_DIR, 'placeholder.png');
  await sharp({
    create: {
      width: 2400,
      height: 1800,
      channels: 3,
      background: { r: 232, g: 217, b: 176 }, // #E8D9B0 parchment_shadow
    },
  })
    .png()
    .toFile(placeholderPath);
  // eslint-disable-next-line no-console
  console.log(`✓ Wrote shared placeholder image → ${placeholderPath}`);

  // Summary
  const byLayout = pages.reduce<Record<string, number>>((acc, p) => {
    acc[p.layout_template] = (acc[p.layout_template] ?? 0) + 1;
    return acc;
  }, {});
  // eslint-disable-next-line no-console
  console.log('\nLayout distribution:');
  for (const [k, v] of Object.entries(byLayout)) {
    // eslint-disable-next-line no-console
    console.log(`  ${k}: ${v}`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
