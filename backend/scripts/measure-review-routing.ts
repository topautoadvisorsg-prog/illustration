/**
 * Measure readable content per page and persist it, then report the routing
 * split under the active policy.
 *
 * Writes ONLY the measurement columns (readable_words / readable_chars /
 * text_blocks). It never writes an operator override and never touches
 * approval state — routing decides who looks at a page, not whether the page
 * is correct.
 *
 * Safe to re-run: measurement is derived from the page spec, so a re-run after
 * a re-pagination simply refreshes the numbers.
 *
 * Usage:
 *   tsx scripts/measure-review-routing.ts            # dry run, prints the split
 *   tsx scripts/measure-review-routing.ts --commit   # persist measurements
 *   tsx scripts/measure-review-routing.ts --threshold 300 --commit
 */
import { eq } from 'drizzle-orm';

import { P } from './_project.js';
import { getDb } from '../src/db/client.js';
import { pages, projects } from '../src/db/schema/index.js';
import { prepareRender } from '../src/pipeline/whole-page-render/render-whole-page.js';
import {
  DEFAULT_HIGH_TEXT_WORD_THRESHOLD,
  classifyReviewRoute,
  summariseRouting,
  type PageRoutingInput,
} from '../src/services/review-routing/policy.js';

interface Measured extends PageRoutingInput {
  id: string;
  pageKey: string;
  readableChars: number;
}

async function main() {
  const argv = process.argv.slice(2);
  const commit = argv.includes('--commit');
  const tIdx = argv.indexOf('--threshold');
  const cliThreshold = tIdx === -1 ? null : Number(argv[tIdx + 1]);

  const db = getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, P)).limit(1);
  const threshold =
    cliThreshold ?? (project as any)?.highTextWordThreshold ?? DEFAULT_HIGH_TEXT_WORD_THRESHOLD;
  const policy = { highTextWordThreshold: threshold };

  const rows = await db.select().from(pages).where(eq(pages.projectId, P));
  console.error(`measuring ${rows.length} pages at threshold ${threshold}...`);

  const measured: Measured[] = [];
  let n = 0;
  for (const row of rows as any[]) {
    let words = 0;
    let chars = 0;
    let blocks = 0;
    try {
      const { spec } = await prepareRender(row.id);
      const pt = (spec as any).pageText ?? {};
      const parts: string[] = [];
      const t = pt.title ?? {};
      for (const k of ['kicker', 'number', 'name', 'scientificName']) if (t[k]) parts.push(String(t[k]));
      const bb: Array<{ text?: string }> = pt.bodyBlocks ?? [];
      for (const b of bb) if (b?.text) parts.push(b.text);
      blocks = bb.length;
      const text = parts.join(' ');
      chars = text.length;
      words = text.split(/\s+/).filter(Boolean).length;
    } catch (e) {
      console.error(`  ${row.pageKey}: measurement failed — ${e instanceof Error ? e.message : e}`);
      continue;
    }
    measured.push({
      id: row.id,
      pageKey: row.pageKey,
      readableWords: words,
      readableChars: chars,
      textBlocks: blocks,
      layoutTemplate: row.layoutTemplate ?? null,
      reviewRouteOverride: row.reviewRouteOverride ?? null,
    });
    if (++n % 50 === 0) console.error(`  ${n}/${rows.length}`);
  }

  if (commit) {
    for (const m of measured) {
      await db
        .update(pages)
        .set({ readableWords: m.readableWords, readableChars: m.readableChars, textBlocks: m.textBlocks })
        .where(eq(pages.id, m.id));
    }
    console.error(`persisted measurements for ${measured.length} pages`);
  }

  const summary = summariseRouting(measured, policy);
  console.log(`\n════════ REVIEW ROUTING — threshold ${threshold} readable words ════════`);
  console.log(`  HIGH TEXT · AI REVIEW      : ${summary.aiReview}`);
  console.log(`     of which + MANUAL CHECK : ${summary.manualCheckRequired}`);
  console.log(`  MANUAL REVIEW              : ${summary.manualReview}`);
  console.log(`  operator overrides         : ${summary.overridden}`);
  console.log(`  unmeasured                 : ${summary.unmeasured}`);
  console.log(`  TOTAL                      : ${summary.total}`);

  const ai = measured.filter((m) => classifyReviewRoute(m, policy).route === 'AI_REVIEW');
  console.log(`\n  AI review cost @ $0.0019/page: $${(ai.length * 0.0019).toFixed(3)}`);

  const check = measured.filter((m) => classifyReviewRoute(m, policy).manualCheckRequired);
  if (check.length) {
    console.log(`\n  AI REVIEW + MANUAL CHECK REQUIRED (structured layouts):`);
    for (const c of check) console.log(`    ${c.pageKey.padEnd(26)} ${c.readableWords}w  ${c.layoutTemplate}`);
  }

  console.log(commit ? '\nMeasurements persisted. No approval state written.' : '\nDRY RUN — pass --commit to persist.');
  process.exit(0);
}

main();
