/* Fold a compact "About the Author" block onto the existing About-the-Series
 * back-matter page (BM_005_ABOUT_SERIES) — keeps the book at 275 pages and the
 * cover untouched. Core series description kept; the wordy 2-paragraph review
 * ask is compressed to one sentence to make room. Hard capacity guard so the
 * page can never overflow. Deterministic composer (same path as the copyright
 * re-render). Dry-run by default; pass `commit` to write the render + DB row. */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, and, desc } from 'drizzle-orm';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { resolveGeometry, WILDLANDS_STANDARD } from '../src/pipeline/publishing-standard/index.js';
import { composeFrontMatterPage, wrapText, textPageLineCapacity, type ComposeInput } from '../src/pipeline/front-matter/compose-page.js';

const PROJECT = process.argv[2]!;
const COMMIT = process.argv.includes('commit');
const OUT = 'C:/Users/jovan/Downloads';

const HEADING = 'About the Wildlands Series';
const PARAS = [
  "THE WILDLANDS is a collection of premium wilderness field guides dedicated to the landscapes, wildlife, plants, fungi, history, and survival knowledge of the world's great wild places.",
  'Each volume explores a specific region in extraordinary detail — from its mountains, forests, rivers, and coastlines to the species that inhabit them and the knowledge required to understand them safely and respectfully.',
  'Blending scientific accuracy, traditional fieldcraft, natural history, and museum-quality illustration, THE WILDLANDS is made for explorers, lifelong learners, and collectors who want a deeper connection with the natural world.',
  'Whether carried into the wilderness or studied from a favorite chair at home, each volume is a timeless companion to one of Earth’s remarkable landscapes.',
  'If this volume deepened your understanding of New England’s wild places, please consider leaving an honest review where you purchased it — your support helps fund future volumes.',
  'ABOUT THE AUTHOR',
  'Wade Brannock is a woodsman, naturalist, and storyteller devoted to the wild places of New England. Through The Wildlands series he sets out to create the field guides he always wished existed — beautiful enough to inspire curiosity, practical enough to carry afield, and specific enough to help readers truly know the places they explore.',
];

const project = await getProject(PROJECT);
if (!project) { console.error('project_not_found'); process.exit(1); }
const config = ProjectConfigSchema.parse(project.config);
const canvasIn = resolveGeometry(config).canvasIn;

// ---- capacity guard ----
const cap = textPageLineCapacity(canvasIn, true);
let lines = 0;
for (const p of PARAS) lines += wrapText(p, cap.maxCharsPerLine).length + cap.paragraphGapLines;
lines = Math.round(lines);
console.log(`capacity ${cap.linesPerPage} lines | this content ≈ ${lines} lines`);
if (lines > cap.linesPerPage) { console.error(`OVERFLOW by ${lines - cap.linesPerPage} lines — trim before committing.`); process.exit(1); }

const db = getDb();
const row = (await db.select().from(pages).where(and(eq(pages.projectId, PROJECT), eq(pages.frontMatterType, 'ABOUT_SERIES'))))[0];
if (!row) { console.error('ABOUT_SERIES row not found'); process.exit(1); }

const composeSpec: ComposeInput = { kind: 'TEXT_PAGE', canvasIn, pageLabel: row.pageLabel ?? null, heading: HEADING, paragraphs: PARAS };
const composed = await composeFrontMatterPage(composeSpec);
writeFileSync(join(OUT, 'about_series_bio_review.png'), composed.pngBuffer);
console.log('review PNG → about_series_bio_review.png |', composed.widthPx, 'x', composed.heightPx);

if (!COMMIT) { console.log('DRY RUN — review the PNG, then re-run with `commit`.'); process.exit(0); }

const storage = getProjectStorage();
const pageKey = row.pageKey;
const png = await storage.writeProjectFile(PROJECT, ['front-matter', `${pageKey}.png`], composed.pngBuffer);
const assembledPrompt = `Deterministic front-matter composition — About the Series + About the Author (operator-folded bio; page count unchanged).`;
const promptFile = await storage.writeProjectFile(PROJECT, ['front-matter', `${pageKey}.composition.txt`], assembledPrompt);
const printPng = await storage.writeProjectFile(PROJECT, ['print-ready', `${pageKey}.print.png`], composed.pngBuffer);
const printPdf = await storage.writeProjectFile(PROJECT, ['print-ready', `${pageKey}.print.pdf`], composed.pdfBuffer);

await db.update(wholePageRenders).set({ active: false }).where(eq(wholePageRenders.pageId, row.id));
const latest = (await db.select({ version: wholePageRenders.version }).from(wholePageRenders).where(eq(wholePageRenders.pageId, row.id)).orderBy(desc(wholePageRenders.version)).limit(1))[0];
const nextVersion = (latest?.version ?? 0) + 1;
const [ins] = await db.insert(wholePageRenders).values({
  pageId: row.id, projectId: PROJECT, version: nextVersion, status: 'APPROVED' as const,
  specJson: { frontMatter: true, ...composeSpec } as object, assembledPrompt,
  promptSha256: createHash('sha256').update(assembledPrompt).digest('hex'), standardVersion: WILDLANDS_STANDARD.version,
  active: true, approvedForBook: true, attempts: 0, imagePath: png.relativePath, promptPath: promptFile.relativePath,
  printPngPath: printPng.relativePath, printPdfPath: printPdf.relativePath, preflightPassed: true,
  widthPx: composed.widthPx, heightPx: composed.heightPx, model: 'deterministic-composer-v1',
}).returning({ id: wholePageRenders.id });
await db.update(pages).set({ readingFieldText: PARAS.join('\n') }).where(eq(pages.id, row.id));
console.log('COMMITTED — version', nextVersion, '| render', ins!.id);
console.log('print-ready PDF already written (q88-equivalent lossless text page). Rebuild the interior next.');
process.exit(0);
