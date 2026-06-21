/* APPROVED PROD override (user-authorized 2026-06-13): reclassify Eastern Hemlock
 * and Black Cherry from WARNING_PAGE/safety-illustration back to normal botanical
 * SPECIES_PROFILE tree portraits. Toxicity notes stay in the educational text only.
 * Mirrors what the now-fixed title-scoped danger classifier would produce. */
import { getDb } from '../src/db/client.js';
import { manifests } from '../src/db/schema/index.js';
import { and, eq, inArray } from 'drizzle-orm';

import { P as PROJECT } from './_project.js';

// SPECIES_PROFILE layout thresholds (chooseManifestTemplate, generate-manifests.ts).
function speciesLayout(wordCount: number): string {
  if (wordCount > 900) return 'LAYOUT_14_SIDEBAR_FEATURE';
  if (wordCount > 650) return 'LAYOUT_8_MARGIN_ILLUSTRATION';
  if (wordCount > 420) return 'LAYOUT_2_TEXT_HEAVY';
  if (wordCount < 180) return 'LAYOUT_3_ILLUSTRATION_DOMINANT';
  return 'LAYOUT_1_STANDARD';
}

const SUBJECTS: Record<string, string> = {
  CH04_P008:
    'Eastern Hemlock (Tsuga canadensis) — premium botanical field-guide portrait of a mature native evergreen conifer with layered, gracefully drooping branches, soft flat needles, and small cones, set in a New England forest environment. A normal, harmless tree — NOT a warning or safety illustration.',
  CH04_P011:
    'Black Cherry (Prunus serotina) — premium botanical field-guide portrait of the mature native tree showing its distinctive dark scaly bark, finely-toothed leaves, and drooping clusters of small dark fruit, in a natural New England forest-edge habitat. A normal botanical tree portrait — NOT a warning or safety illustration.',
};

const db = getDb();
const keys = Object.keys(SUBJECTS);
const rows = await db
  .select({ id: manifests.id, externalId: manifests.externalId, content: manifests.content })
  .from(manifests)
  .where(and(eq(manifests.projectId, PROJECT), eq(manifests.kind, 'PAGE'), inArray(manifests.externalId, keys)));

for (const r of rows) {
  const c = { ...(r.content as Record<string, unknown>) };
  const body = typeof c.bodyMarkdown === 'string' ? c.bodyMarkdown : '';
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const layout = speciesLayout(wordCount);
  const subject = SUBJECTS[r.externalId]!;
  c.contentType = 'SPECIES_PROFILE';
  delete c.category; // drop the wrong DANGER tag
  c.layoutTemplate = layout;
  c.imageSubject = subject;
  c.cleanSubject = subject; // render path reads cleanSubject first
  await db.update(manifests).set({ content: c }).where(eq(manifests.id, r.id));
  console.log(`${r.externalId} -> SPECIES_PROFILE / ${layout} (wordCount ${wordCount})`);
}

// Read-back verification.
console.log('\nVERIFY:');
const after = await db
  .select({ externalId: manifests.externalId, content: manifests.content })
  .from(manifests)
  .where(and(eq(manifests.projectId, PROJECT), eq(manifests.kind, 'PAGE'), inArray(manifests.externalId, keys)));
for (const r of after) {
  const c = (r.content ?? {}) as Record<string, unknown>;
  console.log(`  ${r.externalId}: contentType=${c.contentType} category=${c.category ?? '(none)'} layout=${c.layoutTemplate}`);
  console.log(`     subject=${String(c.cleanSubject).slice(0, 80)}...`);
}
process.exit(0);
