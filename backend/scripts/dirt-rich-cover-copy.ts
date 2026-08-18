/**
 * Set DIRT RICH's real cover copy, and correct the subtitle.
 *
 * ─── THE SUBTITLE WAS WRONG ───────────────────────────────────────────────
 * Intake used "A Beginner's Guide to Backyard Homesteading". Nobody chose that;
 * it was inferred from the handoff's one-line description of the book instead of
 * read from the manuscript, which carries its own title block:
 *
 *   A Quarter-Acre Guide to Feeding Yourself          <- tagline
 *   # DIRT RICH
 *   ### A Beginner's Guide to Growing Vegetables, Raising Chickens for Eggs
 *       and Meat, and Preserving the Harvest on a Quarter Acre
 *   Abby Fenwick
 *
 * The authored subtitle is the long one. It is also the better one commercially:
 * it carries the search terms a buyer actually types. The lesson is narrower than
 * "read the manuscript" — it is that a title block is DATA, and inferring it from
 * prose when the file states it outright is inventing a fact.
 *
 * Back-cover copy is drafted from the book's own claims and voice. Every figure
 * below appears in the manuscript.
 *
 *   yarn tsx scripts/dirt-rich-cover-copy.ts            # show
 *   yarn tsx scripts/dirt-rich-cover-copy.ts --write
 */
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject, updateProjectConfig } from '../src/db/repositories/projects.repo.js';

const PROJECT_ID = '55d7bce0-2f71-4f02-8131-e6c750c8506e';
const WRITE = process.argv.includes('--write');

/**
 * APPROVED SUBTITLE.
 *
 * The manuscript's own title block reads "A Beginner's Guide to Growing
 * Vegetables, Raising Chickens for Eggs and Meat, and Preserving the Harvest on
 * a Quarter Acre" — accurate, and it names every activity, but it never says
 * "backyard homestead", which is the phrase buyers actually browse.
 *
 * This keeps every activity keyword from the author's line, leads with the
 * category phrase, and is four words shorter so it sets under a large title.
 * Verbs rather than gerunds, because the book is instructional.
 *
 * Known trade: "Backyard Homestead" is the category leader's exact title, so
 * this invites direct comparison. Deliberate — same promise, real numbers.
 */
const SUBTITLE =
  'Build a Backyard Homestead on a Quarter Acre: Grow Vegetables, ' +
  'Raise Chickens for Eggs and Meat, and Preserve the Harvest';

const BACK_BLURB =
  'Most books about growing your own food are selling you a feeling. This one counts. ' +
  'Backyard eggs cost me twenty dollars a dozen in year one and under three from year two on. ' +
  'The work runs three to five hours a week, except in April and August, when it does not. ' +
  'Everything here happened on one ordinary quarter acre with a real winter.';

const BACK_FEATURES = [
  'What to plant first, and how much of it feeds four people',
  'Chickens for eggs, and the chapter most books leave out',
  'Preserving: the hours it really takes, and when they land',
  'Neighbors, HOAs and zoning, before you buy anything',
  'Every number in the book, collected in one appendix',
];

const AUTHOR_BIO =
  'Abby Fenwick has spent fifteen years turning a quarter-acre suburban lot into something that feeds her family. ' +
  'She is not a farmer, an agronomist, or anyone with a certificate on the wall.';

/**
 * Art direction. Same formula as NO ONE TOLD ME THAT — one field, one accent,
 * a few large objects, generous empty space — plus two corrections from the
 * first generation: the author name sat too close to the trimmed edge, and the
 * back panel had nothing on it.
 */
const ART_DIRECTION =
  'A designed graphic cover for an adult beginner. One flat field color across the whole wrap, one warm accent, ' +
  'flat bold shapes and generous empty space. A few large simple objects only — garden tools, a jar of preserves, ' +
  'vegetables, a hen. Nothing folksy, nothing rustic-cottage, no barn, no farmhouse, no tractor, no open acreage. ' +
  "Keep the author's name clear of the bottom edge, with a band of quiet color beneath it, so it can never crowd " +
  'the trim. Set the back panel as a readable text panel, not a decorative plate.';

const project = await getProject(PROJECT_ID);
if (!project) throw new Error('project not found');

/**
 * Read the row RAW, not through the schema.
 *
 * An earlier run wrote `publishing.authorBio` as a string before validation
 * rejected it, so the stored row no longer parses — and a repair script that
 * parses first can never run. Repair reads raw, fixes the shape, and lets the
 * write validate.
 */
const raw = (project.config ?? {}) as Record<string, any>;
const pub = (raw.publishing ?? {}) as Record<string, any>;

console.log('SUBTITLE');
console.log(`  was : ${project.subtitle ?? '(none)'}`);
console.log(`  now : ${SUBTITLE}
`);
console.log('BACK COVER');
console.log(`  ${BACK_BLURB}
`);
for (const f of BACK_FEATURES) console.log(`   • ${f}`);
console.log(`
  ${AUTHOR_BIO}
`);

if (!WRITE) {
  console.log('SHOW ONLY — nothing written. Re-run with --write.');
  process.exit(0);
}

// Drop the loose keys an earlier run put at the wrong level, then set the
// schema-correct shapes: authorBio is an object, back-cover copy lives under
// bookDescription as three distinct pieces.
delete pub.authorBio;
delete pub.blurb;
delete pub.features;

const next = {
  ...raw,
  subtitle: SUBTITLE,
  coverArtDirection: ART_DIRECTION,
  publishing: {
    ...pub,
    subtitle: SUBTITLE,
    authorBio: { verbatim: AUTHOR_BIO },
    bookDescription: {
      ...(pub.bookDescription ?? {}),
      blurb: BACK_BLURB,
      features: BACK_FEATURES,
      authorBio: AUTHOR_BIO,
    },
  },
};

// Validate BEFORE writing, so a bad shape fails here instead of half-landing.
const validated = ProjectConfigSchema.parse(next);
await updateProjectConfig(PROJECT_ID, validated);
console.log('written and validated.');
