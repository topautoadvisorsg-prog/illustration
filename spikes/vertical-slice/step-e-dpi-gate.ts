/**
 * Spike 2 Step E — Sharp DPI Gate
 *
 * Validates an image's effective DPI at the target print dimensions.
 * Pass criteria: effective DPI ≥ MIN_DPI on both axes.
 *
 * This step needs NO API keys.
 *
 * Math (per spec):
 *   effective_DPI = pixel_dimension / print_inches
 */

import sharp from 'sharp';

export const MIN_DPI = 300;

export interface DPICheck {
  passed: boolean;
  pixelW: number;
  pixelH: number;
  printInchesW: number;
  printInchesH: number;
  effectiveDpiW: number;
  effectiveDpiH: number;
  reason: string;
}

export async function stepE_dpiGate(
  imagePath: string,
  printInchesW: number,
  printInchesH: number,
): Promise<DPICheck> {
  const meta = await sharp(imagePath).metadata();
  if (!meta.width || !meta.height) {
    throw new Error(`Cannot read pixel dimensions from ${imagePath}`);
  }
  const effectiveDpiW = meta.width / printInchesW;
  const effectiveDpiH = meta.height / printInchesH;
  const passed = effectiveDpiW >= MIN_DPI && effectiveDpiH >= MIN_DPI;

  const reason = passed
    ? `OK — ${Math.round(effectiveDpiW)}×${Math.round(effectiveDpiH)} DPI at ${printInchesW}×${printInchesH} in`
    : `FAIL — ${Math.round(effectiveDpiW)}×${Math.round(effectiveDpiH)} DPI at ${printInchesW}×${printInchesH} in (min ${MIN_DPI})`;

  return {
    passed,
    pixelW: meta.width,
    pixelH: meta.height,
    printInchesW,
    printInchesH,
    effectiveDpiW,
    effectiveDpiH,
    reason,
  };
}

// Standalone runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (!arg) {
    // eslint-disable-next-line no-console
    console.error('Usage: tsx step-e-dpi-gate.ts <imagePath> [widthIn=8.5] [heightIn=11]');
    process.exit(2);
  }
  const w = process.argv[3] ? Number(process.argv[3]) : 8.5;
  const h = process.argv[4] ? Number(process.argv[4]) : 11;
  try {
    const r = await stepE_dpiGate(arg, w, h);
    // eslint-disable-next-line no-console
    console.log(`${r.passed ? '✓' : '✗'} Step E — ${r.reason}`);
    process.exit(r.passed ? 0 : 1);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`✗ Step E — ${(e as Error).message}`);
    process.exit(1);
  }
}
