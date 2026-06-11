/**
 * Front Matter v1 — planner / orchestrator (FRONT_MATTER_V1_SPEC.md).
 *
 * Builds the exact front + back matter sequence for a project, composes every
 * page deterministically (R2 — no AI typesetting), persists the rows + print
 * files, and inserts book-ready render rows so assembly picks the pages up
 * exactly like approved AI renders.
 *
 * Operator-locked rules implemented here:
 *  - Introduction recovery: manuscript Introduction → Preface → Foreword →
 *    operator replacement → AI fallback LAST (and never silently).
 *  - Author page: verbatim bio → structured facts → OMIT. Never invent.
 *  - Recto/verso parity: title recto, copyright verso, TOC recto, intro recto,
 *    Chapter 1 recto (even front count), even total page count.
 *
 * Idempotent: re-running replaces every non-BODY row + its files. BODY rows
 * and their renders are never touched.
 */

import { ProjectConfigSchema, type ProjectConfig, type PublishingMetadata } from '@wildlands/shared';
import { getProject } from '../../db/repositories/projects.repo.js';
import { listManifests } from '../../db/repositories/manifests.repo.js';
import { listPaginatedPagesForProject } from '../../db/repositories/pagination.repo.js';
import {
  insertDeterministicRender,
  replaceFrontBackMatterPages,
  type FrontMatterPageInsert,
} from '../../db/repositories/front-matter.repo.js';
import { getProjectStorage } from '../../services/storage/project-storage.js';
import { resolveGeometry, toRoman, WILDLANDS_STANDARD } from '../publishing-standard/index.js';
import { markdownToBlocks } from '../experimental/whole-page-render/markdown-blocks.js';
import { recoverFrontMatterSections, pickIntroductionSection } from './recover-sections.js';
import {
  composeFrontMatterPage,
  indexPageCapacity,
  joinAuthors,
  referenceTextPageCapacity,
  textPageLineCapacity,
  wrapText,
  type ComposeInput,
  type TocEntry,
} from './compose-page.js';

export interface FrontMatterPlanReport {
  projectId: string;
  scopeChapters: number[] | null;
  frontPages: Array<{ pageKey: string; kind: string; pageLabel: string | null }>;
  backPages: Array<{ pageKey: string; kind: string; pageLabel: string | null }>;
  introductionSource: 'manuscript:INTRODUCTION' | 'manuscript:PREFACE' | 'manuscript:FOREWORD' | 'operator' | 'ai' | 'none';
  omitted: Array<{ page: string; reason: string }>;
  tocEntries: TocEntry[];
  bodyPageCount: number;
  totalBookPages: number;
  backCoverCopyAsset: string | null;
  filesWritten: number;
}

export interface FrontMatterPlanOptions {
  /** When present, build front/back matter for a standalone chapter proof book. */
  chapters?: number[];
}

interface PlannedPage {
  pageKey: string;
  section: 'FRONT_MATTER' | 'BACK_MATTER';
  kind: ComposeInput['kind'];
  frontMatterType: string;
  pageLabel: string | null;
  compose: Omit<ComposeInput, 'canvasIn' | 'pageLabel' | 'kind'>;
  auditText: string | null;
}

/** Resolve publishing metadata with generic fallbacks to project config. */
function resolveMeta(config: ProjectConfig): Required<Pick<PublishingMetadata, 'edition' | 'disclaimers' | 'toneKeywords' | 'aiIntroduction' | 'language'>> & PublishingMetadata & {
  resolvedTitle: string;
  resolvedSubtitle: string | undefined;
  resolvedAuthors: string[];
} {
  const p = config.publishing;
  return {
    ...p,
    resolvedTitle: p.title ?? config.title,
    resolvedSubtitle: p.subtitle ?? config.subtitle,
    resolvedAuthors: p.authors?.length ? p.authors : [config.authorName],
  };
}

function buildCopyrightLines(meta: ReturnType<typeof resolveMeta>): string[] {
  const year = meta.copyrightYear ?? new Date().getFullYear();
  const holder = meta.copyrightHolder ?? meta.resolvedAuthors[0] ?? '';
  const lines: string[] = [];
  lines.push(`${meta.resolvedTitle}${meta.resolvedSubtitle ? ' — ' + meta.resolvedSubtitle : ''}`);
  lines.push('');
  lines.push(`Copyright © ${year} ${holder}. All rights reserved.`);
  for (const l of wrapText(
    'No part of this publication may be reproduced, stored in a retrieval system, or transmitted in any form or by any means without the prior written permission of the publisher, except for brief quotations used in reviews.',
    72,
  ))
    lines.push(l);
  lines.push('');
  if (meta.publisher?.imprint) {
    lines.push(`${meta.edition} · Published by ${meta.publisher.imprint}`);
    const loc = [meta.publisher.location, meta.publisher.url].filter(Boolean).join(' · ');
    if (loc) lines.push(loc);
  } else {
    lines.push(meta.edition);
  }
  if (meta.isbn?.print) lines.push(`ISBN ${meta.isbn.print}`);
  if (meta.isbn?.ebook) lines.push(`ISBN ${meta.isbn.ebook} (e-book)`);
  for (const d of meta.disclaimers) {
    lines.push('');
    for (const l of wrapText(d, 72)) lines.push(l);
  }
  if (meta.credits) {
    lines.push('');
    lines.push(meta.credits);
  }
  if (meta.printedIn) {
    lines.push('');
    lines.push(`Printed in ${meta.printedIn}`);
  }
  return lines;
}

/** Markdown → flowed paragraph strings (plain text, headings inlined). */
function sectionParagraphs(markdown: string): string[] {
  return markdownToBlocks(markdown).map((b) => b.text);
}

/** Split paragraphs into TEXT_PAGEs by the composer's own line capacity. */
function splitTextPages(
  paragraphs: string[],
  canvasIn: { w: number; h: number },
): string[][] {
  const pages: string[][] = [];
  let current: string[] = [];
  let used = 0;
  let cap = textPageLineCapacity(canvasIn, true); // first page carries heading
  for (const para of paragraphs) {
    const lines = wrapText(para, cap.maxCharsPerLine).length + 1; // + paragraph gap
    if (used + lines > cap.linesPerPage && current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
      cap = textPageLineCapacity(canvasIn, false);
    }
    current.push(para);
    used += lines;
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

/** Split glossary/reference entries with the compact two-column back-matter frame. */
function splitReferenceTextPages(
  paragraphs: string[],
  canvasIn: { w: number; h: number },
): string[][] {
  const pages: string[][] = [];
  let current: string[] = [];
  let used = 0;
  let cap = referenceTextPageCapacity(canvasIn, true);

  for (const para of paragraphs) {
    const units = wrapText(para, cap.maxCharsPerLine).length * 10 + 2;
    if (used + units > cap.totalLineUnits && current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
      cap = referenceTextPageCapacity(canvasIn, false);
    }
    current.push(para);
    used += units;
  }

  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

function splitIndexEntries(entries: TocEntry[], canvasIn: { w: number; h: number }): TocEntry[][] {
  const pages: TocEntry[][] = [];
  let current: TocEntry[] = [];
  let used = 0;
  let cap = indexPageCapacity(canvasIn, true);

  for (const entry of entries) {
    const units = wrapText(entry.title, cap.maxTitleCharsPerLine).length * 10 + 2;
    if (used + units > cap.totalLineUnits && current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
      cap = indexPageCapacity(canvasIn, false);
    }
    current.push(entry);
    used += units;
  }

  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

export async function planFrontMatter(projectId: string, options: FrontMatterPlanOptions = {}): Promise<FrontMatterPlanReport> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`project_not_found:${projectId}`);
  const config = ProjectConfigSchema.parse(project.config);
  const meta = resolveMeta(config);
  const geometry = resolveGeometry(config);
  const canvasIn = geometry.canvasIn;
  const storage = getProjectStorage();
  const omitted: FrontMatterPlanReport['omitted'] = [];

  // ── Introduction + disclaimer recovery (operator priority order) ──
  let introductionSource: FrontMatterPlanReport['introductionSource'] = 'none';
  let introParagraphs: string[] = [];
  let disclaimerParagraphs: string[] = [];
  let glossaryParagraphs: string[] = [];
  let disclaimerHeading = 'Disclaimer';
  if (project.manuscriptPath) {
    const manuscript = (await storage.readProjectFile(project.manuscriptPath)).toString('utf8');
    const sections = recoverFrontMatterSections(manuscript);
    const intro = pickIntroductionSection(sections);
    if (intro) {
      introductionSource = `manuscript:${intro.kind}` as FrontMatterPlanReport['introductionSource'];
      introParagraphs = sectionParagraphs(intro.markdown);
    }
    // Dedication recovered from manuscript wins over metadata absence.
    const ded = sections.find((s) => s.kind === 'DEDICATION');
    if (ded && !meta.dedication) meta.dedication = ded.markdown;
    // Author-written disclaimer gets its own front page(s) — far too long
    // for the copyright block, and the author's text is authoritative.
    const disc = sections.find((s) => s.kind === 'DISCLAIMER');
    if (disc) {
      disclaimerHeading = disc.headingText.replace(/\b\w/g, (c) => c.toUpperCase());
      disclaimerParagraphs = sectionParagraphs(disc.markdown);
    }
    const glossary = sections.find((s) => s.kind === 'GLOSSARY');
    if (glossary) {
      glossaryParagraphs = sectionParagraphs(glossary.markdown);
    }
  }
  if (introductionSource === 'none' && meta.bookPurpose && meta.aiIntroduction.enabled) {
    // AI fallback is LAST resort and never silent. v1 has no text-LLM wired
    // into this path — fail loudly rather than fake it.
    throw new Error(
      'ai_introduction_not_configured: aiIntroduction.enabled is true and no manuscript introduction exists, but no text-generation provider is wired for front matter v1. Supply an operator introduction or disable aiIntroduction.',
    );
  }
  if (introductionSource === 'none') {
    omitted.push({ page: 'INTRODUCTION', reason: 'no manuscript introduction/preface/foreword; no operator replacement; AI fallback disabled' });
  }

  // ── TOC data from BOOK manifest + paginated body ──
  const scopeChapters = options.chapters?.length
    ? Array.from(new Set(options.chapters)).sort((a, b) => a - b)
    : null;
  const bodyPages = (await listPaginatedPagesForProject(projectId)).filter(
    (p) => (p as { section?: string }).section === 'BODY' || (p as { section?: string }).section == null,
  ).filter((p) => !scopeChapters || scopeChapters.includes(p.chapterNumber));
  if (bodyPages.length === 0) throw new Error('front_matter_requires_pagination: run Pagination before the front-matter plan (TOC needs body page numbers).');
  const bookManifests = await listManifests(projectId, 'BOOK');
  const chapters =
    ((bookManifests[0]?.content as { chapters?: Array<{ chapterNumber: number; chapterTitle: string }> })
      ?.chapters ?? [])
      .filter((c) => !scopeChapters || scopeChapters.includes(c.chapterNumber));
  const tocEntries: TocEntry[] = chapters.map((c) => {
    const first = bodyPages
      .filter((p) => p.chapterNumber === c.chapterNumber)
      .reduce((min, p) => Math.min(min, p.plannedPageNumber), Number.MAX_SAFE_INTEGER);
    // Generic prefix strip: "CHAPTER 3 — PLANTS" → "PLANTS"; unknown shapes pass through.
    const title = c.chapterTitle.replace(/^chapter\s+\d+\s*[—–:-]\s*/i, '').trim() || c.chapterTitle;
    return { label: toRoman(c.chapterNumber), title, pageNumber: first === Number.MAX_SAFE_INTEGER ? 1 : first };
  });

  const entryTitleByKey = new Map<string, string>();
  for (const row of await listManifests(projectId, 'PAGE')) {
    const content = row.content as { entryTitle?: string } | null;
    const title = content?.entryTitle?.trim();
    if (title) entryTitleByKey.set(row.externalId, title);
  }
  const firstBodyPageByEntry = new Map<string, number>();
  for (const p of bodyPages) {
    if (p.pageRole === 'continuation') continue;
    const compactedEntryKeys = Array.isArray(p.compactedEntryKeys)
      ? p.compactedEntryKeys.filter((key): key is string => typeof key === 'string' && key.length > 0)
      : [];
    const entryKeys = compactedEntryKeys.length ? compactedEntryKeys : p.entryKey ? [p.entryKey] : [];
    for (const entryKey of entryKeys) {
      const current = firstBodyPageByEntry.get(entryKey);
      if (current == null || p.plannedPageNumber < current) {
        firstBodyPageByEntry.set(entryKey, p.plannedPageNumber);
      }
    }
  }
  const indexEntries: TocEntry[] = Array.from(firstBodyPageByEntry.entries())
    .map(([entryKey, pageNumber]) => ({
      label: '',
      title: entryTitleByKey.get(entryKey) ?? entryKey,
      pageNumber,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  // ── FRONT sequence with recto/verso parity (index 1 = recto) ──
  const front: PlannedPage[] = [];
  const blank = (): PlannedPage => ({
    pageKey: '',
    section: 'FRONT_MATTER',
    kind: 'BLANK',
    frontMatterType: 'BLANK',
    pageLabel: null,
    compose: {},
    auditText: null,
  });
  const push = (p: Omit<PlannedPage, 'pageKey' | 'section'>): void => {
    front.push({ ...p, pageKey: '', section: 'FRONT_MATTER' });
  };
  const nextIndex = (): number => front.length + 1;
  const ensureRecto = (): void => {
    if (nextIndex() % 2 === 0) front.push(blank());
  };

  push({ kind: 'HALF_TITLE', frontMatterType: 'HALF_TITLE', pageLabel: null, compose: { title: meta.resolvedTitle }, auditText: null });
  front.push(blank());
  push({
    kind: 'TITLE_PAGE',
    frontMatterType: 'TITLE_PAGE',
    pageLabel: null,
    compose: {
      title: meta.resolvedTitle,
      subtitle: meta.resolvedSubtitle,
      authors: meta.resolvedAuthors,
      imprint: meta.publisher?.imprint,
    },
    auditText: null,
  });
  const copyrightLines = buildCopyrightLines(meta);
  push({ kind: 'COPYRIGHT_PAGE', frontMatterType: 'COPYRIGHT_PAGE', pageLabel: null, compose: { copyrightLines }, auditText: copyrightLines.join('\n') });
  if (disclaimerParagraphs.length > 0) {
    ensureRecto();
    const split = splitTextPages(disclaimerParagraphs, canvasIn);
    split.forEach((paras, i) => {
      push({
        kind: 'TEXT_PAGE',
        frontMatterType: 'DISCLAIMER',
        pageLabel: toRoman(nextIndex()).toLowerCase(),
        compose: { heading: i === 0 ? disclaimerHeading : undefined, paragraphs: paras },
        auditText: paras.join('\n\n'),
      });
    });
  }
  if (meta.dedication) {
    ensureRecto();
    push({ kind: 'DEDICATION', frontMatterType: 'DEDICATION', pageLabel: null, compose: { dedicationText: meta.dedication }, auditText: meta.dedication });
  }
  ensureRecto();
  push({
    kind: 'CONTENTS',
    frontMatterType: 'CONTENTS',
    pageLabel: toRoman(nextIndex()).toLowerCase(),
    compose: { tocHeading: 'Contents', tocEntries },
    auditText: tocEntries.map((e) => `${e.label}. ${e.title} … ${e.pageNumber}`).join('\n'),
  });
  if (introParagraphs.length > 0) {
    ensureRecto();
    const split = splitTextPages(introParagraphs, canvasIn);
    split.forEach((paras, i) => {
      push({
        kind: 'TEXT_PAGE',
        frontMatterType: 'INTRODUCTION',
        pageLabel: toRoman(nextIndex()).toLowerCase(),
        compose: { heading: i === 0 ? 'Introduction' : undefined, paragraphs: paras },
        auditText: paras.join('\n\n'),
      });
    });
  }
  // Even front count ⇒ Chapter 1 (arabic 1) opens on a recto.
  if (front.length % 2 === 1) front.push(blank());

  // ── BACK sequence ──
  const bodyCount = bodyPages.length;
  const back: PlannedPage[] = [];
  let backFolio = bodyCount;
  const pushBack = (p: Omit<PlannedPage, 'pageKey' | 'section'>, printedFolio: boolean): void => {
    backFolio += 1;
    back.push({ ...p, pageKey: '', section: 'BACK_MATTER', pageLabel: printedFolio ? String(backFolio) : null });
  };

  if (glossaryParagraphs.length > 0) {
    const split = splitReferenceTextPages(glossaryParagraphs, canvasIn);
    split.forEach((paras, i) => {
      pushBack(
        {
          kind: 'GLOSSARY',
          frontMatterType: 'GLOSSARY',
          pageLabel: null,
          compose: { heading: i === 0 ? 'Glossary' : undefined, paragraphs: paras },
          auditText: paras.join('\n\n'),
        },
        true,
      );
    });
  } else {
    omitted.push({ page: 'GLOSSARY', reason: 'no glossary section found in manuscript' });
  }

  if (indexEntries.length > 0) {
    const indexPages = splitIndexEntries(indexEntries, canvasIn);
    indexPages.forEach((entries, i) => {
      pushBack(
        {
          kind: 'INDEX',
          frontMatterType: 'INDEX',
          pageLabel: null,
          compose: { tocHeading: i === 0 ? 'Index' : 'Index Continued', tocEntries: entries },
          auditText: entries.map((e) => `${e.title} ... ${e.pageNumber}`).join('\n'),
        },
        true,
      );
    });
  } else {
    omitted.push({ page: 'INDEX', reason: 'no body entry titles available for index' });
  }

  // About the Author — verbatim → facts → OMIT (never invent).
  if (meta.authorBio?.verbatim) {
    pushBack(
      { kind: 'TEXT_PAGE', frontMatterType: 'ABOUT_AUTHOR', pageLabel: null, compose: { heading: aboutAuthorHeading(meta.resolvedAuthors), paragraphs: sectionParagraphs(meta.authorBio.verbatim) }, auditText: meta.authorBio.verbatim },
      true,
    );
  } else if (meta.authorBio?.facts?.length) {
    // Deterministic structuring: facts typeset as clean lines. (AI polish is
    // a v1.1 refinement — facts are never altered or extended here.)
    pushBack(
      { kind: 'TEXT_PAGE', frontMatterType: 'ABOUT_AUTHOR', pageLabel: null, compose: { heading: aboutAuthorHeading(meta.resolvedAuthors), paragraphs: meta.authorBio.facts }, auditText: meta.authorBio.facts.join('\n') },
      true,
    );
  } else {
    omitted.push({ page: 'ABOUT_AUTHOR', reason: 'no verbatim bio and no author facts supplied — page omitted (never invent)' });
  }

  if (meta.series?.name) {
    const desc = meta.series.description
      ? sectionParagraphs(meta.series.description)
      : [`${meta.resolvedTitle} is part of the ${meta.series.name} series.`];
    pushBack(
      { kind: 'TEXT_PAGE', frontMatterType: 'ABOUT_SERIES', pageLabel: null, compose: { heading: `About the ${meta.series.name} Series`, paragraphs: desc }, auditText: desc.join('\n\n') },
      true,
    );
  } else {
    omitted.push({ page: 'ABOUT_SERIES', reason: 'no series metadata' });
  }

  if (meta.additionalResources) {
    pushBack(
      { kind: 'TEXT_PAGE', frontMatterType: 'RESOURCES', pageLabel: null, compose: { heading: meta.additionalResources.heading, paragraphs: meta.additionalResources.items }, auditText: meta.additionalResources.items.join('\n') },
      true,
    );
  } else {
    omitted.push({ page: 'RESOURCES', reason: 'no additionalResources metadata' });
  }

  // Even TOTAL page count (print requirement): front + body + back.
  if ((front.length + bodyCount + back.length) % 2 === 1) {
    back.push({ pageKey: '', section: 'BACK_MATTER', kind: 'BLANK', frontMatterType: 'BLANK', pageLabel: null, compose: {}, auditText: null });
  }

  // ── Back-cover copy ASSET (not a page). Deterministic v1: hooks template. ──
  let backCoverCopyAsset: string | null = null;
  if (meta.bookDescription?.hooks?.length) {
    const copy = [`${meta.resolvedTitle}${meta.resolvedSubtitle ? ' — ' + meta.resolvedSubtitle : ''}`, '', ...meta.bookDescription.hooks].join('\n');
    const stored = await storage.writeProjectFile(projectId, ['front-matter', 'back-cover-copy.txt'], copy);
    backCoverCopyAsset = stored.relativePath;
  } else {
    omitted.push({ page: 'BACK_COVER_COPY', reason: 'no bookDescription.hooks supplied' });
  }

  // ── Assign pageKeys + spineOrder, persist rows, compose + store files ──
  front.forEach((p, i) => (p.pageKey = `FM_${String(i + 1).padStart(3, '0')}_${p.frontMatterType}`));
  back.forEach((p, i) => (p.pageKey = `BM_${String(i + 1).padStart(3, '0')}_${p.frontMatterType}`));

  const rows: FrontMatterPageInsert[] = [
    ...front.map((p, i) => ({
      pageKey: p.pageKey,
      section: p.section,
      frontMatterType: p.frontMatterType,
      spineOrder: i + 1,
      pageLabel: p.pageLabel,
      readingFieldText: p.auditText,
    })),
    ...back.map((p, i) => ({
      pageKey: p.pageKey,
      section: p.section,
      frontMatterType: p.frontMatterType,
      spineOrder: i + 1,
      pageLabel: p.pageLabel,
      readingFieldText: p.auditText,
    })),
  ];
  const inserted = await replaceFrontBackMatterPages(projectId, rows);
  const idByKey = new Map(inserted.map((r) => [r.pageKey, r.id]));

  let filesWritten = 0;
  for (const p of [...front, ...back]) {
    const composed = await composeFrontMatterPage({
      kind: p.kind,
      canvasIn,
      pageLabel: p.pageLabel,
      ...p.compose,
    });
    const png = await storage.writeProjectFile(projectId, ['front-matter', `${p.pageKey}.png`], composed.pngBuffer);
    const printPng = await storage.writeProjectFile(projectId, ['print-ready', `${p.pageKey}.print.png`], composed.pngBuffer);
    const printPdf = await storage.writeProjectFile(projectId, ['print-ready', `${p.pageKey}.print.pdf`], composed.pdfBuffer);
    filesWritten += 3;
    await insertDeterministicRender({
      pageId: idByKey.get(p.pageKey)!,
      projectId,
      imagePath: png.relativePath,
      printPngPath: printPng.relativePath,
      printPdfPath: printPdf.relativePath,
      widthPx: composed.widthPx,
      heightPx: composed.heightPx,
      standardVersion: WILDLANDS_STANDARD.version,
      composeSpec: { frontMatter: true, kind: p.kind, pageLabel: p.pageLabel, ...p.compose },
    });
  }

  return {
    projectId,
    scopeChapters,
    frontPages: front.map((p) => ({ pageKey: p.pageKey, kind: p.frontMatterType, pageLabel: p.pageLabel })),
    backPages: back.map((p) => ({ pageKey: p.pageKey, kind: p.frontMatterType, pageLabel: p.pageLabel })),
    introductionSource,
    omitted,
    tocEntries,
    bodyPageCount: bodyCount,
    totalBookPages: front.length + bodyCount + back.length,
    backCoverCopyAsset,
    filesWritten,
  };
}

function aboutAuthorHeading(authors: string[]): string {
  return authors.length > 1 ? 'About the Authors' : 'About the Author';
}
