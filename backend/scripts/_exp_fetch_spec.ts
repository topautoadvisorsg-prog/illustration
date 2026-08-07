import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import fs from 'node:fs';

async function main() {
  const db = getDb();
  const proj = '8c1e161a-69dd-4a3d-a655-8de54995be16';
  const page = await db
    .select()
    .from(pages)
    .where(and(eq(pages.projectId, proj), eq(pages.pageKey, 'CH01_P007_c4')))
    .limit(1);
  if (!page[0]) {
    console.log('NO PAGE FOUND');
    process.exit(1);
  }
  console.log('PAGE ID:', page[0].id, 'pageType:', page[0].pageType);
  const renders = await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, page[0].id));
  console.log('RENDER COUNT:', renders.length);
  renders.forEach((r, i) => {
    console.log(`--- render ${i} version=${r.version} promptLen=${r.assembledPrompt.length} ---`);
  });
  if (renders[0]) {
    const outDir = 'C:/Users/jovan/AppData/Local/Temp/claude/C--Users-jovan-Downloads-claudio-set-up/0b1ad914-543d-4971-9460-abb2b7ba92d9/scratchpad';
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(`${outDir}/spec_json_ch01_p007_c4.json`, JSON.stringify(renders[0].specJson, null, 2));
    fs.writeFileSync(`${outDir}/assembled_prompt_ch01_p007_c4.txt`, renders[0].assembledPrompt);
    console.log('WROTE spec_json + assembled_prompt to scratchpad');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
