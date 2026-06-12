/**
 * Geometry reconciliation — operator runbook script (SPEC_GEOMETRY_RECONCILIATION §5).
 *
 * One-time correction + non-spend verification for a project whose trim was
 * baked to the old 7×10 default. Does NOT generate any images (no spend):
 *   1. Correct the project trim to the Standard default (8.5×11).
 *   2. Re-paginate (capacity recomputed on the corrected trim).
 *   3. Build a fresh render spec for a sample page and PROVE its geometry is
 *      8.5×11 / 8.75×11.25 — i.e. the render path no longer emits 7×10.
 *
 * Usage:
 *   tsx scripts/correct-and-verify-geometry.ts <projectId> [--apply]
 *   (without --apply it runs read-only: shows current trim + what would change)
 */

import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject, updateProjectConfig } from '../src/db/repositories/projects.repo.js';
import { listManifests } from '../src/db/repositories/manifests.repo.js';
import {
  listPaginatedPagesForProject,
  persistPaginatedPages,
} from '../src/db/repositories/pagination.repo.js';
import { paginateProject } from '../src/pipeline/stage-1.75-pagination/paginate.js';
import { prepareRender } from '../src/pipeline/experimental/whole-page-render/render-whole-page.js';
import { DEFAULT_TRIM, resolveGeometry } from '../src/pipeline/publishing-standard/index.js';
import { PageManifestSchema } from '@wildlands/shared';

const projectId = process.argv[2];
const apply = process.argv.includes('--apply');

if (!projectId) {
  console.error('Usage: tsx scripts/correct-and-verify-geometry.ts <projectId> [--apply]');
  process.exit(2);
}

function trimStr(t: { widthIn: number; heightIn: number; bleedIn: number }): string {
  return `${t.widthIn}x${t.heightIn} (bleed ${t.bleedIn})`;
}

async function main(): Promise<void> {
  const project = await getProject(projectId);
  if (!project) {
    console.error(`project_not_found:${projectId}`);
    process.exit(1);
  }
  const config = ProjectConfigSchema.parse(project.config);
  console.log(`Project: ${project.title} (${projectId})`);
  console.log(`Current stored trim: ${trimStr(config.trimSize)}`);

  const resolvedBefore = resolveGeometry(config);
  console.log(`Resolves to: trim ${trimStr(resolvedBefore.trimSize)} / canvas ${resolvedBefore.canvasIn.w}x${resolvedBefore.canvasIn.h}`);

  const needsCorrection =
    config.trimSize.widthIn !== DEFAULT_TRIM.widthIn || config.trimSize.heightIn !== DEFAULT_TRIM.heightIn;

  if (!apply) {
    console.log('\n[dry-run] Re-run with --apply to:');
    if (needsCorrection) console.log(`  - correct trim ${trimStr(config.trimSize)} → ${trimStr(DEFAULT_TRIM)}`);
    else console.log('  - (trim already Standard default; no correction needed)');
    console.log('  - re-paginate the project');
    console.log('  - build a fresh render spec and assert 8.5x11 / 8.75x11.25');
    return;
  }

  // 1. Correct trim → Standard default.
  if (needsCorrection) {
    const corrected = { ...config, trimSize: { ...DEFAULT_TRIM } };
    await updateProjectConfig(projectId, corrected);
    console.log(`\n[1] Trim corrected → ${trimStr(DEFAULT_TRIM)}`);
  } else {
    console.log('\n[1] Trim already Standard default — no correction.');
  }

  // 2. Re-paginate on the corrected trim.
  const reloaded = ProjectConfigSchema.parse((await getProject(projectId))!.config);
  const geometry = resolveGeometry(reloaded);
  if (geometry.canvasIn.w !== 8.75 || geometry.canvasIn.h !== 11.25) {
    throw new Error(`geometry_check_failed: canvas ${geometry.canvasIn.w}x${geometry.canvasIn.h} (expected 8.75x11.25)`);
  }
  const manifestRows = await listManifests(projectId, 'PAGE');
  const entries = manifestRows.map((row) => PageManifestSchema.parse(row.content));
  const result = paginateProject({ entries, config: reloaded });
  const { pagesWritten } = await persistPaginatedPages({ projectId, paginatedPages: result.pages });
  console.log(`[2] Re-paginated: ${pagesWritten} pages written. Fit distribution:`, result.summary.fitDistribution);

  // 3. Build a fresh spec for a sample page (NO image generation, NO spend) and
  //    prove the render path now emits the corrected geometry.
  const pages = await listPaginatedPagesForProject(projectId);
  const sample = pages.find((p) => (p as { readingFieldText?: string }).readingFieldText) ?? pages[0];
  if (!sample) {
    console.log('[3] No paginated pages to sample — skipping spec proof.');
  } else {
    const prepared = await prepareRender(sample.id);
    const trim = prepared.spec.layoutGeometry.trim;
    const ok = trim.widthIn === 8.5 && trim.heightIn === 11;
    console.log(`[3] Fresh render spec for ${sample.pageKey}: layoutGeometry.trim = ${trim.widthIn}x${trim.heightIn} ${ok ? '✓' : '✗ FAIL'}`);
    console.log(`    blueprint pixel size: ${prepared.size}`);
    if (!ok) throw new Error('render_spec_still_not_default_trim');
  }

  console.log('\n✓ Geometry reconciliation verified (non-spend). Render-spec geometry is 8.5x11 / canvas 8.75x11.25.');
  console.log('  Next (spend): render the verification batch — image-top, image-right, pure-text, continuation.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
