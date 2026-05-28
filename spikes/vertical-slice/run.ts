/**
 * Spike 2 — Vertical Slice Orchestrator
 *
 * Runs Chanterelle through every available pipeline step.
 *
 * Flags:
 *   --skip-apis      Run only steps that don't require real API keys (A, B, E)
 *   --step=A|B|C|D|E Run a single step in isolation
 *
 * Step F (layout/PDF) lands on D3 once Spike 1 (PDF engine bake-off) has a winner.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPlaceholder, getEnv } from '../../backend/src/env.js';
import { stepA_loadManifest, type PageManifest } from './step-a-load-manifest.js';
import { stepB_assemblePrompt, type AssembledPrompt } from './step-b-assemble-prompt.js';
import { stepC_generateImage } from './step-c-generate-image.js';
import { stepD_upscale } from './step-d-upscale.js';
import { stepE_dpiGate } from './step-e-dpi-gate.js';
import { stepF_layoutPage } from './step-f-layout-page.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '../output/vertical-slice');

interface CliArgs {
  skipApis: boolean;
  step: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'ALL';
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { skipApis: false, step: 'ALL' };
  for (const a of argv.slice(2)) {
    if (a === '--skip-apis') args.skipApis = true;
    else if (a.startsWith('--step=')) {
      const v = a.slice(7).toUpperCase() as CliArgs['step'];
      if (!['A', 'B', 'C', 'D', 'E', 'F', 'ALL'].includes(v)) {
        throw new Error(`Invalid --step value: ${a}. Use A, B, C, D, E, F, or ALL.`);
      }
      args.step = v;
    }
  }
  return args;
}

function line(): void {
  // eslint-disable-next-line no-console
  console.log('───────────────────────────────────────────────────');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  // eslint-disable-next-line no-console
  console.log('\nSpike 2 — Vertical Slice (Chanterelle)');
  line();
  // eslint-disable-next-line no-console
  console.log(`  Mode: ${args.skipApis ? 'OFFLINE (steps A, B, E)' : 'FULL'}  |  Step filter: ${args.step}`);
  // eslint-disable-next-line no-console
  console.log(`  Output dir: ${OUTPUT_DIR}`);
  line();

  let manifest: PageManifest | undefined;
  let prompt: AssembledPrompt | undefined;
  let generatedPath: string | undefined;
  let upscaledPath: string | undefined;

  // ---- Step A ----
  if (args.step === 'ALL' || args.step === 'A') {
    manifest = await stepA_loadManifest();
    // eslint-disable-next-line no-console
    console.log(`✓ A  Load manifest        ${manifest.manifest_id} (${manifest.entry_name}, ${manifest.word_count} words, layout=${manifest.layout_template})`);
  }

  // ---- Step B ----
  if ((args.step === 'ALL' || args.step === 'B') && manifest) {
    prompt = await stepB_assemblePrompt(manifest);
    // eslint-disable-next-line no-console
    console.log(`${prompt.overLimit ? '✗' : '✓'} B  Assemble prompt      ${prompt.charCount} chars (limit 4000)${prompt.overLimit ? ' — OVER LIMIT' : ''}`);
  }

  // ---- Step C (needs OpenAI) ----
  if ((args.step === 'ALL' || args.step === 'C') && !args.skipApis && prompt && manifest) {
    const env = getEnv();
    if (isPlaceholder(env.OPENAI_API_KEY)) {
      // eslint-disable-next-line no-console
      console.log('○ C  Generate image       SKIPPED — OPENAI_API_KEY is a placeholder');
    } else {
      const r = await stepC_generateImage(prompt.prompt, manifest.manifest_id);
      generatedPath = r.path;
      // eslint-disable-next-line no-console
      console.log(`✓ C  Generate image       ${path.basename(r.path)} (${(r.sizeBytes / 1024).toFixed(1)} KB)`);
    }
  }

  // ---- Step D (needs Replicate) ----
  if ((args.step === 'ALL' || args.step === 'D') && !args.skipApis && manifest && generatedPath) {
    const env = getEnv();
    if (isPlaceholder(env.REPLICATE_API_TOKEN)) {
      // eslint-disable-next-line no-console
      console.log('○ D  Upscale              SKIPPED — REPLICATE_API_TOKEN is a placeholder');
    } else {
      const r = await stepD_upscale(generatedPath, manifest.manifest_id, 4);
      upscaledPath = r.path;
      // eslint-disable-next-line no-console
      console.log(`✓ D  Upscale (Real-ESRGAN) ${path.basename(r.path)} (${(r.sizeBytes / 1024 / 1024).toFixed(2)} MB, ${r.scaleFactor}×)`);
    }
  }

  // ---- Step E (always available if we have an image to check) ----
  if (args.step === 'ALL' || args.step === 'E') {
    const target = upscaledPath ?? generatedPath;
    if (!target) {
      // eslint-disable-next-line no-console
      console.log('○ E  DPI gate             SKIPPED — no image produced upstream');
    } else {
      const r = await stepE_dpiGate(target, 8.5, 11);
      // eslint-disable-next-line no-console
      console.log(`${r.passed ? '✓' : '✗'} E  DPI gate (8.5×11)    ${r.reason}`);
    }
  }

  // ---- Step F (layout → PDF, no APIs needed) ----
  if ((args.step === 'ALL' || args.step === 'F') && manifest) {
    const r = await stepF_layoutPage(manifest);
    // eslint-disable-next-line no-console
    console.log(`✓ F  Layout → PDF         ${path.basename(r.pdfPath)} (${(r.sizeBytes / 1024).toFixed(1)} KB)${r.usedPlaceholderImage ? ' [PLACEHOLDER IMAGE]' : ''}`);
  }

  line();
  // eslint-disable-next-line no-console
  console.log('  Spike 2 complete. Spike 1 (PDF engine bake-off) begins D4.\n');
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('\n✗ Spike 2 failed:', (e as Error).message);
  process.exit(1);
});
