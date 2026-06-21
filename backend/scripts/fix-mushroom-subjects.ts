/* APPROVED PROD override (user-authorized 2026-06-14): Chapter 5 mushroom subject
 * fixes. Three species had a HABITAT LANDSCAPE hijacked into their image subject
 * (Morel, Honey Mushroom, False Morel); Honey Mushroom was also wrongly a
 * WARNING_PAGE (it is edible). Two section headers had a vague "wilderness
 * landscape" subject upgraded to proper mycological montages. Exact wording supplied
 * by the publisher. Root causes already fixed in generate-manifests.ts (title-scoped
 * danger classifier + numbered-entry title-as-subject guard). */
import { getDb } from '../src/db/client.js';
import { manifests } from '../src/db/schema/index.js';
import { and, eq, inArray } from 'drizzle-orm';

import { P as PROJECT } from './_project.js';

type Override = { subject: string; contentType?: string; category?: string | null };
const FIXES: Record<string, Override> = {
  CH05_P008: {
    subject:
      'Morel mushroom (Morchella esculenta) — honeycomb-ridged conical tan cap on a hollow pale stem, growing on a New England spring forest floor.',
  },
  CH05_P009: {
    subject:
      'Honey Mushroom (Armillaria mellea) — dense clusters of honey-tan caps at the base of a hardwood stump in a New England forest; toxic-lookalike cautions remain in the text.',
    contentType: 'COMPARISON',
    category: 'EDIBLE',
  },
  CH05_P016: {
    subject:
      'False Morel (Gyromitra esculenta), TOXIC/DEADLY — irregular reddish-brown brain-like wrinkled cap on a thick pale stem, shown as a serious field-guide safety plate.',
  },
  CH05_P001: {
    subject:
      'Mushroom-foraging safety montage for a New England field guide: basket, hand lens, spore-print card, knife, field notebook, and a careful arrangement of edible and toxic mushroom specimens on a forest floor, vintage naturalist style.',
  },
  CH05_P011: {
    subject:
      "Warning-style field-guide montage of New England's deadly mushrooms, including Destroying Angel, Death Cap, and Galerina, arranged as distinct naturalist studies with serious educational tone, vintage botanical/mycological illustration style.",
  },
};

const db = getDb();
const keys = Object.keys(FIXES);
const rows = await db
  .select({ id: manifests.id, externalId: manifests.externalId, content: manifests.content })
  .from(manifests)
  .where(and(eq(manifests.projectId, PROJECT), eq(manifests.kind, 'PAGE'), inArray(manifests.externalId, keys)));

for (const r of rows) {
  const c = { ...(r.content as Record<string, unknown>) };
  const fix = FIXES[r.externalId]!;
  c.imageSubject = fix.subject;
  c.cleanSubject = fix.subject; // render path reads cleanSubject first
  if (fix.contentType) c.contentType = fix.contentType;
  if (fix.category !== undefined) {
    if (fix.category === null) delete c.category;
    else c.category = fix.category;
  }
  await db.update(manifests).set({ content: c }).where(eq(manifests.id, r.id));
  console.log(`${r.externalId} updated (contentType=${c.contentType} category=${c.category ?? '(none)'})`);
}

console.log('\nVERIFY:');
const after = await db
  .select({ externalId: manifests.externalId, content: manifests.content })
  .from(manifests)
  .where(and(eq(manifests.projectId, PROJECT), eq(manifests.kind, 'PAGE'), inArray(manifests.externalId, keys)));
for (const r of after.sort((a, b) => a.externalId.localeCompare(b.externalId))) {
  const c = (r.content ?? {}) as Record<string, unknown>;
  console.log(`  ${r.externalId} [${c.contentType}]: ${String(c.cleanSubject).slice(0, 80)}...`);
}
process.exit(0);
