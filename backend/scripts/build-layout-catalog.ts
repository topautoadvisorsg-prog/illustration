/**
 * Layout catalog generator — NO DB, NO image spend.
 *
 * For every active layout family, builds the real pipeline artifacts that the
 * image model would receive, so the whole catalog can be reviewed BEFORE any
 * render is approved:
 *   - WholePageSpec (the JSON contract)
 *   - assembled prompt (assemblePagePrompt — the production path)
 *   - blueprint PNG (the layout reference the model is handed)
 *   - design metadata (purpose, when selected, text capacity, image area, composition)
 *
 * Everything here is deterministic. The ONLY thing that costs money is
 * generateImageFromBlueprint, which this script never calls.
 *
 *   node --import tsx scripts/build-layout-catalog.ts   → ./catalog/*
 */

import fs from 'node:fs';
import path from 'node:path';
import { ProjectConfigSchema, type ProjectConfig, type LayoutTemplateId } from '@wildlands/shared';
import type { PageRow } from '../src/db/repositories/pagination.repo.js';
import { resolveGeometry } from '../src/pipeline/publishing-standard/index.js';
import { computePageGeometry } from '../src/pipeline/stage-6-layout/page-geometry.js';
import { directLayout } from '../src/pipeline/stage-6-layout/layout-director.js';
import { LAYOUT_PROFILES } from '../src/pipeline/stage-6-layout/layout-profiles.js';
import { analyzeTextFit } from '../src/pipeline/stage-6-layout/text-fit.js';
import { renderBlueprintPng } from '../src/pipeline/stage-3-generation/blueprint.js';
import { buildPageSpec } from '../src/pipeline/whole-page-render/build-page-spec.js';
import { assemblePagePrompt } from '../src/pipeline/whole-page-render/assemble-page-prompt.js';

const OUT = path.resolve('catalog');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const config: ProjectConfig = ProjectConfigSchema.parse({
  volume: 1,
  title: 'The Wildlands',
  subtitle: 'A Field Guide to New England Wilderness',
  authorName: 'J. R. Munoz',
  publishing: { title: 'The Wildlands', subtitle: 'A Field Guide to New England Wilderness', authors: ['J. R. Munoz'] },
});
const geometry = computePageGeometry(resolveGeometry(config).trimSize);
const canvasIn = resolveGeometry(config).canvasIn;
const bodyPt = config.typography.bodyPt;
const lineHeight = config.typography.lineHeight;

const SAMPLE_BODY = [
  'The eastern coyote moves through the New England forest at the seam between night and morning, when the light is still grey and the air holds the cold of the river.',
  '',
  'It is larger than its western cousin, carrying wolf ancestry in its frame, and it has learned the edges of human country — the field margins, the rail beds, the quiet suburban green.',
  '',
  'Tracks show a neat, direct register: the hind foot falling almost exactly where the front foot lifted, a straight economical line across the snow that a fox would never keep.',
].join('\n');

interface Family {
  name: string;
  layoutTemplate: LayoutTemplateId;
  pageRole: 'opener' | 'continuation' | 'compacted';
  section: string;
  frontMatterType: string | null;
  subject: string;
  body: string;
  purpose: string;
  whenSelected: string;
  /** False for titleless pure-text pages (copyright/continuation/compacted). */
  hasTitle?: boolean;
}

const families: Family[] = [
  { name: 'Full Illustration', layoutTemplate: 'LAYOUT_A_ILLUSTRATION', pageRole: 'opener', section: 'BODY', frontMatterType: null, subject: 'a lone eastern coyote on a granite ridge at dawn, full-bleed naturalist plate', body: 'The coyote at first light.', purpose: 'Hero plate — one subject fills the page; minimal text.', whenSelected: 'Showcase species / chapter-defining imagery; very short copy.' },
  { name: 'Standard', layoutTemplate: 'LAYOUT_1_STANDARD', pageRole: 'opener', section: 'BODY', frontMatterType: null, subject: 'eastern coyote at the forest edge', body: SAMPLE_BODY, purpose: 'Balanced default — float-left art with body text wrapping.', whenSelected: 'General profile pages with moderate text + one supporting image.' },
  // Layout Audit 1 §3 — LAYOUT_2_TEXT_HEAVY removed (redundant with corner/accent + pure text).
  { name: '50/50', layoutTemplate: 'LAYOUT_B_IMAGE_TOP', pageRole: 'opener', section: 'BODY', frontMatterType: null, subject: 'eastern coyote portrait, upper band', body: SAMPLE_BODY, purpose: 'Even split — image band + reading field.', whenSelected: 'Equal weight of image and text.' },
  { name: '25% Accent', layoutTemplate: 'LAYOUT_C_CORNER_TOP_LEFT', pageRole: 'opener', section: 'BODY', frontMatterType: null, subject: 'corner vignette of a coyote paw print', body: SAMPLE_BODY, purpose: 'Corner accent — small art, text-led.', whenSelected: 'Text-forward pages wanting a light visual accent.' },
  // Layout Audit 1 §4 — Continuation reworked to the text-first pure-text layout (no subject reservation).
  { name: 'Continuation', layoutTemplate: 'LAYOUT_D_PURE_TEXT', pageRole: 'continuation', section: 'BODY', frontMatterType: null, subject: '', body: SAMPLE_BODY, purpose: 'Flowed text continuing a prior entry; reading-space first, edge ornaments only.', whenSelected: 'When an entry overflows one page.', hasTitle: false },
  { name: 'Compacted', layoutTemplate: 'LAYOUT_D_PURE_TEXT', pageRole: 'compacted', section: 'BODY', frontMatterType: null, subject: '', body: SAMPLE_BODY, purpose: 'Multiple short entries merged onto one page.', whenSelected: 'Small entries packed to save pages.', hasTitle: false },
  { name: 'Copyright', layoutTemplate: 'LAYOUT_D_PURE_TEXT', pageRole: 'opener', section: 'FRONT_MATTER', frontMatterType: 'COPYRIGHT_PAGE', subject: '', body: 'The Wildlands Field Guide — New England Volume\n\nCopyright © 2026 The Wildlands. All rights reserved. No part of this publication may be reproduced, stored in a retrieval system, or transmitted in any form or by any means without the prior written permission of the publisher, except for brief quotations used in reviews.\n\nFirst Edition', purpose: 'Copyright page — short legal text, no heading, thin edge ornaments over a subtle background field.', whenSelected: 'Front matter copyright/edition notice.', hasTitle: false },
  { name: 'Title Page', layoutTemplate: 'LAYOUT_TITLE_DISPLAY', pageRole: 'opener', section: 'FRONT_MATTER', frontMatterType: 'TITLE_PAGE', subject: '', body: '', purpose: 'Display/ceremonial page — a compact centered title block (title, subtitle, author) baked into the art, large negative space, thin edge ornaments.', whenSelected: 'Front matter title page; also dedication / epigraph / quote / special notes (LAYOUT_TITLE_DISPLAY family).' },
  { name: 'Intro Opener', layoutTemplate: 'LAYOUT_5_CHAPTER_OPENER', pageRole: 'opener', section: 'FRONT_MATTER', frontMatterType: 'INTRODUCTION', subject: '', body: SAMPLE_BODY, purpose: 'Introduction opener — threshold image + opening prose.', whenSelected: 'Front matter introduction.' },
  { name: 'Author Page', layoutTemplate: 'LAYOUT_D_PURE_TEXT', pageRole: 'opener', section: 'FRONT_MATTER', frontMatterType: 'ABOUT_AUTHOR', subject: '', body: SAMPLE_BODY, purpose: 'About-the-author page.', whenSelected: 'Front/back matter.' },
  { name: 'Series Page', layoutTemplate: 'LAYOUT_D_PURE_TEXT', pageRole: 'opener', section: 'FRONT_MATTER', frontMatterType: 'ABOUT_SERIES', subject: '', body: SAMPLE_BODY, purpose: 'About-the-series / resources page.', whenSelected: 'Front/back matter.' },
  { name: 'Glossary', layoutTemplate: 'LAYOUT_D_PURE_TEXT', pageRole: 'opener', section: 'BACK_MATTER', frontMatterType: 'GLOSSARY', subject: '', body: '', purpose: 'Glossary — edge ornament only; entries typeset by the engine.', whenSelected: 'Back matter.' },
  { name: 'Index', layoutTemplate: 'LAYOUT_D_PURE_TEXT', pageRole: 'opener', section: 'BACK_MATTER', frontMatterType: 'INDEX', subject: '', body: '', purpose: 'Index — edge ornament only; entries typeset by the engine.', whenSelected: 'Back matter.' },
];

function makeRow(f: Family): PageRow {
  return {
    projectId: 'catalog', pageKey: `CATALOG_${f.name.replace(/\s+/g, '_').toUpperCase()}`,
    chapterNumber: 1, plannedPageNumber: 1, layoutTemplate: f.layoutTemplate,
    entryKey: 'catalog-entry', pageRole: f.pageRole, readingFieldText: f.body,
    section: f.section, frontMatterType: f.frontMatterType,
  } as unknown as PageRow;
}

const rows: string[] = [
  '# Wild Lands — Layout Catalog (no-spend dry run)',
  '',
  `Trim ${resolveGeometry(config).trimSize.widthIn}×${resolveGeometry(config).trimSize.heightIn} · canvas ${canvasIn.w}×${canvasIn.h} · body ${bodyPt}pt/${lineHeight}`,
  'Every family below routes through buildPageSpec → assemblePagePrompt → blueprint. No image was generated.',
  '',
  '| Family | Layout | Text capacity | Image area | Composition |',
  '|---|---|---|---|---|',
];

for (const f of families) {
  const dir = path.join(OUT, f.name.replace(/\s+/g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  const profile = LAYOUT_PROFILES[f.layoutTemplate];
  const allocation = directLayout({ bodyMarkdown: f.body || ' ', layoutTemplate: f.layoutTemplate, geometry, bodyPt, lineHeight, hasTitle: f.hasTitle });
  const spec = buildPageSpec({ pageRow: makeRow(f), config, geometry, allocation, entryTitle: '', imageSubject: f.subject });
  const prompt = assemblePagePrompt(spec);
  const { png } = await renderBlueprintPng(allocation, 1024, 1536, { canvasIn });
  const fit = analyzeTextFit({ bodyMarkdown: f.body || ' ', layoutTemplate: f.layoutTemplate, geometry, bodyPt, lineHeight });

  fs.writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec, null, 2), 'utf8');
  fs.writeFileSync(path.join(dir, 'prompt.txt'), prompt, 'utf8');
  fs.writeFileSync(path.join(dir, 'blueprint.png'), png);

  rows.push(`| **${f.name}** | ${f.layoutTemplate} | ~${fit.capacityChars} chars | ${Math.round(profile.artAreaFraction * 100)}% | ${spec.composition.imagePlacement} |`);
  fs.writeFileSync(path.join(dir, 'about.md'), [
    `# ${f.name}`, '', `**Layout:** ${f.layoutTemplate}`, `**Purpose:** ${f.purpose}`,
    `**When selected:** ${f.whenSelected}`, `**Text capacity:** ~${fit.capacityChars} chars/page (textAreaFactor ${profile.textAreaFactor})`,
    `**Image area:** ${Math.round(profile.artAreaFraction * 100)}% of the page`,
    `**Image placement:** ${spec.composition.imagePlacement}`, `**Text placement:** ${spec.composition.textPlacement}`,
    `**Page type:** ${spec.pageType}`, '', 'Artifacts: `spec.json` · `prompt.txt` · `blueprint.png`',
  ].join('\n'), 'utf8');
  console.log(`✓ ${f.name.padEnd(16)} ${f.layoutTemplate.padEnd(26)} cap ~${fit.capacityChars} · img ${Math.round(profile.artAreaFraction * 100)}%`);
}

fs.writeFileSync(path.join(OUT, 'CATALOG.md'), rows.join('\n') + '\n', 'utf8');
console.log(`\n✓ Catalog written to ${OUT}/ (${families.length} families). Cover Wrap handled separately (full-wrap, not a single page).`);
