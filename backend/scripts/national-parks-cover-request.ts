/**
 * Build the National Parks cover REQUEST — prompt, blueprint and preflight.
 *
 * FREE. Generates nothing and spends nothing: it produces the instruction the
 * image model would be given, the layout reference image that goes with it, and
 * the preflight verdict. The operator reads all three before any money moves.
 *
 * Uses `buildCoverRequest`, the same generalized engine behind the shipped DIRT
 * RICH wrap — not a hand-written prompt. The type-safety percentages, the spine
 * fraction and the panel boundaries are computed from THIS book's geometry, so
 * they cannot be inherited from another book's wrap.
 *
 *   npx tsx scripts/national-parks-cover-request.ts <projectId> <outDir>
 */
import { writeFileSync } from 'node:fs';

await import('../src/env.js');

const projectId = process.argv[2];
const outDir = process.argv[3];
if (!projectId || !outDir) throw new Error('usage: national-parks-cover-request.ts <projectId> <outDir>');

const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject } = await import('../src/db/repositories/projects.repo.js');
const { buildCoverRequest } = await import('../src/pipeline/cover/build-cover-request.js');

const project = await getProject(projectId);
if (!project) throw new Error(`project ${projectId} not found`);
const config = ProjectConfigSchema.parse(project.config);

const req = await buildCoverRequest(projectId, config, { authorTypeSetBy: 'deterministic' });

const promptPath = `${outDir}/COVER-PROMPT.txt`;
const bpPath = `${outDir}/COVER-BLUEPRINT.png`;
writeFileSync(promptPath, req.prompt, 'utf8');
writeFileSync(bpPath, req.blueprintPng);

console.log(`page count      : ${req.spec.geometry.pageCount ?? '(see geometry)'} (${req.spec.provenance.pageCountSource})`);
console.log(`spine text      : ${req.spec.spineTextAllowed ? 'allowed' : 'NOT allowed'}`);
console.log(`spine type by   : ${req.spec.spineTypeSetBy}`);
console.log(`author type by  : ${req.spec.authorTypeSetBy}`);
console.log(`model           : ${JSON.stringify(req.spec.model)}`);
console.log(`\ngeometry        : ${JSON.stringify(req.spec.geometry, null, 1)}`);
console.log(`\nprompt          : ${promptPath} (${req.prompt.length} chars)`);
console.log(`blueprint       : ${bpPath} (${req.blueprintPng.length} bytes)`);

console.log(`\n── PREFLIGHT ──`);
const pf = req.preflight as unknown as Record<string, unknown>;
console.log(JSON.stringify(pf, null, 1).slice(0, 3000));

process.exit(0);
