/**
 * ESCALATION — deciding, from evidence, when a small edit stopped being small.
 *
 * ─── WHY THIS IS CODE AND NOT JUDGEMENT ──────────────────────────────────────
 * The failure this prevents is not "missed a defect". It is the opposite: a
 * two-sentence correction that expanded into a whole-book audit because nothing
 * said where the edge of the job was, so every possible worry got checked.
 *
 * A correction is on the fast path until one of these fires. Each one is a
 * concrete measurement against the frozen artifact, so "is this still a small
 * change?" has an answer instead of an opinion. If none fires, the job is done
 * and re-proving the rest of the book proves nothing that was not already true.
 *
 * The levels map to the workflow in docs/CORRECTION-FAST-PATH.md:
 *   L1  text-only        nothing moved but glyphs on the edited pages
 *   L2  local layout     a page's line count moved, pagination did not
 *   L3  structural       pagination, openers, references or illustrations moved
 *   L4  platform defect  the book cannot be verified because the tooling broke
 */
import type { ModelPage, PageModel } from '../page-qa/page-model.js';
import type { RoleAssignment } from '../page-qa/page-roles.js';
import type { FrozenRecipe } from './frozen-recipe.js';

export type Level = 1 | 2 | 3 | 4;

export interface Trigger {
  code: string;
  level: Level;
  detail: string;
}

export interface ChangeAssessment {
  level: Level;
  /** Pages whose text differs from the frozen artifact. */
  changedPages: number[];
  /** Pages whose body-line COUNT differs — text reflowed within the page. */
  reflowedPages: number[];
  triggers: Trigger[];
  /** True when the change is confined to the pages the correction targeted. */
  confined: boolean;
  summary: string;
}

const normalise = (p: ModelPage): string => p.lines.map((l) => l.text).join('').replace(/\s+/g, '');

/** Page targets like `p. 64`, plus the three-in-this-book `p. 117, 124` form. */
export function pageTargets(text: string): { expressions: number; targets: number } {
  const expressions = (text.match(/p\.\s?\d{1,3}/g) ?? []).length;
  const extra = (text.match(/p\.\s?\d{1,3},\s?\d{1,3}/g) ?? []).length;
  return { expressions, targets: expressions + extra };
}

export interface AssessInput {
  recipe: FrozenRecipe;
  frozen: PageModel;
  rebuilt: PageModel;
  /** Pages the correction was expected to touch. Empty means "unknown". */
  expectedPages?: number[];
  frozenRoles?: RoleAssignment[];
  rebuiltRoles?: RoleAssignment[];
  /** Stamped illustrations from the rebuild, to compare against the record. */
  rebuiltIllustrations?: { blockId: string; page: number }[];
  orphanedIllustrations?: { blockId: string; reason: string }[];
  frozenManuscript?: string;
  correctedManuscript?: string;
  /** Result of checkRecipeIntegrity — a changed renderer is structural. */
  engineMatches?: boolean;
}

/**
 * Compare a rebuild against the frozen artifact and return the smallest level
 * the evidence supports.
 *
 * Deliberately returns an assessment rather than throwing. A caller running a
 * correction wants to be told "this went structural, here is why", not to catch
 * an exception and lose the detail.
 */
export function assessChange(input: AssessInput): ChangeAssessment {
  const { recipe, frozen, rebuilt, expectedPages = [] } = input;
  const triggers: Trigger[] = [];

  // ── L3: page count. Nothing else matters if the book got longer or shorter.
  if (rebuilt.pageCount !== frozen.pageCount) {
    triggers.push({
      code: 'PAGE_COUNT_CHANGED',
      level: 3,
      detail:
        `${frozen.pageCount} -> ${rebuilt.pageCount} pages. Every page target after the ` +
        `insertion point is suspect, and the cover spine is computed from page count.`,
    });
  }
  if (rebuilt.pageCount !== recipe.pageCount) {
    triggers.push({
      code: 'PAGE_COUNT_OFF_RECIPE',
      level: 3,
      detail: `Rebuild is ${rebuilt.pageCount}pp; the freeze record says ${recipe.pageCount}pp.`,
    });
  }

  // ── which pages moved, and how far
  const n = Math.min(frozen.pageCount, rebuilt.pageCount);
  const changedPages: number[] = [];
  const reflowedPages: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = frozen.pages[i]!;
    const b = rebuilt.pages[i]!;
    if (normalise(a) !== normalise(b)) changedPages.push(i + 1);
    if (a.body.length !== b.body.length) reflowedPages.push(i + 1);
  }

  const unexpected = expectedPages.length
    ? changedPages.filter((p) => !expectedPages.includes(p))
    : [];
  if (unexpected.length) {
    triggers.push({
      code: 'UNEXPECTED_PAGE_DIFF',
      level: 3,
      detail:
        `Pages changed outside the edited region: ${unexpected.join(', ')}. ` +
        `A local correction that moves text elsewhere is not local.`,
    });
  }

  // ── L2: reflow inside a page is fine; it is only a signal, not a failure.
  const reflowOutsideChanged = reflowedPages.filter((p) => !changedPages.includes(p));
  if (reflowOutsideChanged.length) {
    triggers.push({
      code: 'REFLOW_WITHOUT_TEXT_CHANGE',
      level: 3,
      detail:
        `Pages ${reflowOutsideChanged.join(', ')} have the same text but a different line ` +
        `count. Something changed the way the page sets, which is not what a text edit does.`,
    });
  }

  // ── L3: chapter openers are the pagination skeleton.
  if (input.frozenRoles && input.rebuiltRoles) {
    const key = (r: RoleAssignment[]) =>
      r.filter((x) => x.role === 'CHAPTER_OPENER').map((x) => x.page).join(',');
    if (key(input.frozenRoles) !== key(input.rebuiltRoles)) {
      triggers.push({
        code: 'CHAPTER_OPENER_MOVED',
        level: 3,
        detail: `Chapter opener pages moved: ${key(input.frozenRoles)} -> ${key(input.rebuiltRoles)}.`,
      });
    }
  }

  // ── L3: illustrations are anchored to blocks; a moved anchor is structural.
  if (input.orphanedIllustrations?.length) {
    triggers.push({
      code: 'ILLUSTRATION_ORPHANED',
      level: 3,
      detail: input.orphanedIllustrations.map((o) => `${o.blockId}: ${o.reason}`).join(' | '),
    });
  }
  if (input.rebuiltIllustrations && recipe.illustrations.length) {
    if (input.rebuiltIllustrations.length !== recipe.illustrations.length) {
      triggers.push({
        code: 'ILLUSTRATION_COUNT_CHANGED',
        level: 3,
        detail: `${recipe.illustrations.length} frozen -> ${input.rebuiltIllustrations.length} stamped.`,
      });
    }
    const frozenPage = new Map(recipe.illustrations.map((i) => [i.blockId, i.page]));
    const moved = input.rebuiltIllustrations.filter(
      (i) => frozenPage.has(i.blockId) && frozenPage.get(i.blockId) !== i.page,
    );
    if (moved.length) {
      triggers.push({
        code: 'ILLUSTRATION_MOVED',
        level: 3,
        detail: moved
          .map((i) => `${i.blockId} p${frozenPage.get(i.blockId)} -> p${i.page}`)
          .join(', '),
      });
    }
  }

  // ── L3: a reference target count change means the index may now lie.
  if (input.frozenManuscript && input.correctedManuscript) {
    const a = pageTargets(input.frozenManuscript);
    const b = pageTargets(input.correctedManuscript);
    if (a.targets !== b.targets) {
      triggers.push({
        code: 'REFERENCE_TARGET_COUNT_CHANGED',
        level: 3,
        detail: `${a.targets} -> ${b.targets} page targets. Every one of them needs re-resolving.`,
      });
    }
  }

  // ── L3: the renderer itself moved under the book.
  if (input.engineMatches === false) {
    triggers.push({
      code: 'ENGINE_FINGERPRINT_CHANGED',
      level: 3,
      detail:
        `Renderer sources differ from the freeze. A diff against this rebuild measures the ` +
        `renderer change as well as the correction, and cannot separate them.`,
    });
  }

  const level: Level = triggers.length
    ? (Math.max(...triggers.map((t) => t.level)) as Level)
    : reflowedPages.length
      ? 2
      : 1;

  const confined = !unexpected.length && changedPages.length > 0;
  const summary = triggers.length
    ? `LEVEL ${level} — ${triggers.map((t) => t.code).join(', ')}`
    : `LEVEL ${level} — ${changedPages.length} page(s) changed${
        reflowedPages.length ? `, ${reflowedPages.length} reflowed` : ''
      }, nothing structural moved`;

  return { level, changedPages, reflowedPages, triggers, confined, summary };
}
