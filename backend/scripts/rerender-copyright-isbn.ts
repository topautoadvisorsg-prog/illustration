/* Re-render the COPYRIGHT page adding the hardcover ISBN line (surgical — no
 * planFrontMatter, no pagination change). Same content otherwise. */
import { createHash } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import { ProjectConfigSchema } from '@wildlands/shared';
import { getDb } from '../src/db/client.js';
import { projects, pages, wholePageRenders } from '../src/db/schema/index.js';
import { getProject } from '../src/db/repositories/projects.repo.js';
import { getProjectStorage } from '../src/services/storage/project-storage.js';
import { resolveGeometry, WILDLANDS_STANDARD } from '../src/pipeline/publishing-standard/index.js';
import { composeFrontMatterPage, wrapText, type ComposeInput } from '../src/pipeline/front-matter/compose-page.js';

const PROJECT = process.argv[2]!;
const ISBN = '9798181958814';
const YEAR = 2026;
const HOLDER = 'Wade Brannock';
const REPRO = 'No part of this publication may be reproduced, stored in a retrieval system, or transmitted in any form or by any means without the prior written permission of the publisher, except for brief quotations used in reviews.';
const DISCLAIMERS = [
  'This book is intended for educational and informational purposes only. Wilderness travel, foraging, bushcraft, and interaction with wild plants, fungi, and animals involve inherent risks.',
  'Never consume any wild plant or mushroom based solely on a single source of information. Always verify identification using multiple reliable references and exercise appropriate caution in the field.',
  'The author and publisher assume no responsibility for injury, illness, loss, or damage resulting from the use or misuse of the information contained in this book.',
];

const db = getDb();
const project = await getProject(PROJECT);
if (!project) { console.error('project_not_found'); process.exit(1); }
const rawConfig: any = project.config;
rawConfig.publishing = rawConfig.publishing ?? {};
rawConfig.publishing.isbn = { ...(rawConfig.publishing.isbn ?? {}), print: ISBN };
await db.update(projects).set({ config: rawConfig, updatedAt: new Date() }).where(eq(projects.id, PROJECT));

const config = ProjectConfigSchema.parse(rawConfig);
const canvasIn = resolveGeometry(config).canvasIn;
const title = config.publishing.title ?? 'THE WILDLANDS';
const subtitle = config.publishing.subtitle ?? 'NEW ENGLAND';

const lines: string[] = [];
lines.push(`${title}${subtitle ? ' — ' + subtitle : ''}`);
lines.push('');
lines.push(`Copyright © ${YEAR} ${HOLDER}. All rights reserved.`);
for (const l of wrapText(REPRO, 72)) lines.push(l);
lines.push('');
lines.push('First Edition');
lines.push('Published independently by Wade Brannock');
lines.push(`ISBN ${ISBN} (hardcover)`);
lines.push('');
lines.push('Disclaimer');
DISCLAIMERS.forEach((d, i) => { for (const l of wrapText(d, 72)) lines.push(l); if (i < DISCLAIMERS.length - 1) lines.push(''); });

const composeSpec: ComposeInput = { kind: 'COPYRIGHT_PAGE', canvasIn, pageLabel: null, copyrightLines: lines };
const row = (await db.select().from(pages).where(and(eq(pages.projectId, PROJECT), eq(pages.frontMatterType, 'COPYRIGHT_PAGE'))))[0];
if (!row) { console.error('COPYRIGHT_PAGE row not found'); process.exit(1); }
console.log('page:', row.pageKey, '| copyright lines:', lines.length);

const storage = getProjectStorage();
const pageKey = row.pageKey;
const composed = await composeFrontMatterPage(composeSpec);
const png = await storage.writeProjectFile(PROJECT, ['front-matter', `${pageKey}.png`], composed.pngBuffer);
const assembledPrompt = `Deterministic front-matter composition — copyright page (operator-updated: + ISBN ${ISBN}).`;
const promptFile = await storage.writeProjectFile(PROJECT, ['front-matter', `${pageKey}.composition.txt`], assembledPrompt);
const printPng = await storage.writeProjectFile(PROJECT, ['print-ready', `${pageKey}.print.png`], composed.pngBuffer);
const printPdf = await storage.writeProjectFile(PROJECT, ['print-ready', `${pageKey}.print.pdf`], composed.pdfBuffer);

await db.update(wholePageRenders).set({ active: false }).where(eq(wholePageRenders.pageId, row.id));
const latest = (await db.select({ version: wholePageRenders.version }).from(wholePageRenders).where(eq(wholePageRenders.pageId, row.id)).orderBy(desc(wholePageRenders.version)).limit(1))[0];
const nextVersion = (latest?.version ?? 0) + 1;
const [ins] = await db.insert(wholePageRenders).values({
  pageId: row.id, projectId: PROJECT, version: nextVersion, status: 'APPROVED' as const,
  specJson: { frontMatter: true, ...composeSpec } as object, assembledPrompt,
  promptSha256: createHash('sha256').update(assembledPrompt).digest('hex'), standardVersion: WILDLANDS_STANDARD.version,
  active: true, approvedForBook: true, attempts: 0, imagePath: png.relativePath, promptPath: promptFile.relativePath,
  printPngPath: printPng.relativePath, printPdfPath: printPdf.relativePath, preflightPassed: true,
  widthPx: composed.widthPx, heightPx: composed.heightPx, model: 'deterministic-composer-v1',
}).returning({ id: wholePageRenders.id });
await db.update(pages).set({ readingFieldText: lines.filter((l) => l).join('\n') }).where(eq(pages.id, row.id));
console.log('version:', nextVersion, '| render:', ins!.id, '| renderId for re-prep:', ins!.id);
console.log('DONE — copyright re-rendered with ISBN. Re-prep this render (q88) then rebuild interior.');
process.exit(0);
