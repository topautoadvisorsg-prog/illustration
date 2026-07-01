import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { P } from './_project.js';
const project = await getProject(P);
const coverPath = ProjectConfigSchema.parse(project!.config).publishing.coverAssetPath!;
const art = await getProjectStorage().readProjectFile(coverPath);
// Hardcover = full wrap (back|spine|front), scaled for viewing
writeFileSync('C:/Users/jovan/Downloads/HARDCOVER_WRAP.png', await sharp(art).resize(1500).png().toBuffer());
// Kindle = portrait front crop (mirrors build-epub)
const m = await sharp(art).metadata(); const cw = m.width!, ch = m.height!;
const cropW = Math.round(ch * 1600 / 2560); const left = cw - cropW - Math.round(cw * 0.04);
writeFileSync('C:/Users/jovan/Downloads/KINDLE_FRONT.png', await sharp(art).extract({ left: Math.max(0,left), top: 0, width: cropW, height: ch }).resize(1000, 1600).jpeg({ quality: 88 }).toBuffer());
console.log('wrote HARDCOVER_WRAP.png + KINDLE_FRONT.png (paperback preview already exists)');
process.exit(0);
