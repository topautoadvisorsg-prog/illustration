/**
 * BOOK PRODUCTION PROFILE — the contract for "what kind of book is this?".
 *
 * One resolved object that answers every domain question the production engine
 * used to answer with hardcoded field-guide assumptions. Selected per project by
 * `ProjectConfig.productionProfileId` and resolved through `registry.ts`.
 *
 * ─── WHAT A PROFILE OWNS ──────────────────────────────────────────────────
 *   Book identity (type/audience), content CLASSIFICATION, which publishing
 *   standard and Style DNA to use, whether body pages are AI-rendered or
 *   typeset, how many illustrations the book gets, how an image subject is
 *   derived, and the domain vocabulary the image prompt may use.
 *
 * ─── WHAT A PROFILE DOES NOT OWN ──────────────────────────────────────────
 *   Pagination, capacity math, page geometry, render versioning, canonical
 *   selection, review routing, preflight, cover sync, assembly, export. Those
 *   are the mature downstream engine and are book-agnostic by construction.
 *   A profile must never reach into them.
 *
 * Adding a book type is a REGISTERED PROFILE, not a code change to the engine —
 * the same contract the Style DNA registry already uses for edition looks.
 */

import type { ContentType, LayoutTemplateId } from '@wildlands/shared';

/** Coarse product category. Drives operator-facing labels and profile defaults. */
export type BookType =
  | 'ILLUSTRATED_FIELD_GUIDE'
  | 'EDUCATIONAL_NONFICTION';

/** Reader age band. Distinct from the `audience` ENUM column, which is legacy. */
export type AudienceBand = 'ADULT' | 'YOUNG_TEEN' | 'MIDDLE_GRADE';

/**
 * How a normal reading page becomes a printed artifact.
 *
 *  - `ai-whole-page` — the generated image IS the page, manuscript text baked in
 *    by the image model (the Wildlands model). Every body page costs a render.
 *  - `typeset` — the page is deterministically typeset (Paged.js) and the text
 *    stays real, searchable vector text. Costs nothing. Illustration pages on a
 *    typeset book still route to the AI track individually.
 *
 * Both tracks write the SAME `whole_page_renders` rows, so approve /
 * select-for-book / preflight / assembly / export are identical downstream.
 */
export type BodyRenderTrack = 'ai-whole-page' | 'typeset';

/**
 * Illustration eligibility and density.
 *
 *  - `every-page` — every body page carries artwork (Wildlands). The paginator's
 *    underfill-to-illustration recovery pass is ACTIVE.
 *  - `budgeted` — illustrations are EXCEPTIONS, chosen deliberately because they
 *    improve explanation, pacing, comprehension, or engagement. A page is
 *    illustrated only if it was explicitly selected. The underfill recovery pass
 *    is OFF (it exists to eliminate whitespace by adding art, which is the wrong
 *    instinct for a text-first book).
 */
export type IllustrationPolicy =
  | { mode: 'every-page'; subjectSelection?: SubjectSelectionPolicy }
  | {
      mode: 'budgeted';
      /** Target number of illustration moments. Advisory: surfaced to the
       *  operator and to the budget preflight, never silently enforced. */
      targetCount: number;
      /** Soft ceiling before the supervisor raises a finding. */
      maxCount: number;
      subjectSelection?: SubjectSelectionPolicy;
    };

/**
 * SUBJECT-SELECTION POLICY — what an illustration should be OF.
 *
 * Deliberately separate from Style DNA, which owns only how the art LOOKS. The
 * same clear-line B&W look can serve a diagram, an object, or a figure; which of
 * those to draw is an editorial decision about the book, so it belongs to the
 * production profile.
 *
 * These are operator-facing guidance strings surfaced during illustration
 * selection and carried into art direction. They are not automated filters:
 * nothing here silently rejects a subject a human chose.
 */
export interface SubjectSelectionPolicy {
  /** One-line statement of what earns an illustration in this book. */
  principle: string;
  /** Preference rules applied when choosing between candidate framings. */
  preferences: readonly string[];
  /** Subject matter requiring explicit care, and the standard it must meet. */
  sensitiveSubjects?: readonly string[];
}

/**
 * Content classification. These four functions ARE the domain — everything else
 * in Stage 1.5 is generic plumbing. A profile supplies its own implementations;
 * the field-guide profile supplies the original ones unchanged.
 */
export interface ClassificationHooks {
  /** Optional coarse category tag (DANGER / EDIBLE / REFERENCE / …). */
  inferCategory(input: ClassificationInput): string | undefined;
  /** The page's content type — drives layout routing and image subject. */
  inferContentType(input: ClassificationInput, category?: string): ContentType;
  /** Provisional layout template for the entry's opener page. */
  chooseTemplate(contentType: ContentType, wordCount: number): LayoutTemplateId;
  /**
   * The depictable subject for image generation, or `null` when this profile
   * does not derive subjects automatically. A budgeted book returns null: its
   * handful of illustrations are chosen and art-directed by a human, never
   * guessed from keyword tables.
   */
  deriveImageSubject(input: ClassificationInput, contentType: ContentType): string | null;
}

/** Everything a classification hook is allowed to see. Deliberately narrow. */
export interface ClassificationInput {
  chapterNumber: number;
  chapterTitle: string;
  entryTitle: string;
  bodyMarkdown: string;
  wordCount: number;
  isChapterOpener: boolean;
  /** From config, for profiles that localize subjects (field guides). */
  region: string;
  /** Header binomial, when the profile extracts one. */
  scientificName?: string;
}

/**
 * Domain vocabulary injected into the image prompt's hard constraints. The
 * prompt STRUCTURE (layer architecture, text safety, guides-are-not-artwork) is
 * universal and stays in the assembler; only these strings are book-specific.
 * `null` on any field means "omit that constraint entirely for this profile".
 */
export interface PromptVocabulary {
  /** Examples/nouns for the BOTTOM ANCHOR text-protection illustration. */
  bottomAnchorSubjects: string | null;
  /** The SUBJECT POSE directive. */
  subjectPose: string | null;
  /** Extra profile-specific negatives appended to HARD NEGATIVES. */
  extraNegatives: readonly string[];
}

export interface BookProductionProfile {
  id: string;
  label: string;
  bookType: BookType;
  audienceBand: AudienceBand;
  /** Which Style DNA the edition defaults to (registry id). */
  defaultStyleDnaId: string;
  /** Which publishing standard governs typography/palette/ornament. */
  publishingStandardId: string;
  /**
   * Which typeset layout standard governs the printed page — geometry, type
   * scale, opener treatment, furniture, block styles. Versioned id, e.g.
   * `educational-nonfiction-typeset@1`; resolved through
   * `typeset/layout-standards/registry.ts`.
   *
   * Only meaningful when `bodyRenderTrack` is `typeset`. An AI whole-page book
   * gets its look from the publishing standard and Style DNA instead, so this
   * is optional rather than required.
   */
  typesetLayoutStandardId?: string;
  bodyRenderTrack: BodyRenderTrack;
  illustrationPolicy: IllustrationPolicy;
  classification: ClassificationHooks;
  promptVocabulary: PromptVocabulary;
  /** Subject-badge stamping (region/hazard/source seals) is field-guide furniture. */
  badgesEnabled: boolean;
}
