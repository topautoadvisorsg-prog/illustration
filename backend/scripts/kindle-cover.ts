/* Standalone KINDLE eBook cover for KDP (portrait front panel, 1600x2560 JPEG).
 * Same front-panel crop the EPUB uses. No spend. */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';
const cfg = ProjectConfigSchema.parse((await getProject(P))!.config);
const art = await getProjectStorage().readProjectFile(cfg.publishing.coverAssetPath!);
const m = await sharp(art).metadata(); const cw = m.width!, ch = m.height!;
const cropW = Math.round(ch * 1600 / 2560);              // portrait 1600x2560 ratio
const left = Math.max(0, cw - cropW - Math.round(cw * 0.04)); // front panel (right), small inset
const jpg = await sharp(art).extract({ left, top: 0, width: Math.min(cropW, cw - left), height: ch }).resize(1600, 2560).jpeg({ quality: 90 }).toBuffer();
writeFileSync('C:/Users/jovan/Downloads/WILDLANDS_KINDLE_COVER.jpg', jpg);
console.log('Kindle eBook cover: 1600x2560 JPEG,', (jpg.length / 1024 | 0) + ' KB | source wrap', cw + 'x' + ch);
process.exit(0);
