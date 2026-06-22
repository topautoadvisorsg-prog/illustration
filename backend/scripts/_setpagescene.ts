/* Operator tool: give ONE page a complete per-page SCENE override — subject +
 * composition-contract prose (imagePlacement) + text placement — via its own PAGE
 * manifest. prepareRender prefers a manifest keyed by the page's own pageKey, so
 * this affects ONLY this page (a single continuation), never the opener or siblings.
 * The scene strings are defined inline per page because they are bespoke. Read+write,
 * NO render/spend. Usage: _setpagescene.ts <pageKey>
 *
 * After this, review no-spend with _inspect.ts / _prompt.ts / _layoutpreview.ts,
 * then (only on operator GO) render once with _batch.ts. */
import { getDb } from '../src/db/client.js';
import { manifests } from '../src/db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import { P } from './_project.js';

interface Scene { subject: string; imagePlacement: string; textPlacement: string }

const SCENES: Record<string, Scene> = {
  // CH02 Coyote, second continuation — must read DISTINCTLY from the lone-adult
  // first continuation. A real family scene, framed by illustration on all four
  // sides so the text is pushed inward off the trim.
  CH02_P004_c2: {
    subject:
      'An adult eastern coyote (Canis latrans) MOTHER with her PUPS at a den at the edge of New England woodland — the mother actively interacting with the pups (nuzzling, grooming, and playing), at least TWO pups clearly visible, one tumbling beside her; a living FAMILY GROUP showing social behaviour, among forest-floor ferns, a moss-covered log and scattered pinecones in soft quiet morning light. Field-guide naturalist accuracy in the same Cinematic Naturalist style and palette. NOT a single coyote, NOT a profile portrait, NOT a specimen plate.',
    imagePlacement:
      'The illustration zones hold the PRIMARY SUBJECT of this page — a real coyote FAMILY scene, NOT a specimen study, track study, pine-bough study, marginal accent, or a lone portrait. ' +
      'TOP BAND: an adult eastern coyote MOTHER actively engaged with her PUPS near a den entrance — nuzzling, grooming, playing with, or watching over them. At least TWO pups must be clearly visible and the scene must read immediately as a FAMILY GROUP with social interaction — never a single coyote standing alone, never a profile portrait, never a static specimen pose. ' +
      'BOTTOM BAND (MANDATORY — never blank parchment): a complementary, clearly DIFFERENT habitat / den-surroundings / tracks-and-sign study of the SAME family — forest-floor ferns, a moss-covered log, scattered pinecones, adult and pup tracks. There MUST be a real, finished illustration here, every time. ' +
      'The LEFT and RIGHT edges also stay illustration: let the woodland habitat run into the side margins so the page is illustration on ALL FOUR sides — even if only a little on the sides — and that framing PUSHES the reading text inward, away from every trim edge. Illustration may bleed off the trim edges; only non-essential background is cut, never the pups or the mother\'s face. ' +
      'This continuation must look DISTINCTLY different from the adjacent lone-coyote page while staying scientifically accurate and field-guide appropriate.',
    textPlacement:
      'ALL the body text sits in ONE reading panel VISUALLY CENTERED between the top and bottom illustration bands and fully INSIDE the inner orange safety line, with the side illustration framing it inward. Size the text DOWN — to the smallest still-clearly-readable book size — so every line fits between the bands and never touches a band or the safety line. One clean rectangle of text, never an L-shape, never anchored to a page edge.',
  },
};

const KEY = process.argv[2];
if (!KEY) { console.error('Usage: _setpagescene.ts <pageKey>'); process.exit(1); }
const scene = SCENES[KEY];
if (!scene) { console.error(`no scene defined for ${KEY} — add one to SCENES in _setpagescene.ts`); process.exit(1); }

const db = getDb();
const content = {
  imageSubject: scene.subject,
  cleanSubject: scene.subject,
  imagePlacement: scene.imagePlacement,
  textPlacement: scene.textPlacement,
};
const [existing] = await db
  .select({ id: manifests.id, content: manifests.content })
  .from(manifests)
  .where(and(eq(manifests.projectId, P), eq(manifests.kind, 'PAGE'), eq(manifests.externalId, KEY)))
  .limit(1);
if (existing) {
  await db.update(manifests).set({ content: { ...(existing.content as object), ...content } }).where(eq(manifests.id, existing.id));
  console.log(`${KEY}: updated existing page manifest`);
} else {
  await db.insert(manifests).values({ projectId: P, kind: 'PAGE', externalId: KEY, content });
  console.log(`${KEY}: inserted page-specific manifest`);
}
console.log('  subject       =', scene.subject.slice(0, 90) + '…');
console.log('  imagePlacement=', scene.imagePlacement.slice(0, 90) + '…');
process.exit(0);
