/**
 * Agent contracts for The Wildlands pipeline.
 *
 * These are NOT chat UI prompts. They are backend-owned behavior contracts that
 * describe each role's mission, expertise, hard rules, and required outputs.
 *
 * HONESTY NOTE (read before trusting the roster):
 * Most of these roles are enforced by DETERMINISTIC code, not by a running LLM
 * "agent". Only two contracts (`OPERATOR_ADVISER`, `STAGE_REVIEWER`) are live
 * LLM calls, and both are text-only, read-only advisers. The `runtime`,
 * `usesTools`, and `usesVision` flags on each contract state exactly what runs.
 *
 * PIXEL RULE (non-negotiable): no agent reads image pixels. Review and reuse
 * reason over METADATA only — layout type, coverage %, placement, subject,
 * prompt + hash, dimensions/DPI, status. Vision calls are banned to control cost.
 */

export type WildlandsAgentId =
  | 'MANUSCRIPT_ANALYST'
  | 'PAGE_PLANNER'
  | 'LAYOUT_SELECTOR'
  | 'ART_BRIEF_DIRECTOR'
  | 'PROMPT_ASSEMBLER'
  | 'COVER_ART_DIRECTOR'
  | 'TEXT_FIT_QA'
  | 'IMAGE_QA'
  | 'OPERATOR_ADVISER'
  | 'STAGE_REVIEWER';

/**
 * How the role actually runs today:
 * - `advisory-llm`  — a real Claude call; text-only; advises, cannot act.
 * - `deterministic` — enforced by code (parsing/planning/rendering); no LLM.
 * - `planned`       — described here but NOT implemented as a runtime step yet.
 */
export type AgentRuntime = 'advisory-llm' | 'deterministic' | 'planned';

export interface WildlandsAgentContract {
  id: WildlandsAgentId;
  name: string;
  mission: string;
  expertFrame: string;
  hardRules: string[];
  requiredInputs: string[];
  requiredOutputs: string[];
  researchDirectives: string[];
  /** Truthful runtime classification — what actually executes. */
  runtime: AgentRuntime;
  /** Whether the role can call tools / take actions. All current roles: false. */
  usesTools: boolean;
  /** Whether the role reads image pixels. Must stay false (pixel rule). */
  usesVision: boolean;
  /** Plain-English statement of what really happens, so the roster never oversells. */
  realityNote: string;
}

export const WILDLANDS_AGENT_CONTRACTS: Record<WildlandsAgentId, WildlandsAgentContract> = {
  MANUSCRIPT_ANALYST: {
    id: 'MANUSCRIPT_ANALYST',
    name: 'Manuscript Analyst',
    mission: 'Parse the uploaded manuscript into deterministic chapters, entries, sections, source positions, and word counts before any LLM enrichment.',
    expertFrame:
      'Act like a senior field-guide developmental editor and technical manuscript engineer. Your job is structural truth, not creative rewriting.',
    hardRules: [
      'Never invent chapters, entries, or sections.',
      'Never rewrite manuscript text during structural analysis.',
      'Flag malformed heading hierarchy before downstream planning.',
      'Treat the uploaded manuscript as the canonical source of truth.',
    ],
    requiredInputs: ['Raw Markdown manuscript', 'Project ID', 'Filename'],
    requiredOutputs: ['Chapter outline', 'Entry outline', 'Section outline', 'Word counts', 'Source line/offset positions', 'Structural warnings'],
    researchDirectives: [
      'Use deterministic parsing first; use LLM enrichment only after local structure is known.',
      'Prefer source offsets and hashes over fuzzy text matching for auditability.',
    ],
    runtime: 'deterministic',
    usesTools: false,
    usesVision: false,
    realityNote: 'Implemented as deterministic Markdown parsing (stage-1 parse-manuscript-outline.ts). No LLM call runs under this name today.',
  },
  PAGE_PLANNER: {
    id: 'PAGE_PLANNER',
    name: 'Page Planner',
    mission: 'Convert manuscript entries into page-level production plans with word count, content classification, layout intent, and page-planning reason codes.',
    expertFrame:
      'Act like a veteran illustrated field-guide book planner, production editor, and page-flow strategist with 30 years of print layout experience.',
    hardRules: [
      'Do not choose layouts by vibes; use word count, content signals, brand policy, and layout capacity metadata.',
      'Do not spend image-generation budget before text-fit preview is approved.',
      'Flag pages likely to overflow instead of silently forcing them into a cramped layout.',
      'Preserve brand typography defaults unless an approved layout capacity override exists.',
    ],
    requiredInputs: ['Page manifest', 'Project config', 'Layout prompt assets', 'Brand typography policy'],
    requiredOutputs: ['Word count', 'Content classification signals', 'Layout template', 'Reason codes', 'Typography recommendation', 'Text-fit status'],
    researchDirectives: [
      'KDP print readiness depends on trim, bleed, margins, and keeping content inside safe zones.',
      'Use measured layout capacity ranges; do not assume a universal body font size for every field-guide page.',
    ],
    runtime: 'deterministic',
    usesTools: false,
    usesVision: false,
    realityNote: 'Implemented as deterministic planning (stage-2 plan-pages.ts). It references this contract only to label reason codes.',
  },
  LAYOUT_SELECTOR: {
    id: 'LAYOUT_SELECTOR',
    name: 'Layout Selector',
    mission: 'Select one of the 16 Wildlands layout templates and attach the matching mockup/prompt asset.',
    expertFrame:
      'Act like a professional art director and book-layout specialist for premium full-color naturalist guides.',
    hardRules: [
      'A layout template is only production-ready when its mockup, text area, art slot, prompt template, and capacity metadata stay together.',
      'If capacity status is not approved, report the risk instead of pretending the layout is proven.',
      'Use danger, comparison, diagnostic, tall-subject, short-text, and long-text signals before the default layout.',
    ],
    requiredInputs: ['Page word count', 'Content signals', 'Layout prompt assets', 'Layout capacity status'],
    requiredOutputs: ['Selected layout template', 'Layout reference label', 'Capacity range', 'Reason codes', 'Text-fit risk notes'],
    researchDirectives: [
      'Check layout choices against the approved 16-layout reference set.',
      'Keep all important text within safe margins; image slots may bleed only when the output profile allows it.',
    ],
    runtime: 'deterministic',
    usesTools: false,
    usesVision: false,
    realityNote: 'Folded into deterministic page planning + layout profiles. No separate LLM agent runs.',
  },
  ART_BRIEF_DIRECTOR: {
    id: 'ART_BRIEF_DIRECTOR',
    name: 'Art Brief Director',
    mission: 'Translate an approved layout into exact image-slot production requirements before image generation.',
    expertFrame:
      'Act like a senior art director and print production designer who turns layout decisions into precise illustration briefs with slot geometry, crop safety, bleed safety, and overlay-safe negative space.',
    hardRules: [
      'Do not generate images or rewrite manuscript text.',
      'Always specify image percentage, text percentage, placement, slot dimensions in inches, minimum 300-DPI pixel size, and crop/bleed padding.',
      'For text-heavy pages, preserve a small illustration zone such as corner art, edge art, specimen detail, track mark, pine bough, or marginal naturalist decoration.',
      'For chapter openers and covers, reserve calm negative space for layout-typeset titles; the image model must still render no readable text.',
    ],
    requiredInputs: ['Approved layout template', 'Page geometry', 'Typography settings', 'Page subject', 'Body text context'],
    requiredOutputs: ['Art slot dimensions', '300-DPI pixel target', 'Bleed/crop guidance', 'Overlay-safe area instruction', 'Image-generation composition brief'],
    researchDirectives: [
      'Treat KDP trim, bleed, and safe areas as physical production constraints.',
      'Size source art larger than the final slot so final placement can crop gracefully.',
    ],
    runtime: 'deterministic',
    usesTools: false,
    usesVision: false,
    realityNote: 'Enforced by deterministic layout geometry + image-shape hints + prompt assembly. No separate runtime agent.',
  },
  PROMPT_ASSEMBLER: {
    id: 'PROMPT_ASSEMBLER',
    name: 'Prompt Assembler',
    mission: 'Fill the selected layout prompt template with subject, scientific details, and composition notes for image-only generation.',
    expertFrame:
      'Act like a scientific illustrator prompt engineer who understands naturalist accuracy, composition, and production constraints.',
    hardRules: [
      'Never ask the image model to render page text, labels, captions, titles, page numbers, or typography.',
      'Fail if required placeholders remain after prompt assembly.',
      'Fail if subject or scientific details are empty.',
      'Hash every final prompt for auditability and idempotency.',
    ],
    requiredInputs: ['Selected layout asset', 'Page manifest', 'Scientific details', 'Image subject', 'Composition notes'],
    requiredOutputs: ['Final image prompt', 'Prompt hash', 'Placeholder validation status', 'Prompt warnings'],
    researchDirectives: [
      'Favor literal subject details over generic style language.',
      'Keep layout and typography instructions out of the image prompt; Stage 6 owns page composition.',
    ],
    runtime: 'deterministic',
    usesTools: false,
    usesVision: false,
    realityNote: 'Implemented as deterministic prompt templating + SHA-256 hashing in stages 2/3. No LLM call.',
  },
  COVER_ART_DIRECTOR: {
    id: 'COVER_ART_DIRECTOR',
    name: 'Cover Art Director',
    mission: 'Design front-cover/full-wrap art direction where the illustration is full-bleed and title/author typography is overlaid by the layout engine.',
    expertFrame:
      'Act like a premium natural history book cover designer, typographer, and prepress lead for collector-grade illustrated field guides.',
    hardRules: [
      'The cover image model renders artwork only; title, subtitle, author, spine, and back-cover copy are typeset by the layout engine.',
      'Reserve strong title-safe negative space where typography will sit on top of the illustration.',
      'Use full-bleed composition with extra edge detail for trim/crop safety.',
      'Typography must be readable, brand-matched, high contrast, and never baked into the generated image.',
    ],
    requiredInputs: ['Book title/subtitle', 'Author name', 'Cover format', 'Trim and bleed', 'Brand typography', 'Master Style DNA'],
    requiredOutputs: ['Front-cover composition brief', 'Title-safe zone', 'Full-bleed art requirements', 'Typography overlay plan', 'Prepress constraints'],
    researchDirectives: [
      'Full cover production requires front, spine, and back geometry once page count and paper stock are known.',
      'For the current front-cover phase, lock visual direction and title-safe composition before full-wrap spine math.',
    ],
    runtime: 'deterministic',
    usesTools: false,
    usesVision: false,
    realityNote: 'Cover is rendered deterministically (typographic overlay + full-bleed art slot, spine sized from page count). No separate LLM.',
  },
  TEXT_FIT_QA: {
    id: 'TEXT_FIT_QA',
    name: 'Text-Fit QA',
    mission: 'Render or inspect text-fit previews before image spend and block pages that overflow, overlap, or feel cramped.',
    expertFrame:
      'Act like a print prepress technician and typography QA lead responsible for preventing KDP rejection and bad proofs.',
    hardRules: [
      'Do not approve a page if text overlaps artwork or leaves the safe area.',
      'Do not shrink text below the approved brand/layout range without an explicit warning.',
      'Require rerouting to a text-heavy or continuation layout when overflow is detected.',
    ],
    requiredInputs: ['Page text', 'Selected layout mockup', 'Typography recommendation', 'Trim/bleed/margin profile'],
    requiredOutputs: ['Fit status', 'Overflow notes', 'Typography notes', 'Required layout retry if any'],
    researchDirectives: [
      'Validate against trim size, bleed, and safe margin requirements before export.',
      'Prefer layout retry over unreadable type.',
    ],
    runtime: 'deterministic',
    usesTools: false,
    usesVision: false,
    realityNote: 'Implemented as deterministic text-fit measurement (text-fit.ts / text-fit-preview.ts). No LLM call.',
  },
  IMAGE_QA: {
    id: 'IMAGE_QA',
    name: 'Image QA',
    mission: 'Judge generated art for print readiness from METADATA ONLY — approved prompt + hash, layout type, coverage, dimensions, and DPI. Never by inspecting pixels.',
    expertFrame:
      'Act like a prepress image technician who validates production parameters (prompt match by hash, size, DPI, layout fit) rather than aesthetics, to keep token cost at zero for review.',
    hardRules: [
      'PIXEL RULE: never read or send image pixels to any model. No vision calls. Evaluate from metadata only.',
      'Check the generated image was produced from the approved prompt hash for that page.',
      'Block final placement until dimensions, DPI, layout shape match, and an approved version are locked.',
      'Approve/reject of the actual artwork is a human operator decision; this role only reports metadata readiness.',
    ],
    requiredInputs: ['Approved prompt + prompt hash', 'Layout type + coverage %', 'Generated dimensions + DPI', 'Image shape vs layout shape', 'Page status'],
    requiredOutputs: ['Metadata-readiness status', 'Mismatch reasons (prompt hash / size / DPI / shape)', 'Regeneration notes', 'Locked image version metadata'],
    researchDirectives: [
      'Compare prompt hash, size, DPI, and layout-shape fit — not aesthetics by pixel inspection.',
      'Target 300 DPI for full-color KDP interior assets unless the output profile changes.',
    ],
    runtime: 'planned',
    usesTools: false,
    usesVision: false,
    realityNote: 'No automated agent runs today; image approve/reject is a manual operator action. If built, it MUST stay metadata-only per the hard rules above.',
  },
  OPERATOR_ADVISER: {
    id: 'OPERATOR_ADVISER',
    name: 'Operator Adviser (live chat)',
    mission: 'Answer the operator\'s "what is wrong / what is next" questions about the current project, in plain language.',
    expertFrame:
      'Act like a calm production manager who reads the project state and explains the next concrete button to click. No jargon, no filler.',
    hardRules: [
      'Advise and explain only — cannot click buttons or run actions; always name the button the operator should click.',
      'Never claim the book is done/ready to export unless every page is APPROVED/PRINT_READY and the project is EXPORTED.',
      'Reason over project METADATA only (page keys, layouts, statuses, log). Never request or read image pixels.',
      'Be concise and honest about how much work remains.',
    ],
    requiredInputs: ['Project state summary (title, status, chapters, per-page layout + status)', 'Recent activity log', 'Operator message'],
    requiredOutputs: ['Plain-language guidance', 'The specific next button to click'],
    researchDirectives: ['Use the deterministic pipeline order as the source of truth for "what is next".'],
    runtime: 'advisory-llm',
    usesTools: false,
    usesVision: false,
    realityNote: 'LIVE: Claude text call (callChat), temperature 0.3, capped ~700 tokens. Read-only. This is one of the only two LLM agents that actually run.',
  },
  STAGE_REVIEWER: {
    id: 'STAGE_REVIEWER',
    name: 'Stage Reviewer (live review)',
    mission: 'Give a strict PASS / NEEDS WORK verdict on a single pipeline step (breakdown, plan, text-fit, images, render) so the operator does not inspect every page by hand.',
    expertFrame:
      'Act like a meticulous book-production QA reviewer: do not invent problems, do not rubber-stamp.',
    hardRules: [
      'Follow the per-stage rubric exactly and answer in the fixed VERDICT / WHAT\'S GOOD / ISSUES / FIX NEXT format.',
      'Reason over project METADATA only (statuses, layouts, counts). Never read image pixels.',
      'Long entries spanning multiple pages are fine — not overflow.',
      'Report-only — cannot mutate the project.',
    ],
    requiredInputs: ['Stage name', 'Project state summary', 'Chapter/entry counts', 'Per-page layout + status'],
    requiredOutputs: ['VERDICT (PASS/NEEDS WORK)', "WHAT'S GOOD", 'ISSUES', 'FIX NEXT'],
    researchDirectives: ['Grade against the stage rubric, not aesthetics.'],
    runtime: 'advisory-llm',
    usesTools: false,
    usesVision: false,
    realityNote: 'LIVE: Claude text call (callChat), temperature 0, capped ~600 tokens. Read-only. The second of the two LLM agents that actually run.',
  },
};

export function getAgentContract(id: WildlandsAgentId): WildlandsAgentContract {
  return WILDLANDS_AGENT_CONTRACTS[id];
}
