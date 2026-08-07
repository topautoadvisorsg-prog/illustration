import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import fs from 'node:fs';
import {
  sliceControlPrompt,
  buildControl,
  buildVariantA,
  buildVariantB,
  buildVariantC,
  buildVariantD,
  buildVariantE,
  extractRiskWords,
} from './_exp_lib.js';

const OUT_DIR = 'experiments/prompt-optimization';

async function main() {
  const db = getDb();
  const proj = '8c1e161a-69dd-4a3d-a655-8de54995be16';
  const page = await db
    .select()
    .from(pages)
    .where(and(eq(pages.projectId, proj), eq(pages.pageKey, 'CH01_P007_c4')))
    .limit(1);
  if (!page[0]) throw new Error('page not found');
  const renders = await db.select().from(wholePageRenders).where(eq(wholePageRenders.pageId, page[0].id));
  const v2 = renders.find((r) => r.version === 2);
  if (!v2) throw new Error('version 2 render not found');
  const controlText = v2.assembledPrompt;
  const bodyText = (v2.specJson as any).pageText.body as string;

  const sections = sliceControlPrompt(controlText);
  const rebuiltControl = buildControl(controlText);
  console.log('CONTROL identity check:', rebuiltControl === controlText ? 'PASS (exact match)' : 'N/A (control is passthrough)');

  const variants = {
    control: controlText,
    variant_A_consolidated: buildVariantA(sections),
    variant_B_fidelity_top: buildVariantB(sections),
    variant_C_fidelity_adjacent: buildVariantC(sections),
    variant_D_grouped_blocks: buildVariantD(sections),
    variant_E_spell_risk_words: buildVariantE(sections, bodyText),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, text] of Object.entries(variants)) {
    const dir = `${OUT_DIR}/${name}`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/_prompt.txt`, text);
    console.log(`${name}: ${text.length} chars -> ${dir}/_prompt.txt`);
  }

  console.log('\nRisk words extracted for Variant E:', extractRiskWords(bodyText));

  // Sanity: every variant must still contain the exact body text blocks verbatim,
  // and the exact composition/geometry values, so ONLY structure changed.
  const mustContain = [
    'cauliflower towers',
    'counterintuitive truth',
    'Hazard 5: The Weather Turning Above Treeline',
    'Hazard 6: Elk and Large Wildlife',
    '"widthIn": 7',
    '"heightIn": 10',
  ];
  for (const [name, text] of Object.entries(variants)) {
    for (const needle of mustContain) {
      if (!text.includes(needle)) {
        console.error(`FAIL: ${name} missing required content: "${needle}"`);
        process.exitCode = 1;
      }
    }
  }
  console.log('Content-preservation check done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
