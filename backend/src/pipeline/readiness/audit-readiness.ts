/**
 * READINESS AUDIT — the pre-spend gate.
 *
 * `docs/NEW_BOOK_PARITY_PLAN.md` diagnosed the pattern behind every new-book
 * defect this platform has hit: the engine was built around Series One's
 * manuscript, and each new book exposed a hardcoded Book-One assumption. Its
 * conclusion was that those assumptions must surface "automatically, before
 * spend, on every new book" — the difference between "the agent caught it" and
 * "the platform caught it". Layer 1 (regression tests) was built. This is the
 * Layer 2/3 audit that never was.
 *
 * Every check here is DETERMINISTIC and FREE. No model call, no image call, no
 * mutation. It answers one question: is this book set up correctly enough that
 * spending money on it is reasonable?
 *
 * A check may only FAIL on evidence. "I could not tell" is a WARN or N/A, never
 * a FAIL — a gate that cries wolf gets ignored, and an ignored gate is worse
 * than no gate.
 */
import { ProjectConfigSchema } from '@wildlands/shared';

import { listEntriesForProject } from '../../db/repositories/entries.repo.js';
import { listManifests, listPages } from '../../db/repositories/manifests.repo.js';
import { getProject, listProjects } from '../../db/repositories/projects.repo.js';
import { getProjectStorage } from '../../services/storage/project-storage.js';
import { isKnownProductionProfile, getProductionProfile, listProductionProfiles } from '../production-profiles/registry.js';
import { STYLE_DNA, listStyleDna } from '../publishing-standard/style-dna.js';
import { computeCoverDimensions } from '../stage-6-layout/render-html.js';
import { isKnownTypesetLayoutStandard, TYPESET_LAYOUT_STANDARDS } from '../typeset/layout-standards/registry.js';
import { resolveStandardId } from '../typeset/build-typeset-interior.js';
import { bundledFontCss } from '../typeset/font-assets.js';
import { auditManuscriptParse } from '../typeset/manuscript-parse-gate.js';

export type ReadinessStatus = 'PASS' | 'WARN' | 'FAIL' | 'NA';

export interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  /** What was actually measured. Never a restatement of the label. */
  detail: string;
  /** What to do about it. Present whenever status is WARN or FAIL. */
  fix?: string;
}

export interface ReadinessReport {
  projectId: string;
  title: string;
  /** BLOCKED when any check FAILed — do not spend. */
  status: 'READY' | 'WARNING' | 'BLOCKED';
  checks: ReadinessCheck[];
  nextAction: string;
  generatedAt: string;
}

const pass = (id: string, label: string, detail: string): ReadinessCheck => ({ id, label, status: 'PASS', detail });
const fail = (id: string, label: string, detail: string, fix: string): ReadinessCheck => ({ id, label, status: 'FAIL', detail, fix });
const warn = (id: string, label: string, detail: string, fix: string): ReadinessCheck => ({ id, label, status: 'WARN', detail, fix });
const na = (id: string, label: string, detail: string): ReadinessCheck => ({ id, label, status: 'NA', detail });

/**
 * Count numbered entry headings the way the breakdown parser sees them.
 *
 * Kept deliberately loose about the heading LEVEL and the punctuation after the
 * number: the parser bug that mis-grouped the Canadian Rockies catalog came from
 * keying on New England's exact section names, and a checker with the same
 * blind spot would have missed it too.
 */
export function countNumberedEntries(markdown: string): number {
  return (markdown.match(/^#{2,4}\s+\d+[.)]\s+\S/gm) ?? []).length;
}

/** Region strings belonging to OTHER books, for the leak check. */
function otherBookRegions(rows: Array<{ id: string; subtitle: string | null }>, selfId: string): string[] {
  return rows
    .filter((r) => r.id !== selfId)
    .map((r) => (r.subtitle ?? '').trim())
    .filter((s) => s.length >= 6);
}

export async function auditReadiness(projectId: string): Promise<ReadinessReport> {
  const project = await getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);
  // PARSE, do not cast. `config` is raw jsonb, and the schema supplies defaults
  // for `publishing`, `typography`, `trimSize` and more. Casting skips all of
  // them, so a config that relies on a default would be audited differently
  // from how the rest of the platform reads it — the gate would answer about a
  // book that does not exist. Every other route parses; this one now does too.
  const config = ProjectConfigSchema.parse(project.config);
  const checks: ReadinessCheck[] = [];

  // ── 1. Source material ────────────────────────────────────────────────────
  if (!project.manuscriptPath || !project.manuscriptSha256) {
    checks.push(fail('manuscript', 'Manuscript', 'No manuscript on file.', 'Upload the manuscript (Step 2, or POST /api/books/intake).'));
  } else {
    checks.push(pass('manuscript', 'Manuscript', `on file, sha256 ${project.manuscriptSha256.slice(0, 8).toUpperCase()}`));
  }

  // The canonical artifact is what an author freezes and quotes. Its absence is
  // a provenance gap, not a production blocker.
  if (project.manuscriptPath && !project.canonicalManuscriptSha256) {
    checks.push(
      warn(
        'canonical-provenance',
        'Canonical source',
        'The working manuscript exists but no canonical original was retained.',
        'Re-upload through the intake path so the uploaded bytes are stored verbatim alongside the normalized copy.',
      ),
    );
  } else if (project.canonicalManuscriptSha256) {
    checks.push(pass('canonical-provenance', 'Canonical source', `retained, sha256 ${project.canonicalManuscriptSha256.slice(0, 8).toUpperCase()}`));
  }

  // ── 2. Registries must RESOLVE, not silently fall back ────────────────────
  // getProductionProfile() falls back to the field guide by design, so an
  // unknown id does not throw — it quietly produces a different book. That is
  // exactly the failure this gate exists to catch.
  const profileId = config.productionProfileId;
  if (profileId && !isKnownProductionProfile(profileId)) {
    checks.push(
      fail(
        'profile',
        'Production profile',
        `"${profileId}" is not a registered profile; it would silently fall back to the field guide.`,
        `Set productionProfileId to one of: ${listProductionProfiles().map((p) => p.id).join(', ')}.`,
      ),
    );
  } else {
    const profile = getProductionProfile(profileId);
    checks.push(pass('profile', 'Production profile', `${profile.id} (${profile.label})`));
  }

  const standardId = resolveStandardId(config);
  if (!isKnownTypesetLayoutStandard(standardId)) {
    checks.push(
      fail(
        'layout-standard',
        'Typeset layout standard',
        `"${standardId}" is not registered; the typeset build would throw at render time.`,
        `Set typesetLayoutStandardId to one of: ${Object.keys(TYPESET_LAYOUT_STANDARDS).join(', ')}.`,
      ),
    );
  } else {
    checks.push(pass('layout-standard', 'Typeset layout standard', standardId));
  }

  // Style DNA is named by the PROFILE (interior + cover separately), not by the
  // project config. `getStyleDna` falls back to the colour field-guide look on
  // an unknown id, which is how a black-and-white book got told its ink was
  // warm sepia — so an unresolvable id is a real defect, not a typo.
  const profileForDna = getProductionProfile(profileId);
  const dnaIds = [
    ['interior', profileForDna.defaultStyleDnaId],
    ['cover', profileForDna.coverStyleDnaId ?? profileForDna.defaultStyleDnaId],
  ] as const;
  const unknownDna = dnaIds.filter(([, id]) => id && !Object.hasOwn(STYLE_DNA, id));
  if (unknownDna.length > 0) {
    checks.push(
      fail(
        'style-dna',
        'Style DNA',
        `${unknownDna.map(([role, id]) => `${role} DNA "${id}"`).join(' and ')} not registered; would silently fall back to the colour field-guide look.`,
        `Registered Style DNA: ${listStyleDna().map((d) => d.id).join(', ')}.`,
      ),
    );
  } else {
    checks.push(
      pass('style-dna', 'Style DNA', dnaIds.map(([role, id]) => `${role} ${id}`).join(', ')),
    );
  }

  // ── 3. Pipeline state ─────────────────────────────────────────────────────
  const [manifestRows, pageRows, entryRows] = await Promise.all([
    listManifests(projectId),
    listPages(projectId),
    listEntriesForProject(projectId),
  ]);

  // Breakdown and pagination belong to the AI whole-page track. A typeset book
  // goes manuscript → Paged.js and legitimately has neither: NO ONE TOLD ME
  // THAT shipped 156 printed pages with zero manifest rows. Demanding them of
  // every book made this gate report BLOCKED on a book that was already at the
  // printer, which is precisely the cry-wolf failure that gets a gate ignored.
  const track = getProductionProfile(profileId).bodyRenderTrack;

  if (track === 'typeset') {
    checks.push(
      na(
        'breakdown',
        'Breakdown',
        'Not used by this book: the typeset track goes from manuscript straight to the typesetter, so there are no manifests to build.',
      ),
    );
    checks.push(
      na(
        'pagination',
        'Pagination',
        'Not used by this book: page breaks come from the typesetter itself, not from the planner.',
      ),
    );
  } else {
    if (manifestRows.length === 0) {
      checks.push(fail('breakdown', 'Breakdown', 'No manifests. The manuscript has not been broken down.', 'Run Step 4 (POST /api/projects/:id/manifests).'));
    } else {
      checks.push(pass('breakdown', 'Breakdown', `${manifestRows.length} manifest(s)`));
    }

    if (pageRows.length === 0) {
      checks.push(fail('pagination', 'Pagination', 'No pages. Pagination has not run.', 'Run Step 5 (POST /api/projects/:id/paginate).'));
    } else {
      checks.push(pass('pagination', 'Pagination', `${pageRows.length} pages, ${entryRows.length} entries`));
    }
  }

  // ── 4. Did the parser actually hold on THIS manuscript? ───────────────────
  // The parity plan's first check. Only meaningful for books that use numbered
  // entry headings; a chapter book legitimately has none, and reporting that as
  // a failure would train the operator to ignore this report.
  if (project.manuscriptPath && entryRows.length > 0) {
    try {
      const markdown = (await getProjectStorage().readProjectFile(project.manuscriptPath)).toString('utf8');
      const numbered = countNumberedEntries(markdown);
      /**
       * A FLOOR, not an equality.
       *
       * Equality was wrong and blocked New England, which has shipped: that
       * manuscript carries 75 numbered catalog entries among 178 h3 headings,
       * and hazards, primers and other non-numbered sections legitimately
       * become entries too — 127 in total. More entries than numbered headings
       * is a richer book, not a broken parser.
       *
       * FEWER entries than numbered headings is the real defect this guards:
       * it means the parser dropped catalog entries, which is exactly the
       * mis-grouping that bit the Canadian Rockies onboarding.
       */
      if (numbered === 0) {
        checks.push(na('entry-parity', 'Entry count vs source', 'The manuscript uses no numbered entry headings, so there is nothing to compare.'));
      } else if (entryRows.length >= numbered) {
        checks.push(
          pass(
            'entry-parity',
            'Entry count vs source',
            `${numbered} numbered heading(s) in the source, ${entryRows.length} entries produced — none dropped. ` +
              'Counts differ legitimately when unnumbered sections also become entries.',
          ),
        );
      } else {
        checks.push(
          fail(
            'entry-parity',
            'Entry count vs source',
            `The source has ${numbered} numbered entry headings but only ${entryRows.length} entries were produced — ${numbered - entryRows.length} were dropped.`,
            'The breakdown parser did not hold on this manuscript. Re-run breakdown and compare chapter grouping before spending.',
          ),
        );
      }
    } catch (err) {
      checks.push(warn('entry-parity', 'Entry count vs source', `Could not read the manuscript to compare: ${err instanceof Error ? err.message : String(err)}`, 'Check storage connectivity.'));
    }
  }

  // ── 4b. Does the TYPESET parser see the whole manuscript? ─────────────────
  /**
   * The entry-parity check above answers the same question for the AI
   * whole-page track, which counts catalog entries. A typeset book has no
   * entries, so until now nothing asked whether the typesetter could see the
   * book at all — and three books in a row lost structure silently because of
   * it. See `manuscript-parse-gate.ts` for why this cannot be caught later.
   */
  if (profileForDna.bodyRenderTrack !== 'typeset') {
    checks.push(
      na(
        'manuscript-parse',
        'Manuscript parse',
        'Not used by this book: the parse gate reads the typeset section parser, and this book renders whole pages.',
      ),
    );
  } else if (!project.manuscriptPath) {
    checks.push(na('manuscript-parse', 'Manuscript parse', 'No manuscript on file yet.'));
  } else {
    try {
      const markdown = (await getProjectStorage().readProjectFile(project.manuscriptPath)).toString('utf8');
      const audit = auditManuscriptParse(markdown);
      for (const f of audit.findings) {
        const detail = `${f.detail} (convention: ${audit.convention})`;
        if (f.status === 'FAIL') checks.push(fail(`manuscript-parse.${f.id}`, `Parse — ${f.label}`, detail, f.fix ?? ''));
        else if (f.status === 'WARN') checks.push(warn(`manuscript-parse.${f.id}`, `Parse — ${f.label}`, detail, f.fix ?? ''));
        else if (f.status === 'NA') checks.push(na(`manuscript-parse.${f.id}`, `Parse — ${f.label}`, detail));
        else checks.push(pass(`manuscript-parse.${f.id}`, `Parse — ${f.label}`, detail));
      }
    } catch (err) {
      checks.push(
        warn(
          'manuscript-parse',
          'Manuscript parse',
          `Could not read the manuscript to audit the parse: ${err instanceof Error ? err.message : String(err)}`,
          'Check storage connectivity.',
        ),
      );
    }
  }

  // ── 5. Cross-book contamination ───────────────────────────────────────────
  // Generalized past "New England": ANY other book's region string appearing in
  // this book's prompt path is a leak.
  const prompts = pageRows.map((p) => p.imagePrompt ?? '').filter(Boolean);
  if (prompts.length === 0) {
    checks.push(na('region-leak', 'Cross-book region leak', 'No image prompts built yet.'));
  } else {
    const regions = otherBookRegions(await listProjects(), projectId);
    const hits: string[] = [];
    for (const region of regions) {
      const n = prompts.filter((p) => p.toLowerCase().includes(region.toLowerCase())).length;
      if (n > 0) hits.push(`"${region}" in ${n} prompt(s)`);
    }
    if (hits.length > 0) {
      checks.push(
        fail(
          'region-leak',
          'Cross-book region leak',
          `Another book's region appears in this book's prompts: ${hits.join('; ')}.`,
          'A prior book\'s region is baked into the prompt path. Fix before rendering or every illustration shows the wrong landscape.',
        ),
      );
    } else {
      checks.push(pass('region-leak', 'Cross-book region leak', `${prompts.length} prompts checked against ${regions.length} other book region(s), clean`));
    }
  }

  // ── 5b. Print faces must be VENDORED, not fetched at render time ──────────
  // A render that reaches for Google Fonts produces a different book depending
  // on the network, and a missing face silently substitutes. Only meaningful on
  // the typeset track, which is the one that sets real type.
  if (track === 'typeset') {
    try {
      // The two font ROLES the operator picks per book. The standard carries
      // the defaults; project typography overrides them.
      const standard = TYPESET_LAYOUT_STANDARDS[standardId];
      const families = [
        ...new Set(
          [
            config.typography?.headingFont ?? standard?.type?.headingFont,
            config.typography?.bodyFont ?? standard?.type?.bodyFont,
          ].filter((f): f is string => typeof f === 'string' && f.length > 0),
        ),
      ];
      if (families.length === 0) {
        checks.push(na('fonts', 'Print faces', 'This standard does not name font families directly.'));
      } else {
        const { bundled, missing, systemInstalled } = bundledFontCss(families);
        if (missing.length > 0) {
          checks.push(
            fail(
              'fonts',
              'Print faces',
              `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not vendored and would be fetched at render time or silently substituted.`,
              'Vendor the face into backend/assets/fonts as base64 @font-face. A render must not depend on the network.',
            ),
          );
        } else {
          checks.push(
            pass(
              'fonts',
              'Print faces',
              `${bundled.length} vendored${systemInstalled.length ? `, ${systemInstalled.length} from the host font path` : ''}: ${families.join(', ')}`,
            ),
          );
        }
      }
    } catch (err) {
      checks.push(warn('fonts', 'Print faces', `Could not check: ${err instanceof Error ? err.message : String(err)}`, 'Inspect the layout standard\'s font list.'));
    }
  }

  // ── 6. Layout monoculture ─────────────────────────────────────────────────
  if (track === 'typeset') {
    checks.push(na('layout-variety', 'Layout variety', 'Not used by this book: the typeset track has one continuous design, not per-page layouts.'));
  } else if (pageRows.length === 0) {
    checks.push(na('layout-variety', 'Layout variety', 'No pages yet.'));
  } else {
    const distinct = new Set(pageRows.map((p) => p.layoutTemplate).filter(Boolean));
    if (distinct.size === 0) {
      checks.push(na('layout-variety', 'Layout variety', 'No layouts assigned; this book does not use the per-page layout field.'));
    } else if (distinct.size < 3) {
      checks.push(
        warn(
          'layout-variety',
          'Layout variety',
          `Only ${distinct.size} distinct layout(s) across ${pageRows.length} pages: ${[...distinct].join(', ')}.`,
          'A one-layout book reads as filler however well each page is drawn. Confirm this is intended.',
        ),
      );
    } else {
      checks.push(pass('layout-variety', 'Layout variety', `${distinct.size} distinct layouts across ${pageRows.length} pages`));
    }
  }

  // ── 7. Can a cover even be built for this book? ───────────────────────────
  try {
    const pageCount = pageRows.length || config.publishing?.coverSync?.builtForPageCount || 0;
    if (pageCount === 0) {
      checks.push(na('cover-geometry', 'Cover geometry', 'No page count yet; spine width is undefined until pagination runs.'));
    } else {
      const dims = computeCoverDimensions(config, pageCount);
      if (!(dims.spineIn > 0) || !(dims.fullWidthIn > 0)) {
        checks.push(fail('cover-geometry', 'Cover geometry', `Computed a non-positive wrap: spine ${dims.spineIn}in, width ${dims.fullWidthIn}in.`, 'Check trimSize and paperStock in Book Setup.'));
      } else {
        checks.push(
          pass(
            'cover-geometry',
            'Cover geometry',
            `${dims.fullWidthIn.toFixed(4)} × ${dims.fullHeightIn.toFixed(4)}in, spine ${dims.spineIn.toFixed(4)}in at ${pageCount}pp`,
          ),
        );
      }
    }
  } catch (err) {
    checks.push(fail('cover-geometry', 'Cover geometry', `Could not compute: ${err instanceof Error ? err.message : String(err)}`, 'Check trimSize and paperStock in Book Setup.'));
  }

  // ── verdict ───────────────────────────────────────────────────────────────
  const failed = checks.filter((c) => c.status === 'FAIL');
  const warned = checks.filter((c) => c.status === 'WARN');
  const status: ReadinessReport['status'] = failed.length > 0 ? 'BLOCKED' : warned.length > 0 ? 'WARNING' : 'READY';

  const nextAction =
    failed.length > 0
      ? `Fix ${failed.length} blocking issue(s) before spending: ${failed.map((c) => c.label).join(', ')}.`
      : warned.length > 0
        ? `Safe to proceed. ${warned.length} thing(s) worth a look first: ${warned.map((c) => c.label).join(', ')}.`
        : 'Ready. Nothing is blocking a render.';

  return {
    projectId,
    title: project.title,
    status,
    checks,
    nextAction,
    generatedAt: new Date().toISOString(),
  };
}
