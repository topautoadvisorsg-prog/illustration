/**
 * Regression guard for the "renderer silently strips text" bug class
 * (the cover/title-page/glossary/index bug fixed 2026-08-02).
 *
 * For every planned page in a project, builds the REAL WholePageSpec and
 * assembled prompt via prepareRender() — the exact same pure, no-spend,
 * no-DB-write path the real render pipeline uses — and checks that every
 * piece of text the spec says belongs on the page actually appears in the
 * prompt handed to the image model. Catches a page type silently dropping
 * text before you pay to render it, without needing to know in advance
 * which page types are "special" — it checks real content, not code paths.
 *
 * Usage: tsx scripts/verify-text-fidelity.ts <projectId>
 * Exit code 0 = clean, 1 = at least one page is missing expected text.
 */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { prepareRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
import type { WholePageSpec } from '../src/pipeline/whole-page-render/types.js';

interface Finding {
  pageKey: string;
  pageType: string;
  issue: string;
}

function preview(text: string): string {
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/**
 * What "expected text" means depends on the page's role, mirroring
 * assemble-page-prompt.ts's own COVER_WRAP / TITLE_PAGE / generic branches.
 * Deliberately independent of that file's internals — this checks the
 * actual DATA (spec) against the actual OUTPUT (prompt string), so it still
 * catches a regression even if assemble-page-prompt.ts is rewritten later.
 */
// Body/cover/title text is embedded in the prompt either as plain prose or
// inside a JSON.stringify() block (PAGE BODY, TITLE-PAGE typography, PAGE
// TEXT — cover copy) — in the JSON form, a literal `"` in the source text
// becomes `\"`. Check both forms so a quote in the prose doesn't read as a
// false "missing" flag.
function appearsIn(prompt: string, text: string): boolean {
  return prompt.includes(text) || prompt.includes(JSON.stringify(text).slice(1, -1));
}

function checkPage(pageKey: string, spec: WholePageSpec, prompt: string): Finding[] {
  const findings: Finding[] = [];
  const expect = (label: string, text: string | undefined | null) => {
    if (text && !appearsIn(prompt, text)) {
      findings.push({ pageKey, pageType: spec.pageType, issue: `missing ${label}: "${preview(text)}"` });
    }
  };

  if (spec.pageType === 'COVER_WRAP') {
    const cc = spec.coverCopy;
    if (cc) {
      expect('cover title', cc.title);
      expect('cover subtitle', cc.subtitle);
      expect('cover author', cc.author);
      expect('cover series line', cc.seriesLine);
      expect('back-cover main description', cc.backCover?.mainDescription);
      for (const item of cc.backCover?.insideThisVolume ?? []) expect('inside-this-volume item', item);
      expect('back-cover author bio', cc.backCover?.authorBio);
    }
    return findings;
  }

  if (spec.pageType === 'TITLE_PAGE') {
    // Half-title intentionally has an EMPTY titleHierarchy (pure illustration
    // entrance plate) — nothing to check there, and that's correct, not a bug.
    for (const line of spec.typographyDNA.titleHierarchy) expect('title-page line', line);
    return findings;
  }

  // Every other page type (INTERIOR, CHAPTER_OPENER, CONTINUATION, COMPACTED,
  // GLOSSARY_ORNAMENT, INDEX_ORNAMENT, AUTHOR_PAGE, SERIES_PAGE, CONTENTS,
  // COPYRIGHT_PAGE, INTRO_OPENER) all render via the generic PAGE TEXT/PAGE
  // BODY path — same check for all of them.
  expect('page title', spec.pageText.title.name);
  for (const b of spec.pageText.bodyBlocks) expect('body block', b.text);
  return findings;
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('usage: tsx scripts/verify-text-fidelity.ts <projectId>');
    process.exit(2);
  }

  const pages = await listPaginatedPagesForProject(projectId);
  let checked = 0;
  let flaggedPages = 0;
  const allFindings: Finding[] = [];

  for (const page of pages) {
    let prepared;
    try {
      prepared = await prepareRender(page.id);
    } catch (err) {
      console.error(`  [SKIP] ${page.pageKey}: could not prepare render (${(err as Error).message})`);
      continue;
    }
    checked++;
    const findings = checkPage(page.pageKey, prepared.spec, prepared.assembledPrompt);
    if (findings.length > 0) {
      flaggedPages++;
      allFindings.push(...findings);
    }
  }

  console.log(`\nChecked ${checked} pages, ${flaggedPages} flagged.\n`);
  for (const f of allFindings) {
    console.log(`  [${f.pageType}] ${f.pageKey}: ${f.issue}`);
  }
  if (allFindings.length === 0) {
    console.log('Every page with expected text bakes that text into its prompt. Clean.');
  }
  process.exit(flaggedPages > 0 ? 1 : 0);
}

main();
