/**
 * KDP preflight checks (STD-3 Print-Prep). Pure; the gate that blocks export.
 */

import { SPACING } from '../publishing-standard/index.js';

export interface PreflightInput {
  widthPx: number;
  heightPx: number;
  dpi: number;
  colorMode: string; // sharp 'space' e.g. 'srgb'
  pngBytes: number;
  pdfBytes: number;
  badgesWithinCanvas: boolean;
  /** Project's resolved canvas (trim + 2×bleed). REQUIRED — preflight must
   *  check the page against the SAME canvas the project resolved to. Callers
   *  pass `resolveGeometry(config).canvasIn`; no default fallback (that path
   *  is what produced the original trim-mismatch bug). */
  canvasIn: { w: number; h: number };
}

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PreflightReport {
  passed: boolean;
  checks: PreflightCheck[];
}

const KDP_MAX_INTERIOR_PDF_BYTES = 650 * 1024 * 1024; // KDP ~650MB ceiling

export function runPreflight(input: PreflightInput): PreflightReport {
  const { canvasIn } = input;
  const expW = Math.round(canvasIn.w * SPACING.printDpi);
  const expH = Math.round(canvasIn.h * SPACING.printDpi);

  const checks: PreflightCheck[] = [
    {
      name: 'dimensions',
      ok: input.widthPx === expW && input.heightPx === expH,
      detail: `${input.widthPx}×${input.heightPx} (expected ${expW}×${expH})`,
    },
    {
      name: 'dpi',
      ok: input.dpi === SPACING.printDpi,
      detail: `${input.dpi} DPI (expected ${SPACING.printDpi})`,
    },
    {
      name: 'trim_plus_bleed',
      ok:
        Math.abs(input.widthPx / input.dpi - canvasIn.w) < 0.01 &&
        Math.abs(input.heightPx / input.dpi - canvasIn.h) < 0.01,
      detail: `${(input.widthPx / input.dpi).toFixed(3)}×${(input.heightPx / input.dpi).toFixed(3)} in (expected ${canvasIn.w}×${canvasIn.h})`,
    },
    {
      name: 'color_mode',
      ok: /rgb/i.test(input.colorMode),
      detail: `${input.colorMode} (KDP interior accepts RGB)`,
    },
    {
      name: 'file_present',
      ok: input.pngBytes > 0 && input.pdfBytes > 0,
      detail: `png ${input.pngBytes}B, pdf ${input.pdfBytes}B`,
    },
    {
      name: 'file_size',
      ok: input.pdfBytes <= KDP_MAX_INTERIOR_PDF_BYTES,
      detail: `pdf ${(input.pdfBytes / 1024 / 1024).toFixed(2)}MB (max ${KDP_MAX_INTERIOR_PDF_BYTES / 1024 / 1024}MB)`,
    },
    {
      name: 'content_in_safe_area',
      ok: input.badgesWithinCanvas,
      detail: input.badgesWithinCanvas ? 'badges + folio inside safe area' : 'content outside safe area',
    },
  ];

  return { passed: checks.every((c) => c.ok), checks };
}
