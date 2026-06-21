/* APPROVED PROD override (user-authorized 2026-06-14): Chapter 8 bushcraft pages.
 * Like Ch7, every "From the Land" page defaulted to a generic "small supporting
 * wilderness illustration for [landscape]" because the title is a skill concept, not
 * a species. Each is upgraded to depict the actual bushcraft SKILL in the bushcraft
 * field-guide naturalist style. Subject-only; contentType/category unchanged. */
import { getDb } from '../src/db/client.js';
import { manifests } from '../src/db/schema/index.js';
import { and, eq, inArray } from 'drizzle-orm';

import { P as PROJECT } from './_project.js';

const SUBJECTS: Record<string, string> = {
  CH08_P001:
    'Primitive fire-making from natural materials: a bow-drill friction-fire set with spindle, fireboard, and a glowing coal dropped into a tinder bundle of dry grass and birch bark, New England forest floor, bushcraft field-guide naturalist style.',
  CH08_P002:
    'Cutaway illustration of a natural debris-hut survival shelter built from the land: framework of branches over a ridgepole, ribbing, and thick leaf-litter insulation shown in cross-section, New England forest, bushcraft field-guide naturalist style.',
  CH08_P003:
    'Obtaining water from the land: a clear transpiration bag tied over green leafy foliage, a birch tap dripping sap into a container, and rainwater collection, New England forest, bushcraft field-guide naturalist style.',
  CH08_P004:
    'Emergency wild edible plants of New England arranged as a foraging field study: cattail, acorns, wild greens, berries, and edible roots laid out with identification detail, bushcraft field-guide naturalist style.',
  CH08_P005:
    'Medicinal first-aid plants of New England used in the field: broadleaf plantain, yarrow, and pine resin shown with a crushed-leaf poultice and wound-care context, bushcraft field-guide naturalist style.',
  CH08_P006:
    'Making cordage and tools from the land: hands twisting plant-fiber bark (dogbane or basswood) into strong cordage, with simple natural tools beside it, forest floor, bushcraft field-guide naturalist style.',
  CH08_P009:
    'Batoning technique: splitting a log by driving a fixed-blade knife through the wood with a wooden baton to expose dry inner wood in wet conditions, New England forest setting, bushcraft field-guide naturalist style.',
  CH08_P010:
    'Essential bushcraft knots study for a field guide: bowline, clove hitch, taut-line hitch, and square lashing tied in natural cordage, each clearly illustrated and labeled, naturalist diagram style.',
  CH08_P011:
    'Wood carving and camp tools: whittling a wooden spoon and a try-stick with a knife, with carved camp implements arranged on a work block, forest setting, bushcraft field-guide naturalist style.',
  CH08_P012:
    'Reading weather from the land: a sky-reading study of cloud types (high cirrus, building cumulus, an advancing storm front), wind moving through the trees, and natural weather signs over a New England landscape, bushcraft field-guide naturalist style.',
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
  console.log(`  ${r.externalId}: ${String(c.cleanSubject).slice(0, 72)}...`);
}
process.exit(0);
