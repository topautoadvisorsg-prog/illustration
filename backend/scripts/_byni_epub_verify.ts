/**
 * BEFORE YOU NEED IT — verify the EPUB from the PACKAGE, not from the builder.
 *
 * Everything here is read back out of the finished .epub. A counter maintained
 * by the code that wrote the file proves only that the code agrees with itself;
 * the flattened first build reported success exactly that way.
 *
 * The safety blocks are cross-checked against the MANUSCRIPT: each promoted
 * block must correspond to a real structural marker in the source, and every
 * structural marker in the source must appear as a promoted block. No page
 * numbers anywhere — a reflowable file has none.
 *
 *   yarn tsx scripts/_byni_epub_verify.ts
 */
import { readFileSync } from 'node:fs';
import { zipEntries, type ZipEntry } from './_zip.js';
import { resolveTypesetLayoutStandard } from '../src/pipeline/typeset/layout-standards/registry.js';
import { parseTypesetSections } from '../src/pipeline/typeset/typeset-book.js';
import { CONFIG, OUT_DIR, REV, EXPECTED_SAME_DAY, EXPECTED_IMMEDIATE, readManuscript } from './before-you-need-it-config.js';

const EPUB = `${OUT_DIR}/kindle/BEFORE-YOU-NEED-IT_kindle_${REV.replace('-', '')}.epub`;

const entries: ZipEntry[] = zipEntries(readFileSync(EPUB));
const xhtml = entries
  .filter((e) => /\.x?html$/i.test(e.entryName))
  .map((e) => ({ name: e.entryName, text: e.getData().toString('utf8') }));
const all = xhtml.map((f) => f.text).join('\n');

let failures = 0;
const check = (name: string, ok: boolean, detail: string): void => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
};

console.log(`\nEPUB PACKAGE VERIFICATION — ${EPUB.split('/').pop()}`);
console.log(`  ${entries.length} entries, ${xhtml.length} content documents\n`);

// ── the safety tiers, counted off the markup ────────────────────────────────
const grab = (cls: string): string[] =>
  [...all.matchAll(new RegExp(`<aside class="safety ${cls}"[^>]*>([\\s\\S]*?)</aside>`, 'g'))].map((m) => m[1]!);

const sameDay = grab('safety-same-day');
const immediate = grab('safety-immediate');

check(
  '1a. SAME-DAY blocks',
  sameDay.length === EXPECTED_SAME_DAY,
  `${sameDay.length} aside.safety-same-day (expected ${EXPECTED_SAME_DAY})`,
);
check(
  '1b. IMMEDIATE blocks',
  immediate.length === EXPECTED_IMMEDIATE,
  `${immediate.length} aside.safety-immediate (expected ${EXPECTED_IMMEDIATE})`,
);

// ── cross-check against the manuscript's own structural markers ─────────────
const { md } = readManuscript();
const std = resolveTypesetLayoutStandard(CONFIG.typesetLayoutStandardId!);
const runIns = std.alertPanel.runIn?.runIns ?? [];
const emph = std.alertPanel.runIn?.emphaticRunIns ?? [];
const bare = (s: string): string => s.replace(/[\s:;,.—–-]+$/u, '').trim().toLowerCase();

/** A structural marker: bold OPENING a body line. Mirrors the print matcher. */
const countStructural = (labels: readonly string[]): number => {
  const want = new Set(labels.map(bare));
  let n = 0;
  for (const s of parseTypesetSections(md)) {
    for (const line of s.bodyLines) {
      const m = line.match(/^\*\*(.+?)\*\*/);
      if (m && want.has(bare(m[1]!))) n += 1;
    }
  }
  return n;
};

const srcSameDay = countStructural(runIns);
const srcImmediate = countStructural(emph);
check(
  '2. the ebook matches the MANUSCRIPT, not just its own expectation',
  srcSameDay === sameDay.length && srcImmediate === immediate.length,
  `manuscript has ${srcSameDay} same-day and ${srcImmediate} immediate structural markers; ` +
    `ebook has ${sameDay.length} and ${immediate.length}`,
);

// ── ordinary bold run-ins must NOT have been promoted ──────────────────────
const totalBoldRunIns = parseTypesetSections(md)
  .flatMap((s) => s.bodyLines)
  .filter((l) => /^\*\*(.+?)\*\*/.test(l)).length;
const promoted = sameDay.length + immediate.length;
check(
  '3. ordinary bold run-ins were left alone',
  promoted < totalBoldRunIns && promoted === srcSameDay + srcImmediate,
  `${totalBoldRunIns} bold run-ins in the manuscript, exactly ${promoted} promoted`,
);

// ── every block keeps the author's words, and none is duplicated ───────────
const labels = [...all.matchAll(/<p class="safety-label">([^<]*)<\/p>/g)].map((m) => m[1]!);
const expectedLabels = new Set([...runIns, ...emph].map(bare));
const strayLabel = labels.find((l) => !expectedLabels.has(bare(l)));
check(
  '4. every safety label is one the standard declares',
  !strayLabel && labels.length === promoted,
  strayLabel ? `unexpected label "${strayLabel}"` : `labels: ${[...new Set(labels)].join(' | ')}`,
);

const bodies = [...sameDay, ...immediate].map((b) => b.replace(/\s+/g, ' ').trim());
check(
  '5. no safety block is duplicated',
  new Set(bodies).size === bodies.length,
  `${new Set(bodies).size} distinct of ${bodies.length}`,
);

// ── the protected TSS route survives ───────────────────────────────────────
const plain = all.replace(/<[^>]+>/g, ' ').replace(/&#x2014;/g, '—').replace(/&apos;/g, "'");
check(
  '6. the toxic-shock emergency route is intact',
  /tell an adult straight away/.test(plain) && /Not in the morning/.test(plain),
  '"tell an adult straight away" and "Not in the morning" both present',
);

// ── illustrations, alt text, cover, table ──────────────────────────────────
const images = entries.filter((e) => /\.(png|jpe?g)$/i.test(e.entryName));
const imgTags = [...all.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
const withoutAlt = imgTags.filter((t) => !/\salt="[^"]+"/.test(t));
/**
 * THE EXPECTED COUNT COMES FROM THE SHIPPING MANIFEST, NOT A LITERAL.
 *
 * These two checks read `images.length >= 7` and `imgTags.length >= 7`, pinned
 * to the seven illustrations that were retired at rev-19. Two things were wrong
 * with that beyond the number: `>=` cannot fail on a figure that should not be
 * there, which is the exact defect worth catching once art has been retired,
 * and neither check looked at WHICH images were present. Both are now exact,
 * and the retired assets are named and searched for.
 */
const FIG_DIR = `${OUT_DIR}/figures`;
const shipping: Array<{ id: string; file: string; alt: string }> =
  JSON.parse(readFileSync(`${FIG_DIR}/FIGURE-MANIFEST.json`, 'utf8'));
const EXPECT = shipping.length;

check(
  `7a. exactly the ${EXPECT} shipping figures, plus the cover`,
  images.length === EXPECT + 1,
  `${images.length} image files (expected ${EXPECT} figures + 1 cover)`,
);
check(
  '7b. every <img> carries non-empty alt text',
  imgTags.length === EXPECT && withoutAlt.length === 0,
  `${imgTags.length} img tags (expected ${EXPECT}), ${withoutAlt.length} without alt`,
);
check(
  '7d. the alt text is the shipping alt text, figure by figure',
  shipping.every((f) => all.includes(f.alt)),
  shipping.every((f) => all.includes(f.alt))
    ? `all ${EXPECT} manifest alt strings found in the XHTML`
    : `missing: ${shipping.filter((f) => !all.includes(f.alt)).map((f) => f.id).join(', ')}`,
);
/* The retired set by name. A retired illustration reaching the ebook after
   being removed from print is the specific regression this guards. */
const RETIRED = [
  'preparedness-pouch', 'sequence-not-schedule', 'folded-bra-on-chair',
  'deodorant-and-hairbrush', 'cycle-four-steps', 'volume-dial', 'two-seedlings',
];
const retiredHits = RETIRED.filter((r) => entries.some((e) => e.entryName.includes(r)) || all.includes(r));
check(
  '7e. no retired illustration in the package',
  retiredHits.length === 0,
  retiredHits.length ? `PRESENT: ${retiredHits.join(', ')}` : `none of the ${RETIRED.length} retired assets appear`,
);

const opf = entries.find((e) => /\.opf$/i.test(e.entryName))!.getData().toString('utf8');
check(
  '7c. a cover is declared in the package',
  /properties="cover-image"|name="cover"/.test(opf),
  'cover-image property present in the OPF manifest',
);

const rows = (all.match(/<tr[\s>]/g) ?? []).length;
check('8. the lookup table survived', rows === 36, `${rows} <tr> (expected 36 = 1 header + 35 rows)`);

// ── navigation ─────────────────────────────────────────────────────────────
/* The nav document is whichever file carries `epub:type="toc"`, not a filename.
   epub-gen-memory calls it `toc.xhtml`; the spec does not require that, so the
   first version of this check looked for `nav.xhtml` and reported an empty TOC
   for a perfectly good one. Find it by its declared role. */
const navDoc = xhtml.find((f) => /epub:type="toc"/.test(f.text));
const navLinks = navDoc ? (navDoc.text.match(/<a\s[^>]*href=/g) ?? []).length : 0;
const ncx = entries.find((e) => /\.ncx$/i.test(e.entryName));
const ncxPoints = ncx ? (ncx.getData().toString('utf8').match(/<navPoint/g) ?? []).length : 0;
check(
  '9. navigation is populated, in both the EPUB 3 nav and the NCX',
  navLinks >= 20 && ncxPoints >= 20,
  `${navLinks} links in ${navDoc?.name ?? '(no nav found)'}, ${ncxPoints} navPoints in the NCX`,
);

// ── metadata ───────────────────────────────────────────────────────────────
check(
  '10. title and author are correct in the package',
  opf.includes(CONFIG.title) && opf.includes(CONFIG.authorName),
  `"${CONFIG.title}" / "${CONFIG.authorName}" present in the OPF`,
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures ? 1 : 0);
