/* APPROVED PROD override (user-authorized 2026-06-14): Chapter 6 terrain subjects.
 * P011 had the Giardia pathogen binomial hijacked into a beaver-pond water-source
 * page; P004 (Nor'easters) and P016 (When Technology Fails) upgraded from a generic
 * "wilderness landscape" to stronger educational scene subjects. Subject-only;
 * contentType/category unchanged. Exact wording supplied by the publisher. */
import { getDb } from '../src/db/client.js';
import { manifests } from '../src/db/schema/index.js';
import { and, eq, inArray } from 'drizzle-orm';

import { P as PROJECT } from './_project.js';

const SUBJECTS: Record<string, string> = {
  CH06_P011:
    'New England beaver pond water-source scene: still tannin-dark pond, beaver lodge or dam, marsh grasses, spruce/fir and hardwood forest edge, muddy bank, water collection context; subtle cautionary field-guide mood about giardia risk, but no microscopic pathogen imagery.',
  CH06_P004:
    'Powerful New England nor’easter scene: storm clouds, wind-driven rain or snow, rough coastal forest or mountain ridge, bent spruce, cold gray Atlantic atmosphere, dangerous weather building across the landscape, cinematic naturalist field-guide style.',
  CH06_P016:
    'Wilderness navigation scene showing map and compass use after technology failure: New England forested ridgeline, trail junction or rocky overlook, hand-drawn map/compass field-study elements, no GPS signal, terrain-reading emphasis, vintage expedition-journal style.',
};

const db = getDb();
const keys = Object.keys(SUBJECTS);
const rows = await db
  .select({ id: manifests.id, externalId: manifests.externalId, content: manifests.content })
  .from(manifests)
  .where(and(eq(manifests.projectId, PROJECT), eq(manifests.kind, 'PAGE'), inArray(manifests.externalId, keys)));

for (const r of rows) {
  const c = { ...(r.content as Record<string, unknown>) };
  const subject = SUBJECTS[r.externalId]!;
  c.imageSubject = subject;
  c.cleanSubject = subject;
  await db.update(manifests).set({ content: c }).where(eq(manifests.id, r.id));
  console.log(`${r.externalId} updated`);
}

console.log('\nVERIFY:');
const after = await db
  .select({ externalId: manifests.externalId, content: manifests.content })
  .from(manifests)
  .where(and(eq(manifests.projectId, PROJECT), eq(manifests.kind, 'PAGE'), inArray(manifests.externalId, keys)));
for (const r of after.sort((a, b) => a.externalId.localeCompare(b.externalId))) {
  const c = (r.content ?? {}) as Record<string, unknown>;
  console.log(`  ${r.externalId}: ${String(c.cleanSubject).slice(0, 80)}...`);
}
process.exit(0);
