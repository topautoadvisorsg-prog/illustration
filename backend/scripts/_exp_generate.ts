/**
 * EXPERIMENT-ONLY generation runner for the prompt-optimization test.
 * NO DB WRITES. NO createAndRunRender. Pure generateImage() calls, saved to
 * backend/experiments/prompt-optimization/<variant>/sample-N.png.
 */
import fs from 'node:fs';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq, and } from 'drizzle-orm';
import { generateImage } from '../src/services/openai/openai.js';
import {
  sliceControlPrompt,
  buildControl,
  buildVariantA,
  buildVariantB,
  buildVariantC,
  buildVariantD,
  buildVariantE,
} from './_exp_lib.js';

const OUT_DIR = 'experiments/prompt-optimization';
const CONCURRENCY = 4;

interface Job {
  variant: string;
  sampleIndex: number;
  prompt: string;
}

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(`${OUT_DIR}/progress.log`, line + '\n');
}

async function runJob(job: Job, manifest: Record<string, unknown>[]) {
  const dir = `${OUT_DIR}/${job.variant}`;
  fs.mkdirSync(dir, { recursive: true });
  const pngPath = `${dir}/sample-${job.sampleIndex}.png`;
  if (fs.existsSync(pngPath)) {
    log(`SKIP (exists) ${job.variant} sample-${job.sampleIndex}`);
    return;
  }
  const started = Date.now();
  try {
    const result = await generateImage({ prompt: job.prompt, size: '1024x1536', quality: 'high' });
    fs.writeFileSync(pngPath, result.pngBuffer);
    const ms = Date.now() - started;
    log(`OK   ${job.variant} sample-${job.sampleIndex} (${ms}ms, ${result.widthPx}x${result.heightPx})`);
    manifest.push({ variant: job.variant, sample: job.sampleIndex, ok: true, ms, path: pngPath });
  } catch (err) {
    const ms = Date.now() - started;
    log(`FAIL ${job.variant} sample-${job.sampleIndex} (${ms}ms): ${(err as Error).message}`);
    manifest.push({ variant: job.variant, sample: job.sampleIndex, ok: false, ms, error: (err as Error).message });
  }
}

async function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let idx = 0;
  async function next(): Promise<void> {
    const i = idx++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
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

  const prompts: Record<string, string> = {
    control: buildControl(controlText),
    variant_A_consolidated: buildVariantA(sections),
    variant_B_fidelity_top: buildVariantB(sections),
    variant_C_fidelity_adjacent: buildVariantC(sections),
    variant_D_grouped_blocks: buildVariantD(sections),
    variant_E_spell_risk_words: buildVariantE(sections, bodyText),
  };

  // Persist prompt text for the record (idempotent).
  for (const [name, text] of Object.entries(prompts)) {
    const dir = `${OUT_DIR}/${name}`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/_prompt.txt`, text);
  }

  // Sample plan: control gets 3 EXTRA samples (existing 5 real production renders
  // already give control n=5; these 3 bring it to n=8 for tighter confidence).
  // Each of the 5 new variants gets 6 samples. Total new generations = 3 + 5*6 = 33,
  // within the 40-generation budget ceiling (7 held in reserve).
  // RESUME PASS: control/A/B already have their samples on disk (existsSync skip
  // makes this idempotent); C/D/E are being topped up to 5 samples each per the
  // coordinator's follow-up (12 generations used so far, budget ceiling is 40).
  const plan: { variant: string; count: number; startIndex: number }[] = [
    { variant: 'control', count: 3, startIndex: 6 }, // samples 6,7,8 (1-5 are real prod renders, not regenerated)
    { variant: 'variant_A_consolidated', count: 6, startIndex: 1 },
    { variant: 'variant_B_fidelity_top', count: 6, startIndex: 1 },
    { variant: 'variant_C_fidelity_adjacent', count: 5, startIndex: 1 },
    { variant: 'variant_D_grouped_blocks', count: 5, startIndex: 1 },
    { variant: 'variant_E_spell_risk_words', count: 5, startIndex: 1 },
  ];

  const jobs: Job[] = [];
  for (const p of plan) {
    for (let i = 0; i < p.count; i++) {
      jobs.push({ variant: p.variant, sampleIndex: p.startIndex + i, prompt: prompts[p.variant] });
    }
  }

  log(`Starting ${jobs.length} generations across ${plan.length} groups, concurrency=${CONCURRENCY}`);
  const manifest: Record<string, unknown>[] = [];
  await pool(jobs, CONCURRENCY, (job) => runJob(job, manifest));

  fs.writeFileSync(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));
  const okCount = manifest.filter((m) => m.ok).length;
  log(`DONE. ${okCount}/${manifest.length} succeeded. Manifest written to ${OUT_DIR}/manifest.json`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
