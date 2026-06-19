/* Emit the CONTENT-PLACEMENT blueprint (svg + png) and the EXACT prompt we send
 * the image model (with v1.3 PRODUCTION LAYOUT RULES injected). No AI spend. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ProjectConfigSchema, buildBackCoverCopy } from '@wildlands/shared';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { buildBlueprintSvg, buildMasterPrompt, stripAuthorBio } from './lib/cover-blueprint.js';

const P = process.argv[2]!;
const OUT = 'C:/Users/jovan/Downloads';
const dims = { fullWidthIn: 16.409, fullHeightIn: 11.417, spineIn: 0.834 };

// Render at the true wrap aspect so the preview is dimensionally honest.
const W = 1640, H = 1142;
const svg = buildBlueprintSvg(W, H);
writeFileSync(join(OUT, 'hardcover_blueprint.svg'), svg);
writeFileSync(join(OUT, 'hardcover_blueprint.png'), await sharp(Buffer.from(svg)).png().toBuffer());

const config = stripAuthorBio(ProjectConfigSchema.parse((await getProject(P))!.config));
const prompt = buildMasterPrompt(buildBackCoverCopy((config.publishing as any).bookDescription) ?? undefined);
writeFileSync(join(OUT, 'hardcover_cover_PROMPT.txt'), prompt);

console.log('blueprint → hardcover_blueprint.png / .svg');
console.log('prompt    → hardcover_cover_PROMPT.txt  (operator master prompt + exact back copy)');
process.exit(0);
