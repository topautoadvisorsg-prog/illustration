/**
 * CANONICAL RENDER FINGERPRINT — prove local and production agree.
 *
 * "153 here, 157 there" is not something to shrug at: if the two environments
 * can disagree, neither number is evidence, and a proof approved locally is not
 * the book that ships. This prints every input that can move pagination
 * alongside the resulting page geometry, so a mismatch names its own cause
 * instead of starting an investigation.
 *
 *   yarn workspace @wildlands/backend qa:fingerprint
 *
 * Compare against production's /api/projects/:id/typeset-preview?format=json,
 * which returns the same report plus layoutStandardId and productionProfileId.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
loadDotenv({ path: path.join(ROOT, '.env') });
loadDotenv({ path: path.join(ROOT, '.env.development.local'), override: true });

const MANUSCRIPT =
  process.env.WL_QA_MANUSCRIPT ?? 'C:/Users/jovan/Downloads/puberty boy book/export/NO-ONE-TOLD-ME-THAT_FINAL.md';

const { sanitizeManuscript } = await import('../src/pipeline/stage-1-ingestion/sanitize-manuscript.js');
const { renderTypesetBook } = await import('../src/pipeline/typeset/render-typeset.js');
const { resolveTypesetLayoutStandard } = await import('../src/pipeline/typeset/layout-standards/registry.js');
const { getProductionProfile } = await import('../src/pipeline/production-profiles/registry.js');
const { resolveChromiumPath } = await import('../src/pipeline/stage-6-layout/render-pdf.js');
const { ProjectConfigSchema } = await import('@wildlands/shared');

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

const raw = await readFile(MANUSCRIPT, 'utf8');
const markdown = sanitizeManuscript(raw);

const profile = getProductionProfile('bw-educational-nonfiction');
const standard = resolveTypesetLayoutStandard(profile.typesetLayoutStandardId!);

const config = ProjectConfigSchema.parse({
  volume: 1,
  title: 'NO ONE TOLD ME THAT',
  authorName: 'Nolan Whitlow',
  productionProfileId: profile.id,
  typesetLayoutStandardId: standard.id,
  trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
  typography: {
    bodyPt: 12,
    lineHeight: 1.3,
    headingFont: standard.type.headingFont,
    bodyFont: standard.type.bodyFont,
  },
});

const { report } = await renderTypesetBook({
  markdown,
  config,
  chaptersStartRecto: standard.chaptersStartRecto,
  layoutStandard: standard,
});

const out = {
  inputs: {
    manuscriptSha256: sha(raw).slice(0, 16),
    workingCopySha256: sha(markdown).slice(0, 16),
    productionProfileId: profile.id,
    bodyRenderTrack: profile.bodyRenderTrack,
    layoutStandardId: standard.id,
    trim: `${config.trimSize.widthIn}x${config.trimSize.heightIn} bleed ${config.trimSize.bleedIn}`,
    margins: `${report.marginsIn.topIn}/${report.marginsIn.bottomIn}/${report.marginsIn.outsideIn}/${report.marginsIn.gutterIn}`,
    type: `${config.typography.headingFont} + ${config.typography.bodyFont} @ ${report.bodyPt}pt / ${report.lineHeight}`,
    sinkFraction: standard.opener.sinkFraction,
    kickerPt: standard.type.labelPt + standard.type.kickerPtDelta,
    paragraphSpacingEm: standard.paragraphs.spacingEm,
    listItemSpacingEm: standard.blocks.listItemSpacingEm,
    chaptersStartRecto: standard.chaptersStartRecto,
    takeawayEnabled: standard.chapterTakeaway.enabled,
    chromium: resolveChromiumPath() ? 'present' : 'MISSING',
    node: process.version,
  },
  geometry: {
    totalPages: report.totalPages,
    blankPages: report.blankPages,
    blankCount: report.blankPages.length,
    overflowPages: report.verticalOverflowPages,
    sectionCount: report.sectionStarts.length,
    finalSection: `${report.sectionStarts[report.sectionStarts.length - 1]?.title} @ p${report.sectionStarts[report.sectionStarts.length - 1]?.page}`,
    sectionStarts: report.sectionStarts.map((s) => `${s.page}:${s.title}`),
  },
};

console.log(JSON.stringify(out, null, 1));
// One line that is trivially diffable against the production report.
console.log(
  `\nFINGERPRINT ${out.geometry.totalPages}p/${out.geometry.blankCount}b/${out.geometry.overflowPages.length}o/${out.geometry.sectionCount}s ` +
    `sha=${sha(out.geometry.sectionStarts.join('|')).slice(0, 12)}`,
);
