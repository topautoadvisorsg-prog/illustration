/**
 * B&W EDUCATIONAL NONFICTION — production profile.
 *
 * The book class NO ONE TOLD ME THAT belongs to: text-first black-and-white
 * educational nonfiction for readers 9-14, printed at digest trim. Until this
 * profile existed the book conceptually ran under the Wildlands field-guide
 * default, which is wrong in every dimension that matters — it assumes an
 * AI-rendered illustrated page, art on every page, and species classification.
 *
 * ─── HOW THIS BOOK DIFFERS FROM THE FIELD GUIDE ───────────────────────────
 *   bodyRenderTrack   typeset, not ai-whole-page. Body pages are deterministic
 *                     vector type and cost nothing to produce.
 *   illustrations     budgeted, not every-page. Art is an exception chosen by a
 *                     human for a reason, so the paginator's
 *                     underfill-to-illustration recovery pass stays OFF.
 *   badges            off. Region/hazard/source seals are field-guide furniture.
 *   layout            governed by a versioned typeset layout standard.
 *
 * The illustration count for this book is not yet decided, and that is fine:
 * `targetCount` is advisory and surfaced to the operator, never enforced.
 */
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from '../typeset/layout-standards/educational-nonfiction-v1.js';
import type { BookProductionProfile, SubjectSelectionPolicy } from './types.js';

/**
 * What earns an illustration in a book like this. Guidance for the operator at
 * selection time and art direction — never an automated filter.
 */
const EDUCATIONAL_SUBJECT_SELECTION: SubjectSelectionPolicy = {
  principle:
    'An illustration earns its place only when a picture explains something words are labouring at, or gives a heavy chapter somewhere to breathe. Decoration is not a reason.',
  preferences: [
    'Prefer a diagram or labelled process over a decorative scene.',
    'Prefer the ordinary and specific over the idealised — this reader is checking whether he is normal.',
    'Prefer objects, gear and step sequences over depictions of bodies.',
    'Keep any figure non-identifying and age-appropriate; never a portrait of a real-looking child.',
  ],
  sensitiveSubjects: [
    'Anatomy: schematic and clinical only, never naturalistic, never titillating. If a diagram cannot be drawn plainly and respectfully, use words instead.',
    'Mental health chapters: no imagery that dramatises distress or self-harm.',
  ],
};

export const BW_EDUCATIONAL_NONFICTION_PROFILE: BookProductionProfile = {
  id: 'bw-educational-nonfiction',
  label: 'Educational Nonfiction — B&W Digest',
  bookType: 'EDUCATIONAL_NONFICTION',
  audienceBand: 'YOUNG_TEEN',

  // Clear-line B&W: reproduces well on uncoated stock at digest size.
  defaultStyleDnaId: 'bw-educational-clearline',

  /**
   * This cover is a designed object, not a painting of a place.
   *
   * The reader is a boy who would rather not be seen carrying a book about
   * puberty, and the front has to survive being shrunk to an Amazon thumbnail —
   * which rewards flat shapes, high contrast and a few large elements, and
   * punishes atmosphere and fine detail. The field guide's painterly wilderness
   * language produces the opposite of all of that.
   */
  coverArtLanguage: {
    atmosphere:
      'a designed graphic cover, not a painted scene: flat bold shapes, strong figure-ground contrast, ' +
      'generous empty space and a tightly limited palette. It must still read at Amazon-thumbnail size, ' +
      'so a few large elements rather than many small ones, and no fine texture or detail that disappears when scaled down',
    mood: 'confident and matter-of-fact; unembarrassing to be seen carrying; never clinical, never cute, never coy',
  },
  publishingStandardId: 'wildlands-v1.2',
  typesetLayoutStandardId: EDUCATIONAL_NONFICTION_TYPESET_V1.id,

  bodyRenderTrack: 'typeset',

  illustrationPolicy: {
    mode: 'budgeted',
    targetCount: 12,
    maxCount: 20,
    subjectSelection: EDUCATIONAL_SUBJECT_SELECTION,
  },

  badgesEnabled: false,

  /**
   * Classification is inert for this profile today.
   *
   * A typeset book does not route pages to layout templates, and a budgeted
   * book never guesses what to draw — `deriveImageSubject` returns null so the
   * handful of illustrations stay a human decision, exactly as the contract
   * describes. Breakdown does not yet support continuous-prose nonfiction (see
   * docs/OPEN_PRODUCTION_ISSUES.md); when it does, these hooks are where this
   * book class teaches it what its pages are.
   */
  classification: {
    inferCategory: () => undefined,
    inferContentType: () => 'REFERENCE_PAGE',
    chooseTemplate: () => 'LAYOUT_1_STANDARD',
    deriveImageSubject: () => null,
  },

  promptVocabulary: {
    // No bottom-anchor subject vocabulary: text pages are typeset, and the few
    // illustrations are standalone plates rather than text-bearing artwork.
    bottomAnchorSubjects: null,
    subjectPose: null,
    extraNegatives: [
      'no readable body text baked into the illustration',
      'no species labels, binomials, or field-guide furniture',
    ],
  },
};
