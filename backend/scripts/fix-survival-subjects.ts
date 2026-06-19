/* APPROVED PROD override (user-authorized 2026-06-14): Chapter 7 survival pages.
 * Every page had defaulted to a generic "safety illustration for [landscape]" because
 * the title (SHELTER, FIRE, WATER...) is a concept, not a species or lexicon term, so
 * the subject extractor fell back to scenery. Each is upgraded to depict the actual
 * survival SKILL in the Cinematic Naturalist survival field-guide style. Subject-only;
 * contentType/category unchanged. */
import { getDb } from '../src/db/client.js';
import { manifests } from '../src/db/schema/index.js';
import { and, eq, inArray } from 'drizzle-orm';

const PROJECT = '66c1c69c-2c81-409e-a4b5-bff3f3bb04ba';

const SUBJECTS: Record<string, string> = {
  CH07_P001:
    'Wilderness survival priorities overview for a New England field guide: the rule of threes shown through the core survival elements — emergency shelter, fire, water, and signaling — arranged as a cohesive, calm naturalist montage on a forest-floor field-study layout, vintage expedition-journal style.',
  CH07_P002:
    'Emergency wilderness shelter in a New England forest: a well-built debris hut / lean-to of branches, bark slabs, and spruce boughs against a fallen log, insulated with thick leaf litter, set in a boreal spruce-fir setting, survival field-guide naturalist style.',
  CH07_P003:
    'Wilderness water procurement scene: collecting clear water from a New England spring or stream into a container with an improvised cloth/charcoal filter, mossy rocks and forest setting, survival field-guide naturalist style.',
  CH07_P004:
    'Wilderness fire-making scene: a small, carefully built campfire with a tinder bundle, graded kindling, and a ferro rod and knife on the forest floor, sparks catching, New England woods, survival field-guide naturalist style.',
  CH07_P005:
    'Wilderness signaling scene: ground-to-air distress signals — three signal fires arranged in a triangle in an open clearing, plus a signal mirror flash and an emergency whistle — with a mountain backdrop; "three is the universal distress signal," survival field-guide naturalist style.',
  CH07_P006:
    'Wilderness first-aid scene: an improvised splint bound with cloth strips and a straight branch, basic bandaging, and a compact first-aid kit laid out on a pack, forest setting, survival field-guide naturalist style.',
  CH07_P007:
    'Survival decision scene: a lone hiker pausing at a river crossing / trail junction weighing self-rescue versus staying put, paper map and marked terrain in hand, New England wilderness with ridgelines beyond, survival field-guide naturalist style.',
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
  console.log(`  ${r.externalId}: ${String(c.cleanSubject).slice(0, 75)}...`);
}
process.exit(0);
