/**
 * BOOK PRODUCTION PROFILE — The Wildlands illustrated field guide.
 *
 * The platform's original and, until now, only implicit behaviour, written down
 * as an explicit profile. Every classification hook points at the SAME function
 * that ran before the registry existed (they now live in Stage 1.5 as exported
 * functions), so resolving this profile is byte-identical to the pre-registry
 * pipeline. That is the whole point: existing Wildlands volumes must not move.
 *
 * If you are tempted to change a value here to make a DIFFERENT kind of book
 * work — don't. Register a new profile.
 */

import {
  chooseManifestTemplate,
  imageSubjectFor,
  inferCategory,
  inferContentType,
} from '../stage-1.5-manifests/generate-manifests.js';
import { DEFAULT_STYLE_DNA_ID } from '../publishing-standard/style-dna.js';
import { FIELD_GUIDE_SUBJECT_SELECTION } from './subject-selection.js';
import type { BookProductionProfile } from './types.js';

export const WILDLANDS_FIELD_GUIDE_PROFILE: BookProductionProfile = {
  id: 'wildlands-field-guide',
  label: 'The Wildlands — Illustrated Field Guide',
  bookType: 'ILLUSTRATED_FIELD_GUIDE',
  audienceBand: 'ADULT',
  defaultStyleDnaId: DEFAULT_STYLE_DNA_ID, // cinematic-naturalist-color
  publishingStandardId: 'wildlands-v1.2',

  // The generated image IS the page: illustration and manuscript text baked in
  // together by the image model. Every body page costs one render.
  bodyRenderTrack: 'ai-whole-page',

  // CORE PRODUCT RULE for this profile: every page has art behind the text.
  // Keeps the paginator's underfill-to-illustration recovery pass active.
  illustrationPolicy: {
    mode: 'every-page',
    subjectSelection: FIELD_GUIDE_SUBJECT_SELECTION,
  },

  // Region / hazard / source seals stamped by print-prep.
  badgesEnabled: true,

  // Each hook is an arrow WRAPPER, not a direct function reference, and that is
  // load-bearing. Stage 1.5 imports the registry, the registry imports this
  // file, and this file imports Stage 1.5 — an ESM cycle. A direct reference is
  // captured while this `const` is evaluated, which can happen before Stage 1.5
  // has finished initialising, yielding `undefined` at call time. Wrapping
  // defers the binding lookup until the hook is actually called, by which point
  // both modules are fully evaluated.
  //
  // Phase 2 removes the cycle properly by relocating the field-guide
  // classification into this directory (natural to do while authoring the
  // second profile). Until then, keep these wrappers.
  classification: {
    inferCategory: (input) => inferCategory(input),
    inferContentType: (input, category) => inferContentType(input, category),
    chooseTemplate: (contentType, wordCount) => chooseManifestTemplate(contentType, wordCount),
    deriveImageSubject: (input, contentType) => imageSubjectFor(input, contentType),
  },

  promptVocabulary: {
    bottomAnchorSubjects:
      "the species, its habitat, its tracks and sign, foliage, or terrain, whatever fits the entry — you choose the specific element and compose it naturally; it is subject illustration, NOT a decorative swag, ornament band, border, or frame",
    subjectPose:
      "depict the page's main subject in a strong, characterful pose that feels alive and grounded in its real habitat — NEVER a stiff museum specimen floating on blank ground. Choose whichever best portrays THIS subject: either (a) a dignified field-guide 'model' pose that clearly shows its key identifying features, OR (b) a natural, characteristic ACTION or behaviour in its element — moving, feeding, hunting, alert, at the water, interacting with its habitat (e.g. a grizzly turning at a river, an eagle on the stoop, a marten mid-branch). Keep it accurate to the species and keep the subject and its defining features (face, head, diagnostic marks) INSIDE the trim-safe area as required above. A calm, dignified portrait is welcome; a lifeless specimen is not.",
    extraNegatives: [],
  },
};
