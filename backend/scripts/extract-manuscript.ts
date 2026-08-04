/* Dumps per-chapter manuscript text from the DB (pages.readingFieldText, in
 * plannedPageNumber order) to plain-text files, one per chapter. No spend,
 * no writes — read-only. This is the starting point for drafting any
 * chapter revision plan: run it, read the output, identify exact page keys. */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const PROJECT = process.argv[2];
const OUT_DIR = process.argv[3] ?? './manuscript-dump';

if (!PROJECT) {
  console.error('Usage: tsx scripts/extract-manuscript.ts <projectId> [outDir]');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const pages = await listPaginatedPagesForProject(PROJECT);
console.log(`Total pages: ${pages.length}`);

const byChapter = new Map<number, typeof pages>();
for (const p of pages) {
  const list = byChapter.get(p.chapterNumber) ?? [];
  list.push(p);
  byChapter.set(p.chapterNumber, list);
}

const chapterNums = Array.from(byChapter.keys()).sort((a, b) => a - b);
for (const ch of chapterNums) {
  const chPages = byChapter.get(ch)!;
  const lines: string[] = [];
  lines.push(`=== CHAPTER ${ch} (${chPages.length} pages) ===\n`);
  for (const p of chPages) {
    lines.push(`--- ${p.pageKey} | section=${p.section} | role=${p.pageRole ?? ''} | frontMatterType=${(p as any).frontMatterType ?? ''} | plannedPage=${p.plannedPageNumber} ---`);
    lines.push((p.readingFieldText ?? '').trim());
    lines.push('');
  }
  const fname = path.join(OUT_DIR, `chapter-${String(ch).padStart(2, '0')}.txt`);
  writeFileSync(fname, lines.join('\n'), 'utf8');
  console.log(`Wrote ${fname} (${chPages.length} pages, ${lines.join('\n').length} chars)`);
}

process.exit(0);
