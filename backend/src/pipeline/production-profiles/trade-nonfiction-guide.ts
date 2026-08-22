/**
 * TRADE NONFICTION GUIDE — production profile.
 *
 * Adult trade nonfiction: a practical guide for a general adult reader, set as
 * real type at 6x9 and printed black-and-white inside a colour cover.
 *
 * ─── WHY THIS PROFILE EXISTS ──────────────────────────────────────────────
 * Both adult trade books built here so far ran under
 * `bw-educational-nonfiction`, because it was the only typeset profile. That
 * profile is NOT a generic text-book profile — it is the profile of one
 * specific book:
 *
 *   audienceBand        YOUNG_TEEN
 *   illustrationPolicy  budgeted, 12 plates, with a subject-selection policy
 *                       written around anatomy and mental-health chapters
 *   coverArtLanguage    "unembarrassing to be seen carrying", written for a boy
 *                       who would rather not be seen holding a book about
 *                       puberty
 *
 * None of that describes an adult travel guide, and the cover language in
 * particular is not inert: it is fed to the cover generator. A book resolving to
 * the wrong profile does not error — it quietly produces a different book, which
 * is the failure the profile registry exists to prevent and the same class of
 * mistake as a black-and-white book being told its ink was warm sepia.
 *
 * ─── ILLUSTRATIONS: NONE ──────────────────────────────────────────────────
 * `mode: 'none'`. 7 NATIONAL PARKS has zero images and needs zero. This is a
 * deliberate statement rather than an omission: a budgeted policy with a target
 * of zero still invites the question every time someone opens the project, and
 * the paginator's underfill-to-illustration recovery pass must stay off in a
 * book that has no artwork to recover into.
 */
import type { BookProductionProfile } from './types.js';

export const TRADE_NONFICTION_GUIDE_PROFILE: BookProductionProfile = {
  id: 'trade-nonfiction-guide',
  label: 'Trade Nonfiction Guide — 6x9 Adult',
  bookType: 'EDUCATIONAL_NONFICTION',
  audienceBand: 'ADULT',

  defaultStyleDnaId: 'bw-educational-clearline',

  /**
   * The interior is black-and-white for print economy. The COVER is not: KDP
   * prints every paperback cover in full colour regardless, and a cover left to
   * inherit the interior DNA generates in monochrome and quietly converts the
   * art direction's colour into tone.
   */
  /**
   * PHOTOGRAPHIC, not the flat graphic look.
   *
   * `graphic-trade-cover` states "NOT painted illustration, flat fills only, no
   * gradients, no photographic shading, LIGHT: None" — it is a deliberate flat
   * style and it directly contradicts the atmosphere this profile asks for. The
   * two were fighting inside one prompt, and the DNA wins, because it is
   * assembled after the art direction.
   *
   * `photographic-trade-cover` is the look the shipped DIRT RICH wrap was
   * generated on: a real scene, real directional light, real depth, running
   * continuously from back through spine to front.
   */
  coverStyleDnaId: 'photographic-trade-cover',

  /**
   * FULL COLOUR, cinematic, one cohesive scene.
   *
   * The interior is black-and-white for print economy; the cover is not, and
   * must not inherit that. KDP prints every paperback cover in full colour
   * regardless, and a monochrome wrap on a travel shelf reads as a manual.
   *
   * An earlier version of this block asked for a flat graphic cover on the
   * theory that atmosphere dies at thumbnail size. That was wrong for this
   * category: the covers that sell adult travel nonfiction are photographic or
   * painterly, and the discipline that makes them survive a thumbnail is
   * COMPOSITION — one subject, deep tonal separation, a quiet zone for the
   * title — not the absence of a picture.
   *
   * One scene, not a collage. Multiple parks are evoked through landscape
   * language and depth, never through seven stamps in a grid.
   */
  coverArtLanguage: {
    atmosphere:
      'one cohesive, cinematic full-colour landscape photograph or richly painted scene of dramatic ' +
      'American wilderness — sweeping canyon walls, granite cliffs, layered mountain ridges, pine ' +
      'forest, a trail or overlook — with real atmospheric depth from foreground to far distance and ' +
      'warm natural light near sunrise or the golden hour. One strong scene that evokes several ' +
      'iconic national parks through landform and depth, never a grid or collage of separate places. ' +
      'Deep tonal separation between the sky and the land so a large title can sit in the upper front ' +
      'panel on a quiet area and still read at Amazon-thumbnail size',
    mood:
      'premium, commercial adult travel nonfiction: adventurous but believable, sophisticated rather ' +
      'than touristic. It should say "I want to go there, and this book will help me do it right" — ' +
      'never a stock-photo brochure, never a coffee-table art book',
  },

  publishingStandardId: 'wildlands-v1.2',
  /**
   * The profile's DEFAULT, used only by a project that has not pinned one.
   * `trade-nonfiction-guide-typeset@1` is the plain adult-trade design; a book
   * with its own recurring components (7 NATIONAL PARKS boxes its NOBODY WARNED
   * ME sections and marks its safety paragraphs) pins a standard of its own,
   * and a project pin always beats this.
   */
  typesetLayoutStandardId: 'trade-nonfiction-guide-typeset@1',

  bodyRenderTrack: 'typeset',

  /**
   * A budget of ZERO, which is the honest way to say "no artwork" without
   * inventing a policy mode the rest of the pipeline does not understand.
   *
   * What matters mechanically is that the mode is not `every-page`: that is the
   * flag turning on the paginator's underfill-to-illustration recovery pass,
   * which in a book with no artwork would try to recover into nothing.
   */
  illustrationPolicy: {
    mode: 'budgeted',
    targetCount: 0,
    maxCount: 0,
  },

  badgesEnabled: false,

  /**
   * Inert, as it is for every typeset book: a typeset book does not route pages
   * to layout templates, and `deriveImageSubject` returning null keeps art a
   * human decision rather than something the pipeline guesses at.
   */
  classification: {
    inferCategory: () => undefined,
    inferContentType: () => 'REFERENCE_PAGE',
    chooseTemplate: () => 'LAYOUT_1_STANDARD',
    deriveImageSubject: () => null,
  },

  promptVocabulary: {
    bottomAnchorSubjects: null,
    subjectPose: null,
    extraNegatives: [
      'no readable body text baked into the illustration',
      'no species labels, binomials, or field-guide furniture',
    ],
  },
};
