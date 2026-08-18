/**
 * Build the finished typeset interior for a project.
 *
 * This is the whole Track B body pipeline in one call: resolve the pinned
 * layout standard, typeset the manuscript, then stamp approved artwork onto the
 * finished PDF. It was written inline inside GET /typeset-preview, which meant
 * the ONLY way to obtain a typeset interior was to ask for a preview. Assembly,
 * the audits and the delivery path all had to go without, and each one blocked
 * or threw for every typeset book. Extracting it is what connects Track B to the
 * rest of the factory.
 *
 * Typesetting FINISHES before anything is drawn on top. Stamping cannot reflow a
 * line, so the page count, the wrapping and the block-to-page map reported here
 * are canonical whether or not the book has artwork.
 */
import type { ProjectConfig } from '@wildlands/shared';
import { getProject } from '../../db/repositories/projects.repo.js';
import { getProjectStorage } from '../../services/storage/project-storage.js';
import { getProductionProfile } from '../production-profiles/registry.js';
import { resolveTypesetLayoutStandard } from './layout-standards/registry.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from './layout-standards/educational-nonfiction-v1.js';
import { renderTypesetBook } from './render-typeset.js';
import type { TypesetReport } from './typeset-book.js';
import type { TypesetBlockRef } from './block-identity.js';
import { stampIllustrations, type StampedIllustration } from './stamp-illustrations.js';
import { padInteriorToEven } from './pad-to-even.js';

export interface TypesetInterior {
  pdf: Buffer;
  pageCount: number;
  report: TypesetReport;
  blocks: TypesetBlockRef[];
  layoutStandardId: string;
  productionProfileId: string;
  /** Override block ids that matched no block in this render. */
  orphanedOverrides: string[];
  stampedIllustrations: StampedIllustration[];
  orphanedIllustrations: { blockId: string; reason: string }[];
}

export interface BuildTypesetInteriorOptions {
  /** Chapter-start policy. Chapter 1 is always recto; this forces the rest too. */
  chaptersStartRecto: boolean;
  /**
   * Draw trim and text-area guides, for on-screen review only.
   *
   * Never set by assembly or the delivery path — an exported interior must have
   * nothing on it that is not the book.
   */
  reviewGuides?: boolean;
  /**
   * Called when the standard had to be resolved from the profile rather than a
   * project pin, so the caller can pin it. Only the request path should pin:
   * a read-only audit must not mutate the project it is auditing.
   */
  onResolvedStandard?: (standardId: string) => Promise<void>;
}

export class TypesetInputMissingError extends Error {}

/**
 * Which layout standard this book renders against.
 *
 * Precedence: the PROJECT'S PIN wins over the profile default — that is what
 * makes a pin a pin. A book approved on @1 keeps rendering against @1 even after
 * the profile starts naming @2.
 */
export function resolveStandardId(config: ProjectConfig): string {
  const profile = getProductionProfile(config.productionProfileId);
  return (
    config.typesetLayoutStandardId ??
    profile.typesetLayoutStandardId ??
    // A profile with no typeset standard (the field guide) still reaches this
    // path today; v1 is the design it has been rendering all along.
    EDUCATIONAL_NONFICTION_TYPESET_V1.id
  );
}

export async function buildTypesetInterior(
  projectId: string,
  config: ProjectConfig,
  options: BuildTypesetInteriorOptions,
): Promise<TypesetInterior> {
  const project = await getProject(projectId);
  if (!project?.manuscriptPath) {
    throw new TypesetInputMissingError(
      'No manuscript on file. Upload one before building the typeset interior.',
    );
  }

  const storage = getProjectStorage();
  const markdown = (await storage.readProjectFile(project.manuscriptPath)).toString('utf8');

  const profile = getProductionProfile(config.productionProfileId);
  const standardId = resolveStandardId(config);
  const layoutStandard = resolveTypesetLayoutStandard(standardId);
  if (!config.typesetLayoutStandardId) await options.onResolvedStandard?.(standardId);

  const illustrations = config.illustrations ?? {};
  const hasIllustrations = Object.keys(illustrations).length > 0;

  /**
   * INLINE FIGURES — `![caption](asset-name)` in the manuscript.
   *
   * Resolved from `<project>/illustrations/<name>` into data URIs so the render
   * carries its own assets rather than reaching for the filesystem mid-layout,
   * the same rule the vendored type faces follow.
   *
   * Distinct from the STAMPING path below: a stamped illustration is drawn into
   * space left at the foot of a page, while an inline figure occupies space in
   * the flow and pagination accounts for it. A text-dense book has no leftover
   * space to stamp into, so its figures belong in the flow.
   */
  const images: Record<string, string> = {};
  for (const m of markdown.matchAll(/^!\[[^\]]*\]\(([^)]+)\)(?:\{\d{1,3}%\})?$/gm)) {
    const name = m[1]!.trim();
    if (images[name]) continue;
    try {
      const bytes = await storage.readProjectFile([projectId, 'illustrations', name].join('/'));
      const ext = name.split('.').pop()?.toLowerCase();
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png';
      images[name] = `data:${mime};base64,${bytes.toString('base64')}`;
    } catch {
      // Left unresolved deliberately. The renderer then leaves the reference as
      // literal text, so a missing figure is VISIBLE on the page rather than
      // silently absent from a printed book.
    }
  }

  const result = await renderTypesetBook({
    markdown,
    config,
    images,
    chaptersStartRecto: options.chaptersStartRecto,
    reviewGuides: options.reviewGuides,
    layoutStandard,
    // Title page, copyright page and contents, set in the same standard as the
    // body. This makes the render two passes: a contents page states where
    // sections start, and that depends on how long the contents is.
    frontMatter: { publication: { year: new Date().getFullYear() } },
    // The probe resolves an illustration's anchor block to a page and says where
    // type actually ends on it. Only paid for when there is artwork.
    deepProbe: hasIllustrations,
  });

  let pdf = result.pdf;
  let stampedIllustrations: StampedIllustration[] = [];
  let orphanedIllustrations: { blockId: string; reason: string }[] = [];
  if (hasIllustrations && result.probe) {
    const assets = new Map<string, Buffer>();
    for (const art of Object.values(illustrations)) {
      try {
        assets.set(art.approvedAssetPath, await storage.readProjectFile(art.approvedAssetPath));
      } catch {
        // Deliberately left out of the map: the stamper reports it as an orphan
        // rather than drawing a placeholder or failing the build.
      }
    }
    const out = await stampIllustrations({
      pdf: result.pdf,
      illustrations,
      assets,
      probe: result.probe,
      trim: { widthIn: config.trimSize.widthIn, heightIn: config.trimSize.heightIn },
      margins: result.report.marginsIn,
    });
    pdf = out.pdf;
    stampedIllustrations = out.stamped;
    orphanedIllustrations = out.orphaned;
  }

  /* Last step, once nothing can reflow. An odd block would otherwise be sized
     for a spine one leaf narrower than the book KDP actually prints. The report
     carries the padded count too, because the spine is computed from it. */
  const padded = await padInteriorToEven(pdf);
  pdf = padded.pdf;
  const report = padded.added
    ? {
        ...result.report,
        totalPages: padded.pageCount,
        blankPages: [...result.report.blankPages, padded.pageCount],
      }
    : result.report;

  return {
    pdf,
    pageCount: padded.pageCount,
    report,
    blocks: result.blocks,
    layoutStandardId: standardId,
    productionProfileId: profile.id,
    orphanedOverrides: result.overrides.orphaned,
    stampedIllustrations,
    orphanedIllustrations,
  };
}
