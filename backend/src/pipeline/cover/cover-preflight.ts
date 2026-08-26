/**
 * COVER PREFLIGHT — everything the operator should see BEFORE money is spent,
 * and the gate that refuses to spend it on a spec that is already wrong.
 *
 * The first paid cover for NO ONE TOLD ME THAT came back beige and black with
 * the author name on the trim line. Both faults were fully determined before the
 * call was made: the resolved style DNA and the prompt were sitting in memory,
 * and nothing looked at them. A preflight that shows the operator the actual
 * prompt, the actual blueprint and the actual geometry turns that class of
 * failure from a paid discovery into a free one.
 *
 * ─── FAIL CLOSED ──────────────────────────────────────────────────────────────
 *
 * An ERROR blocks generation. A WARNING does not: it is something the operator
 * should look at and may legitimately accept. The split matters, because a gate
 * that blocks on taste gets routed around, and then it is not a gate.
 */
import { PAGE_THICKNESS_IN } from '../publishing-standard/cover-dimensions.js';
import type { ProjectConfig } from '@wildlands/shared';
import { getKdpCoverDimensions, type KdpCoverConfig } from '../publishing-standard/kdp-cover-specs.js';
import { AVG_COST_PER_IMAGE_USD } from '../../services/cost/estimate.js';
import { getProductionProfile } from '../production-profiles/registry.js';
import { blueprintTextZones } from './cover-blueprint.js';
import type { CoverSpec } from './cover-spec.js';
import type { Rect } from './cover-geometry.js';

export type PreflightStatus = 'PASS' | 'WARNING' | 'ERROR';

export interface PreflightCheck {
  key: string;
  label: string;
  status: PreflightStatus;
  detail: string;
}

export interface CoverPreflightReport {
  status: PreflightStatus;
  /** True when a paid generation must not be attempted. */
  blocked: boolean;
  checks: PreflightCheck[];
  cost: {
    estimatedUsd: number;
    basis: string;
  };
}

/**
 * Vocabulary that belongs to the Wildlands field guide and to nothing else.
 *
 * Present in another book's cover prompt, it means interior or legacy language
 * has leaked in. This is the check that would have caught a graphic trade cover
 * being told its ink was warm sepia.
 */
const FIELD_GUIDE_VOCABULARY = [
  'parchment',
  'sepia',
  'field guide',
  'expedition-journal',
  'botanical',
  'engraved serif',
  'naturalist plate',
  'scientific name',
];

/**
 * Find foreign vocabulary that INSTRUCTS, ignoring the same word being FORBIDDEN.
 *
 * A naive substring match is wrong here and fails in the most misleading
 * direction: the graphic-trade DNA legitimately says "do NOT convert any named
 * colour to ... sepia" and "NOT naturalist plates". Those are the check working,
 * not the check tripping. Only a positive use is leakage.
 */
export function findStyleLeakage(prompt: string, vocabulary: string[]): string[] {
  const lower = prompt.toLowerCase();
  const NEGATORS = /\b(no|not|never|non|avoid|without|don't|do not|nor)\b/;
  const hits: string[] = [];
  for (const term of vocabulary) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(term, from);
      if (at === -1) break;
      from = at + term.length;
      // Look back over the clause this term sits in, stopping at the previous
      // sentence or line so a negation two sentences earlier does not excuse a
      // positive use here.
      //
      // A comma is deliberately NOT a boundary. These terms appear inside
      // comma-separated prohibition lists ("do NOT convert any named colour to
      // grey, tone, sepia, kraft"), and cutting at the comma severs every item
      // after the first from the "do NOT" that governs it.
      const clauseStart = Math.max(
        lower.lastIndexOf('.', at),
        lower.lastIndexOf(';', at),
        lower.lastIndexOf('\n', at),
      );
      const clause = lower.slice(clauseStart + 1, at);
      if (!NEGATORS.test(clause)) {
        hits.push(term);
        break;
      }
    }
  }
  return hits;
}

const contains = (r: Rect, inner: Rect): boolean =>
  inner.x >= r.x - 0.5 &&
  inner.y >= r.y - 0.5 &&
  inner.x + inner.w <= r.x + r.w + 0.5 &&
  inner.y + inner.h <= r.y + r.h + 0.5;

export function runCoverPreflight(input: {
  spec: CoverSpec;
  config: ProjectConfig;
  prompt: string;
}): CoverPreflightReport {
  const { spec, config, prompt } = input;
  const g = spec.geometry;
  const checks: PreflightCheck[] = [];

  const add = (key: string, label: string, status: PreflightStatus, detail: string) =>
    checks.push({ key, label, status, detail });

  // ── INPUTS ────────────────────────────────────────────────────────────────
  add(
    'page_count',
    'Interior page count',
    g.pageCount > 0 ? 'PASS' : 'ERROR',
    g.pageCount > 0
      ? `${g.pageCount} pages, from the ${spec.provenance.pageCountSource} track. The spine is sized from this.`
      : 'No interior page count. Build the interior before the cover; the spine cannot be sized without it.',
  );

  add(
    'paper_stock',
    'Paper stock',
    config.paperStock ? 'PASS' : 'ERROR',
    config.paperStock
      ? `${config.paperStock} (${PAGE_THICKNESS_IN[config.paperStock]} in per page, published KDP factor)`
      : 'No paper stock set. White and cream give different spine widths; guessing prints a misaligned wrap.',
  );

  add(
    'title',
    'Title',
    spec.copy.title.trim() ? 'PASS' : 'ERROR',
    spec.copy.title.trim() ? `"${spec.copy.title}"` : 'No title. The cover cannot be generated without one.',
  );

  add(
    'author',
    'Author',
    spec.copy.author.trim() ? 'PASS' : 'ERROR',
    spec.copy.author.trim() ? `"${spec.copy.author}"` : 'No author name.',
  );

  const hasBack =
    Boolean(spec.copy.back?.mainDescription) ||
    Boolean(spec.copy.back?.insideThisVolume?.length) ||
    Boolean(spec.copy.back?.authorBio);
  add(
    'back_copy',
    'Back-cover copy',
    hasBack ? 'PASS' : 'WARNING',
    hasBack
      ? 'Supplied.'
      : 'No back-cover copy (Book Setup). The back panel will be artwork only, which is a legitimate choice but rarely intended.',
  );

  // ── GEOMETRY ──────────────────────────────────────────────────────────────
  add(
    'spine_width',
    'Spine width',
    g.dims.spineIn >= 0.06 ? 'PASS' : 'ERROR',
    `${g.dims.spineIn.toFixed(4)} in at ${g.pageCount} pages on ${g.paperStock} paper.`,
  );

  add(
    'cover_bleed',
    'Cover bleed',
    g.bleedIn === 0.125 ? 'PASS' : 'ERROR',
    g.bleedIn === 0.125
      ? '0.125 in on every outside edge, independent of the interior bleed.'
      : `Cover bleed is ${g.bleedIn} in. KDP requires 0.125 in on every paperback cover regardless of the interior.`,
  );

  const wrapOk =
    Math.abs(g.dims.fullWidthIn - (g.trimIn.widthIn * 2 + g.dims.spineIn + g.bleedIn * 2)) < 1e-6 &&
    Math.abs(g.dims.fullHeightIn - (g.trimIn.heightIn + g.bleedIn * 2)) < 1e-6;
  add(
    'wrap_arithmetic',
    'Wrap dimensions',
    wrapOk ? 'PASS' : 'ERROR',
    `${g.dims.fullWidthIn.toFixed(3)} x ${g.dims.fullHeightIn.toFixed(3)} in ` +
      `(${g.printCanvas.widthPx} x ${g.printCanvas.heightPx} px at ${g.printCanvas.dpi} DPI).`,
  );

  // Cross-check against Amazon's own calculator readings, but ONLY where a
  // verified anchor exists. No reading for this configuration is not a failure;
  // it is simply nothing to compare against.
  const kdpConfig: KdpCoverConfig = {
    binding: 'PAPERBACK',
    coverType: 'CASE_LAMINATE',
    interiorType: 'BLACK_AND_WHITE',
    paperType: g.paperStock === 'cream' ? 'CREAM' : 'WHITE',
    trimSize: `${g.trimIn.widthIn}x${g.trimIn.heightIn}` as KdpCoverConfig['trimSize'],
    pageCount: g.pageCount,
  };
  try {
    const verified = getKdpCoverDimensions(kdpConfig);
    const agree = Math.abs(verified.spineIn - g.dims.spineIn) <= 0.001;
    add(
      'geometry_cross_check',
      'Cross-check vs KDP calculator',
      agree ? 'PASS' : 'ERROR',
      agree
        ? `Formula matches the verified reading (${verified.spineIn} in, ${verified.provenance}).`
        : `Formula says ${g.dims.spineIn.toFixed(4)} in; the verified KDP reading says ${verified.spineIn} in. Two answers to one spine — do not spend until this is resolved.`,
    );
  } catch {
    add(
      'geometry_cross_check',
      'Cross-check vs KDP calculator',
      'WARNING',
      'No verified KDP calculator reading exists for this configuration, so the formula could not be cross-checked. ' +
        'Confirm the spine against https://kdp.amazon.com/en_US/cover-calculator before uploading.',
    );
  }

  // ── LAYOUT ────────────────────────────────────────────────────────────────
  const zones = blueprintTextZones(spec);
  const surviving = g.crop.survivingModelRect;
  const croppedZones = zones.filter((z) => !contains(surviving, z.rect));
  add(
    'zones_survive_crop',
    'Text zones survive the crop',
    croppedZones.length === 0 ? 'PASS' : 'ERROR',
    croppedZones.length === 0
      ? `All ${zones.length} text zones sit inside the ${g.crop.survivingWidthPct.toFixed(1)}% of width that survives.`
      : `${croppedZones.length} text zone(s) would be cropped off: ${croppedZones.map((z) => z.label).join(', ')}.`,
  );

  const outsideSafe = zones.filter((z) => !contains(g.modelPx.safe, z.rect));
  add(
    'zones_inside_safe',
    'Text zones inside the safe area',
    outsideSafe.length === 0 ? 'PASS' : 'ERROR',
    outsideSafe.length === 0
      ? 'Every text zone is inside the trim-safe line.'
      : `Outside safe: ${outsideSafe.map((z) => z.label).join(', ')}.`,
  );

  const spineSafeW = g.inches.spineSafe.w;
  add(
    'spine_text',
    'Spine text',
    !spec.spineTextAllowed
      ? 'PASS'
      : spineSafeW > 0.05
        ? 'PASS'
        : 'WARNING',
    !spec.spineTextAllowed
      ? `Spine text suppressed: ${g.pageCount} pages is under KDP's 79-page minimum.`
      : `Spine text permitted. Safe strip ${spineSafeW.toFixed(4)} in wide ` +
        `(${g.modelPx.spineSafe.w.toFixed(1)} px on the model canvas).` +
        (spineSafeW <= 0.05
          ? ' That is very narrow; consider setting the spine deterministically instead of asking the model for it.'
          : ''),
  );

  // ── ART DIRECTION ─────────────────────────────────────────────────────────
  const profile = getProductionProfile(spec.productionProfileId);
  add(
    'cover_dna',
    'Cover style DNA',
    spec.art.styleDnaId === profile.defaultStyleDnaId && profile.coverStyleDnaId
      ? 'ERROR'
      : 'PASS',
    `${spec.art.styleDnaId}${spec.art.fullColour ? ' (full colour)' : ' (monochrome)'}. ` +
      `Interior DNA is ${profile.defaultStyleDnaId}.`,
  );

  // A B&W interior with a monochrome cover DNA is almost always the interior
  // leaking, because KDP prints every paperback cover in colour anyway.
  const interiorIsMono = profile.defaultStyleDnaId.startsWith('bw-');
  add(
    'colour_mode',
    'Cover colour mode',
    interiorIsMono && !spec.art.fullColour ? 'ERROR' : 'PASS',
    interiorIsMono && !spec.art.fullColour
      ? 'The interior is black and white and the cover resolved to a monochrome DNA. KDP prints every paperback cover in full colour; this is the interior leaking into the cover.'
      : spec.art.fullColour
        ? 'Full colour, resolved from the cover DNA rather than the interior.'
        : 'Monochrome, and the interior is not black and white, so this is deliberate.',
  );

  const leaks = findStyleLeakage(prompt, FIELD_GUIDE_VOCABULARY);
  const isFieldGuide = spec.productionProfileId === 'wildlands-field-guide';
  add(
    'no_style_leakage',
    'No foreign style language in the prompt',
    leaks.length === 0 || isFieldGuide ? 'PASS' : 'ERROR',
    leaks.length === 0
      ? 'No field-guide or interior vocabulary in the cover prompt.'
      : isFieldGuide
        ? `Field-guide vocabulary present (${leaks.join(', ')}), which is correct for this book class.`
        : `Field-guide vocabulary leaked into a ${spec.productionProfileId} cover: ${leaks.join(', ')}.`,
  );

  add(
    'blueprint_attached',
    'Layout reference',
    spec.model.usesBlueprint ? 'PASS' : 'ERROR',
    spec.model.usesBlueprint
      ? 'A blueprint is attached with the request, and the prompt refers to it.'
      : 'The prompt refers to an attached layout reference but none is being sent.',
  );

  // ── SYNC ──────────────────────────────────────────────────────────────────
  const built = spec.provenance.coverBuiltForPageCount;
  add(
    'cover_sync',
    'Cover / interior sync',
    built == null || built === g.pageCount ? 'PASS' : 'WARNING',
    built == null
      ? 'No cover generated yet.'
      : built === g.pageCount
        ? `Existing cover was built for ${built} pages, which matches.`
        : `Existing cover was built for ${built} pages but the interior is now ${g.pageCount}. Regenerating will re-sync it.`,
  );

  const status: PreflightStatus = checks.some((c) => c.status === 'ERROR')
    ? 'ERROR'
    : checks.some((c) => c.status === 'WARNING')
      ? 'WARNING'
      : 'PASS';

  return {
    status,
    blocked: status === 'ERROR',
    checks,
    cost: {
      estimatedUsd: AVG_COST_PER_IMAGE_USD,
      basis:
        `One ${spec.model.model} image at ${spec.model.sizePx.widthPx}x${spec.model.sizePx.heightPx}, quality ${spec.model.quality}. ` +
        `Figure is the platform's AVG_COST_PER_IMAGE_USD constant (services/cost/estimate.ts), not a reading from an invoice — ` +
        `docs/HANDOFF_NEXT_SESSION.md records ~$0.09 measured per render, so treat this as an estimate and confirm against real spend.`,
    },
  };
}
