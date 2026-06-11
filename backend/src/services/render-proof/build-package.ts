/**
 * Render proof package — assembles the AUTHORITY / INPUT / OUTPUT / PRINT view
 * for a render (or a not-yet-rendered page preview).
 *
 * Built so the operator can answer, BEFORE spending and AFTER rendering:
 *   AUTHORITY: what the page was supposed to be
 *   INPUT:     what we sent to the image model
 *   OUTPUT:    what the model returned
 *   PRINT:     what print-prep produced
 *
 * No new schema. Pulls existing fields off `whole_page_renders` rows and the
 * deterministic prepareRender + renderBlueprintPng pipeline for the pre-render
 * (no-spend) preview path.
 */

import { ProjectConfigSchema, type LayoutTemplateId } from '@wildlands/shared';
import { getProject } from '../../db/repositories/projects.repo.js';
import { getRenderById } from '../../db/repositories/whole-page-render.repo.js';
import { getPaginatedPageById } from '../../db/repositories/pagination.repo.js';
import {
  prepareRender,
  type PreparedRender,
} from '../../pipeline/whole-page-render/render-whole-page.js';
import { renderBlueprintPng } from '../../pipeline/stage-3-generation/blueprint.js';
import type { PlanningZone } from '../../pipeline/stage-6-layout/layout-director.js';
import type { BadgeSafeZone } from '../../pipeline/publishing-standard/badge-zones.js';
import { resolveGeometry } from '../../pipeline/publishing-standard/index.js';
import { computePageGeometry } from '../../pipeline/stage-6-layout/page-geometry.js';
import type { WholePageSpec } from '../../pipeline/whole-page-render/types.js';

/** Operator-language map for the simplified family layouts. Kept in lockstep
 *  with frontend SIMPLIFIED_FAMILY_LABELS. */
const FAMILY_LABEL: Partial<Record<LayoutTemplateId, string>> = {
  LAYOUT_A_TEXT: 'Layout A — Full Text + Full Illustration (text page)',
  LAYOUT_A_ILLUSTRATION: 'Layout A — Full Text + Full Illustration (illustration page)',
  LAYOUT_B_IMAGE_TOP: 'Layout B — 50/50 (image top)',
  LAYOUT_B_IMAGE_BOTTOM: 'Layout B — 50/50 (image bottom)',
  LAYOUT_B_IMAGE_LEFT: 'Layout B — 50/50 (image left)',
  LAYOUT_B_IMAGE_RIGHT: 'Layout B — 50/50 (image right)',
  LAYOUT_C_CORNER_TOP_LEFT: 'Layout C — 25% Accent (top-left corner)',
  LAYOUT_C_CORNER_TOP_RIGHT: 'Layout C — 25% Accent (top-right corner)',
  LAYOUT_C_CORNER_BOTTOM_LEFT: 'Layout C — 25% Accent (bottom-left corner)',
  LAYOUT_C_CORNER_BOTTOM_RIGHT: 'Layout C — 25% Accent (bottom-right corner)',
  LAYOUT_D_PURE_TEXT: 'Layout D — Pure Text / Back Matter',
};

function layoutFamilyLabel(t: LayoutTemplateId | string): string {
  return FAMILY_LABEL[t as LayoutTemplateId] ?? String(t);
}

/** The four sections operator can inspect. */
export interface RenderProofPackage {
  pageId: string;
  pageKey: string;
  renderId: string | null; // null for the pre-render preview path
  status: 'PREVIEW' | 'QUEUED' | 'RENDERING' | 'RENDERED' | 'APPROVED' | 'REJECTED' | 'FAILED';
  /** Populated when status === 'FAILED'. Surfaces the row's stored error so the
   *  operator can audit failed renders without a DB query. Null otherwise. */
  errorMessage: string | null;
  /** What the page was supposed to be. */
  authority: {
    layoutTemplate: LayoutTemplateId | string;
    layoutFamilyLabel: string;
    pageType: WholePageSpec['pageType'];
    entryTitle: string;
    trim: { widthIn: number; heightIn: number; bleedIn: number };
    canvas: { widthIn: number; heightIn: number };
    textFrame: { widthIn: number; heightIn: number };
    zones: {
      typographyZones: PlanningZone[];
      imagePriorityZones: PlanningZone[];
      textSafeZones: PlanningZone[];
      /** L-7 — reserved rects the AI was instructed to leave clean and
       *  print-prep stamps badges/folio into. Surfaced here so the operator
       *  can audit exactly which zones shipped for any render. Empty array
       *  means the page had no badges + no folio (O-6 release / O-7 drop). */
      badgeSafeZones: BadgeSafeZone[];
    };
    sourceText: string;
    sourceTextChars: number;
    sourceTextWords: number;
    title: { kicker: string; number: string; name: string };
    dropCap: string | null;
    badgeContext: WholePageSpec['badgeContext'];
  };
  /** What we sent (or would send) to the image model. */
  input: {
    /** Full WholePageSpec — the JSON the operator can pretty-print. */
    specJson: WholePageSpec;
    specPath: string | null;
    /** Assembled prompt text. */
    prompt: string;
    promptPath: string | null;
    promptSha256: string | null;
    /** Blueprint PNG: a URL when persisted (post-render), a base64 data URI for
     *  the pre-render preview path so the operator can inspect what WOULD ship. */
    blueprintImage:
      | { kind: 'url'; path: string; url: string }
      | { kind: 'inline'; dataUri: string; widthPx: number; heightPx: number };
    modelRequested: string;
    requestedSize: string;
  };
  /** What the model returned. Null until the render runs. */
  output: {
    imagePath: string;
    imageUrl: string;
    widthPx: number | null;
    heightPx: number | null;
    modelReturned: string | null;
    renderedAt: string | null;
    attempts: number;
  } | null;
  /** What print-prep produced. Null until print-prep runs. */
  print: {
    printPngPath: string;
    printPngUrl: string;
    printPdfPath: string;
    printPdfUrl: string;
    preflightPassed: boolean | null;
  } | null;
}

/** Build the "what would be sent" preview for a page that hasn't been rendered.
 *  No spend — uses prepareRender + renderBlueprintPng (both pure / no AI). */
export async function buildPreviewPackageForPage(pageId: string): Promise<RenderProofPackage> {
  const page = await getPaginatedPageById(pageId);
  if (!page) throw new Error(`page_not_found:${pageId}`);
  const prepared = await prepareRender(pageId);
  const [bw, bh] = prepared.size.split('x').map(Number);
  // L-7 — keep blueprint preview in lockstep with the live render path.
  const { trim, bleedIn } = prepared.spec.layoutGeometry;
  const canvasIn = { w: trim.widthIn + 2 * bleedIn, h: trim.heightIn + 2 * bleedIn };
  const { png: blueprintPng } = await renderBlueprintPng(
    prepared.allocation,
    bw ?? 1024,
    bh ?? 1536,
    { badgeSafeZones: prepared.spec.badgeSafeZones, canvasIn },
  );

  return assemblePackage({
    pageId,
    renderId: null,
    status: 'PREVIEW',
    prepared,
    specPath: null,
    promptPath: null,
    promptSha256: null,
    blueprintImage: {
      kind: 'inline',
      dataUri: `data:image/png;base64,${blueprintPng.toString('base64')}`,
      widthPx: bw ?? 1024,
      heightPx: bh ?? 1536,
    },
    output: null,
    print: null,
    errorMessage: null,
  });
}

/** Assemble the proof package for an existing render row (any status). */
export async function buildProofPackageForRender(renderId: string): Promise<RenderProofPackage> {
  const row = await getRenderById(renderId);
  if (!row) throw new Error(`render_not_found:${renderId}`);
  // Re-derive the same prepared object the render used. Deterministic.
  const prepared = await prepareRender(row.pageId);

  const fileUrl = (path: string | null): string =>
    path ? `/api/whole-page-render/file?path=${encodeURIComponent(path)}` : '';

  const output =
    row.imagePath != null
      ? {
          imagePath: row.imagePath,
          imageUrl: fileUrl(row.imagePath),
          widthPx: row.widthPx,
          heightPx: row.heightPx,
          modelReturned: row.model,
          // The schema has updatedAt (last status change). For RENDERED rows
          // that's the render completion time.
          renderedAt: row.updatedAt?.toISOString() ?? null,
          attempts: row.attempts,
        }
      : null;

  const print =
    row.printPdfPath != null && row.printPngPath != null
      ? {
          printPngPath: row.printPngPath,
          printPngUrl: fileUrl(row.printPngPath),
          printPdfPath: row.printPdfPath,
          printPdfUrl: fileUrl(row.printPdfPath),
          preflightPassed: row.preflightPassed,
        }
      : null;

  return assemblePackage({
    pageId: row.pageId,
    renderId,
    status: row.status,
    prepared,
    specPath: row.specPath,
    promptPath: row.promptPath,
    promptSha256: row.promptSha256,
    blueprintImage: row.blueprintPath
      ? {
          kind: 'url',
          path: row.blueprintPath,
          url: fileUrl(row.blueprintPath),
        }
      : {
          // Pre-blueprint-persistence rows — regenerate on the fly so the proof
          // package is always complete even for legacy renders.
          kind: 'inline',
          dataUri: await regenerateBlueprintDataUri(prepared),
          widthPx: 1024,
          heightPx: 1536,
        },
    output,
    print,
    // The row's stored error message. Surfaced in the package only when status
    // is FAILED so the operator can audit failures from the proof endpoint
    // without a DB query.
    errorMessage: row.errorMessage ?? null,
  });
}

async function regenerateBlueprintDataUri(prepared: PreparedRender): Promise<string> {
  const [bw, bh] = prepared.size.split('x').map(Number);
  // L-7 — legacy renders (rows without persisted blueprintPath) get a
  // regenerated blueprint that includes the badge-safe zones, so the operator
  // audit surface matches the new contract even for pre-L-7 rows.
  const { trim, bleedIn } = prepared.spec.layoutGeometry;
  const canvasIn = { w: trim.widthIn + 2 * bleedIn, h: trim.heightIn + 2 * bleedIn };
  const { png } = await renderBlueprintPng(
    prepared.allocation,
    bw ?? 1024,
    bh ?? 1536,
    { badgeSafeZones: prepared.spec.badgeSafeZones, canvasIn },
  );
  return `data:image/png;base64,${png.toString('base64')}`;
}

interface AssembleInput {
  pageId: string;
  renderId: string | null;
  status: RenderProofPackage['status'];
  prepared: PreparedRender;
  specPath: string | null;
  promptPath: string | null;
  promptSha256: string | null;
  blueprintImage: RenderProofPackage['input']['blueprintImage'];
  output: RenderProofPackage['output'];
  print: RenderProofPackage['print'];
  errorMessage: string | null;
}

async function assemblePackage(input: AssembleInput): Promise<RenderProofPackage> {
  const { prepared } = input;
  const spec = prepared.spec;

  // Project config + resolved geometry (single source of truth — see
  // SPEC_GEOMETRY_RECONCILIATION).
  const project = await getProject(prepared.projectId);
  const config = ProjectConfigSchema.parse(project?.config ?? {});
  const geom = resolveGeometry(config);
  const pageGeometry = computePageGeometry(geom.trimSize);

  return {
    pageId: input.pageId,
    pageKey: prepared.pageKey,
    renderId: input.renderId,
    status: input.status,
    authority: {
      layoutTemplate: spec.layoutFamily,
      layoutFamilyLabel: layoutFamilyLabel(spec.layoutFamily),
      pageType: spec.pageType,
      entryTitle: spec.pageText.title.name || prepared.pageKey,
      trim: {
        widthIn: geom.trimSize.widthIn,
        heightIn: geom.trimSize.heightIn,
        bleedIn: geom.trimSize.bleedIn,
      },
      canvas: { widthIn: geom.canvasIn.w, heightIn: geom.canvasIn.h },
      textFrame: { widthIn: pageGeometry.textWidthIn, heightIn: pageGeometry.textHeightIn },
      zones: {
        typographyZones: prepared.allocation.typographyZones,
        imagePriorityZones: prepared.allocation.imagePriorityZones,
        textSafeZones: prepared.allocation.textSafeZones,
        // L-7 — same rects the AI was told to leave clean (BADGE-SAFE ZONES
        // block in the prompt) and the print-prep stamper writes into.
        badgeSafeZones: spec.badgeSafeZones,
      },
      sourceText: spec.pageText.body,
      sourceTextChars: (spec.pageText.body ?? '').length,
      sourceTextWords: (spec.pageText.body ?? '').split(/\s+/).filter(Boolean).length,
      title: spec.pageText.title,
      dropCap: spec.pageText.dropCap ?? null,
      badgeContext: spec.badgeContext,
    },
    input: {
      specJson: spec,
      specPath: input.specPath,
      prompt: prepared.assembledPrompt,
      promptPath: input.promptPath,
      promptSha256: input.promptSha256,
      blueprintImage: input.blueprintImage,
      modelRequested: 'gpt-image-1',
      requestedSize: prepared.size,
    },
    output: input.output,
    print: input.print,
    // Only meaningful when the render failed; null otherwise so the operator
    // does not see stale error context on RENDERED / APPROVED rows.
    errorMessage: input.status === 'FAILED' ? input.errorMessage : null,
  };
}
