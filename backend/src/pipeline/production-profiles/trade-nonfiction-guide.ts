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
  coverStyleDnaId: 'graphic-trade-cover',

  /**
   * A designed graphic cover, not a painting of a place.
   *
   * A travel guide competes as a thumbnail in a category full of photographs of
   * the same seven landscapes. Flat shapes and a tight palette survive that
   * scale; an atmospheric painted vista becomes brown mush at 120 pixels and is
   * indistinguishable from every other listing.
   */
  coverArtLanguage: {
    atmosphere:
      'a designed graphic cover rather than a photograph or a painted vista: flat bold shapes, strong ' +
      'figure-ground contrast, generous empty space and a tightly limited palette. It must read at ' +
      'Amazon-thumbnail size, so a few large elements rather than many small ones, and no fine texture ' +
      'or atmospheric detail that disappears when scaled down',
    mood: 'confident, plain-spoken and practical; a guide written by someone who has been there, never a brochure',
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
