/**
 * Stage 1.75 — provisional layout sequence builder.
 *
 * Given the ordered entries of a project, produce an array of LayoutTemplateId
 * that says "page 1 uses layout X, page 2 uses layout Y, ..." BEFORE any text
 * is poured into Reading Blocks. The flow engine walks this sequence; the real
 * page count is whatever the flow produces, not what was estimated here.
 *
 * The sequence is a HINT to the flow engine. If the flow consumes the stream
 * faster than expected, trailing layouts in the sequence are silently dropped.
 * If the stream outlasts the sequence, the flow engine appends
 * LAYOUT_2_TEXT_HEAVY pages until the stream empties.
 *
 * See SPEC_PAGINATION_V1.md §5.6.
 */

import type { ContentType, LayoutTemplateId, PageManifest, ProjectConfig } from '@wildlands/shared';
import { isDangerPage } from '../stage-2-planner/content-signals.js';
import { chooseSimplifiedLayout } from '../stage-2-planner/layout-families.js';
import { getEnv } from '../../env.js';
import { countWords } from '../shared/markdown-text.js';

/** v1 continuation/reading layout. SPEC §5.6 notes a future LAYOUT_17_CONTINUATION. */
export const DEFAULT_CONTINUATION_LAYOUT: LayoutTemplateId = 'LAYOUT_2_TEXT_HEAVY';

/** Rough target words per LAYOUT_2_TEXT_HEAVY continuation page — used only
 *  for the provisional estimate. The real fill is decided at flow time. */
const CONTINUATION_TARGET_WORDS = 560;

/**
 * Map a content type to its preferred opener layout. Mirrors the planner's
 * content-type table from plan-pages.ts:238-295 but drops the overflow
 * autoroute (the flow engine handles overflow by continuation, not by
 * swapping the opener layout).
 */
export function preferredOpenerLayout(
  entry: PageManifest,
  config: ProjectConfig,
): LayoutTemplateId {
  // Simplified families take precedence when the flag is on. Falls back to
  // the 16-template content-type table below otherwise. The danger override
  // lives inside chooseSimplifiedLayout itself for the simplified path.
  if (getEnv().LAYOUT_SIMPLIFIED_V1) {
    return chooseSimplifiedLayout(entry, config).template;
  }

  // Danger override — highest priority, same as the planner.
  if (isDangerPage(entry)) return 'LAYOUT_4_DANGER_WARNING';

  const ct: ContentType | undefined = entry.contentType;
  switch (ct) {
    case 'CHAPTER_OPENER':
      return 'LAYOUT_5_CHAPTER_OPENER';
    case 'REFERENCE_PAGE':
      return 'LAYOUT_6_BACK_MATTER';
    case 'ENCYCLOPEDIA_ENTRY':
      return 'LAYOUT_2_TEXT_HEAVY';
    case 'WARNING_PAGE':
      return 'LAYOUT_4_DANGER_WARNING';
    case 'COMPARISON':
    case 'MULTI_SPECIES_COMPARISON':
      return config.layoutPolicy.comparisonTemplate;
    case 'DIAGNOSTIC_DIAGRAM':
    case 'IDENTIFICATION_GUIDE':
      return 'LAYOUT_12_DIAGNOSTIC_DIAGRAM';
    case 'HABITAT_OVERVIEW':
    case 'TERRAIN_ANALYSIS':
      return 'LAYOUT_13_FEATURE_BANNER';
    case 'PROGRESSION_STUDY':
      return 'LAYOUT_15_PROGRESSION_STUDY';
    case 'CUTAWAY_ILLUSTRATION':
      return 'LAYOUT_16_CUTAWAY_FEATURE';
    case 'FIELD_NOTES_PAGE':
      return 'LAYOUT_7_SCATTERED_VIGNETTES';
    case 'BOTANICAL_PLATE':
      return 'LAYOUT_10_FULL_PAGE_PLATE';
    case 'SIDEBAR_FEATURE':
      return 'LAYOUT_14_SIDEBAR_FEATURE';
    case 'ANIMAL_PROFILE':
    case 'SPECIES_PROFILE':
      return config.layoutPolicy.defaultTemplate;
    default:
      return config.layoutPolicy.defaultTemplate;
  }
}

/**
 * Very coarse estimate: how many continuation pages does an entry likely need
 * after its opener? Used only to make the provisional sequence long enough that
 * the flow engine rarely has to append continuations at the end. The actual
 * count is decided at flow time.
 */
export function roughEstimateContinuationPages(entry: PageManifest): number {
  const words = countWords(entry.bodyMarkdown);
  if (words <= CONTINUATION_TARGET_WORDS) return 0;
  // Subtract one because the opener page also carries some text.
  return Math.max(0, Math.ceil(words / CONTINUATION_TARGET_WORDS) - 1);
}

export interface LayoutSequenceSlot {
  layoutTemplate: LayoutTemplateId;
  /** The entry this slot was provisioned for. The flow engine may move the
   *  entry to an earlier or later slot at flow time. */
  provisionedFor: string;
  /** 'opener' = first slot for this entry; 'continuation' = padding slot. */
  role: 'opener' | 'continuation';
}

export interface LayoutSequence {
  slots: LayoutSequenceSlot[];
  /** Per-entry index of the slot the entry SHOULD open on, for the flow engine. */
  openerIndexByEntryKey: Map<string, number>;
}

/**
 * Build the provisional sequence: opener for each entry + estimated number of
 * continuation slots. Entries are taken in their array order (caller's
 * responsibility to sort by chapter / planned page number).
 */
export function buildLayoutSequence(
  entries: PageManifest[],
  config: ProjectConfig,
): LayoutSequence {
  const slots: LayoutSequenceSlot[] = [];
  const openerIndexByEntryKey = new Map<string, number>();

  for (const entry of entries) {
    openerIndexByEntryKey.set(entry.pageId, slots.length);
    slots.push({
      layoutTemplate: preferredOpenerLayout(entry, config),
      provisionedFor: entry.pageId,
      role: 'opener',
    });
    const continuationsNeeded = roughEstimateContinuationPages(entry);
    for (let i = 0; i < continuationsNeeded; i++) {
      slots.push({
        layoutTemplate: DEFAULT_CONTINUATION_LAYOUT,
        provisionedFor: entry.pageId,
        role: 'continuation',
      });
    }
  }

  return { slots, openerIndexByEntryKey };
}
