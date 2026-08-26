/**
 * COVER SPEC — answer "what is the spine for this final PDF?" once and for all.
 *
 * The question that produced eighteen different cover scripts. This reads the
 * page count out of the interior PDF, resolves the geometry from the published
 * KDP specification, and prints every dimension WITH ITS ARITHMETIC, so the
 * operator can check the number rather than trust it.
 *
 *   tsx scripts/qa/cover-spec.ts --interior final-interior.pdf \
 *       --binding paperback --ink bw --paper white --trim 6x9
 *
 *   --json            structured output instead of the report
 *   --proof out.png   geometry proof: trim, panels, safe zones, folds, barcode
 *
 * THERE IS NO --pages FLAG, deliberately. A typed page count cannot be wrong
 * loudly, and a wrong spine is scrap paper and a reprint. If the interior cannot
 * be opened, nothing is printed.
 *
 * FAILS CLOSED. A configuration the verified specification cannot serve gets
 * UNVERIFIED KDP CONFIGURATION and a non-zero exit, never the nearest factor.
 *
 * Free: reads a PDF, does arithmetic, optionally draws a PNG. No model, no
 * network, no database.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import {
  PAPERBACK_RULES,
  HARDCOVER_RULES,
  UnverifiedKdpConfigurationError,
  resolvePaperbackSpine,
  pageCountLimit,
  SUPPORTED_TRIMS,
  type KdpBinding,
  type KdpInk,
  type KdpPaper,
} from '../../src/pipeline/publishing-standard/kdp-spec.js';
import { getKdpCoverDimensions } from '../../src/pipeline/publishing-standard/kdp-cover-specs.js';

const arg = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (name: string): boolean => process.argv.includes(`--${name}`);

const INTERIOR = arg('interior');
const BINDING = (arg('binding') ?? 'paperback').toUpperCase() as KdpBinding;
const INK_RAW = (arg('ink') ?? 'bw').toLowerCase();
const PAPER = (arg('paper') ?? 'white').toUpperCase() as KdpPaper;
const TRIM = arg('trim') ?? '6x9';
const AS_JSON = has('json');
const PROOF = arg('proof');

const INK: KdpInk =
  INK_RAW === 'bw' || INK_RAW === 'black_and_white' ? 'BLACK_AND_WHITE'
  : INK_RAW === 'premium' || INK_RAW === 'premium_color' ? 'PREMIUM_COLOR'
  : INK_RAW === 'standard' || INK_RAW === 'standard_color' ? 'STANDARD_COLOR'
  : ('UNKNOWN' as KdpInk);

function die(message: string, code = 2): never {
  console.error(message);
  process.exit(code);
}

if (!INTERIOR) {
  die(
    [
      'usage: tsx scripts/qa/cover-spec.ts --interior <final-interior.pdf> [options]',
      '',
      '  --binding paperback|hardcover   (default paperback)',
      '  --ink     bw|standard|premium   (default bw)',
      '  --paper   white|cream|groundwood (default white)',
      '  --trim    6x9                   (default 6x9)',
      '  --json                          structured output',
      '  --proof   out.png               geometry proof image',
      '',
      'The page count is READ from the interior PDF. There is no --pages flag.',
    ].join('\n'),
  );
}

// ── Page count, read ─────────────────────────────────────────────────────────
let pageCount: number;
try {
  pageCount = (await PDFDocument.load(readFileSync(INTERIOR))).getPageCount();
} catch (e) {
  die(`cover-spec: cannot read the interior PDF at ${INTERIOR}\n  ${(e as Error).message}`);
}

const [trimW, trimH] = TRIM.split('x').map(Number);
if (!trimW || !trimH) die(`cover-spec: --trim must look like 6x9, got "${TRIM}"`);

if (!SUPPORTED_TRIMS[BINDING]?.includes(TRIM)) {
  console.error(
    [
      `UNVERIFIED KDP CONFIGURATION — official calculator/template required`,
      ``,
      `  requested : ${BINDING} at ${TRIM}in`,
      `  reason    : KDP does not list ${TRIM}in among its ${BINDING} trim sizes`,
      `  remedy    : supported ${BINDING} trims are ${SUPPORTED_TRIMS[BINDING]?.join(', ')}`,
    ].join('\n'),
  );
  process.exit(3);
}

// ── Geometry ─────────────────────────────────────────────────────────────────
interface Rect { xIn: number; yIn: number; widthIn: number; heightIn: number }
const rect = (xIn: number, yIn: number, widthIn: number, heightIn: number): Rect => ({ xIn, yIn, widthIn, heightIn });
const r3 = (n: number) => Number(n.toFixed(6));

let spineIn: number;
let spineExplanation: string;
let spineAuthority: string;
let spineSource: string;
let bleedIn: number;
let safeInsetIn: number;
let hingeIn: number | null = null;

try {
  if (BINDING === 'PAPERBACK') {
    const res = resolvePaperbackSpine({ ink: INK, paper: PAPER, trim: TRIM, pageCount });
    spineIn = res.spineIn;
    spineExplanation = res.explanation;
    spineAuthority = res.authority;
    spineSource = `${res.source.topic} (read ${res.source.retrieved})`;
    bleedIn = PAPERBACK_RULES.bleedIn.value;
    safeInsetIn = PAPERBACK_RULES.safeFromOutsideEdgeIn.value;
  } else {
    const dims = getKdpCoverDimensions({
      binding: 'HARDCOVER',
      coverType: 'CASE_LAMINATE',
      interiorType: INK,
      paperType: PAPER,
      trimSize: TRIM as never,
      pageCount,
    });
    spineIn = dims.spineIn;
    spineExplanation =
      dims.provenance === 'verified'
        ? `${spineIn}in — read from the KDP Cover Calculator for this exact configuration`
        : `${spineIn}in — interpolated between verified calculator readings`;
    spineAuthority = 'calculator-fixture';
    spineSource = dims.note;
    bleedIn = HARDCOVER_RULES.caseWrapIn.value;
    safeInsetIn = HARDCOVER_RULES.safeFromEdgeIn.value;
    hingeIn = HARDCOVER_RULES.hingeIn.value;
  }
} catch (e) {
  if (e instanceof UnverifiedKdpConfigurationError) die(e.message, 3);
  die(`UNVERIFIED KDP CONFIGURATION — official calculator/template required\n\n${(e as Error).message}`, 3);
}

const fullWidthIn = trimW * 2 + spineIn + bleedIn * 2;
const fullHeightIn = trimH + bleedIn * 2;
const backX = bleedIn;
const spineX = bleedIn + trimW;
const frontX = bleedIn + trimW + spineIn;

const backPanel = rect(backX, bleedIn, trimW, trimH);
const spinePanel = rect(spineX, 0, spineIn, fullHeightIn);
const frontPanel = rect(frontX, bleedIn, trimW, trimH);
const safe = (p: Rect): Rect =>
  rect(p.xIn + safeInsetIn, p.yIn + safeInsetIn, p.widthIn - safeInsetIn * 2, p.heightIn - safeInsetIn * 2);

const foldVariance = BINDING === 'PAPERBACK' ? PAPERBACK_RULES.foldVarianceIn.value : HARDCOVER_RULES.hingeIn.value;
const spineSafe = rect(spineX + foldVariance, 0, Math.max(0, spineIn - foldVariance * 2), fullHeightIn);
const spineTextEligible = BINDING === 'PAPERBACK' ? pageCount >= PAPERBACK_RULES.spineTextMinPages.value : true;

/** Barcode reserve: bottom-right of the BACK cover, which is the spine side when viewed. */
const bc = BINDING === 'PAPERBACK' ? PAPERBACK_RULES.barcodeReserve.value : HARDCOVER_RULES.barcode.value;
const bcFromBottom = BINDING === 'HARDCOVER' ? HARDCOVER_RULES.barcode.value.fromBottomIn : 0.25;
const barcodeSafe = rect(
  backPanel.xIn + backPanel.widthIn - 0.25 - bc.widthIn,
  backPanel.yIn + backPanel.heightIn - bcFromBottom - bc.heightIn,
  bc.widthIn,
  bc.heightIn,
);

const limit = pageCountLimit(BINDING, INK, PAPER);

const result = {
  interior: INTERIOR,
  pageCount,
  binding: BINDING,
  ink: INK,
  paper: PAPER,
  trim: { widthIn: trimW, heightIn: trimH },
  bleedIn: r3(bleedIn),
  spine: { widthIn: r3(spineIn), authority: spineAuthority, source: spineSource, explanation: spineExplanation },
  wrap: {
    widthIn: r3(fullWidthIn),
    heightIn: r3(fullHeightIn),
    widthPx: Math.round(fullWidthIn * 300),
    heightPx: Math.round(fullHeightIn * 300),
    dpi: 300,
    explanation:
      `width  = ${bleedIn} + ${trimW} + ${r3(spineIn)} + ${trimW} + ${bleedIn} = ${r3(fullWidthIn)}in\n` +
      `height = ${bleedIn} + ${trimH} + ${bleedIn} = ${r3(fullHeightIn)}in`,
  },
  panels: { back: backPanel, spine: spinePanel, front: frontPanel },
  safeZones: { back: safe(backPanel), front: safe(frontPanel), spine: spineSafe, insetIn: safeInsetIn },
  folds: { leftIn: r3(spineX), rightIn: r3(frontX), varianceIn: foldVariance },
  hingeIn,
  spineText: {
    eligible: spineTextEligible,
    minPages: BINDING === 'PAPERBACK' ? PAPERBACK_RULES.spineTextMinPages.value : null,
    clearancePerSideIn: BINDING === 'PAPERBACK' ? PAPERBACK_RULES.spineTextSafeIn.value : null,
    note:
      BINDING === 'PAPERBACK' && !spineTextEligible
        ? `KDP prints spine text only on books with more than 79 pages; this is ${pageCount}.`
        : undefined,
  },
  barcodeSafe,
  pageCountLimit: limit ? { min: limit.min, max: limit.max, source: limit.source.topic } : null,
  minDpi: BINDING === 'PAPERBACK' ? PAPERBACK_RULES.minDpi.value : HARDCOVER_RULES.minDpi.value,
};

// ── Proof ────────────────────────────────────────────────────────────────────
if (PROOF) {
  const DPI = 150;
  const px = (i: number) => Math.round(i * DPI);
  const W = px(fullWidthIn);
  const H = px(fullHeightIn);
  const box = (r: Rect, stroke: string, dash: string, label?: string, labelDy = 16) =>
    `<rect x="${px(r.xIn)}" y="${px(r.yIn)}" width="${px(r.widthIn)}" height="${px(r.heightIn)}" fill="none" ` +
    `stroke="${stroke}" stroke-width="2" stroke-dasharray="${dash}"/>` +
    (label
      ? `<text x="${px(r.xIn) + 6}" y="${px(r.yIn) + labelDy}" font-family="monospace" font-size="12" fill="${stroke}">${label}</text>`
      : '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<rect width="${W}" height="${H}" fill="#e9ebed"/>` +
    `<rect x="${px(backPanel.xIn)}" y="${px(backPanel.yIn)}" width="${px(trimW)}" height="${px(trimH)}" fill="#ffffff"/>` +
    `<rect x="${px(frontPanel.xIn)}" y="${px(frontPanel.yIn)}" width="${px(trimW)}" height="${px(trimH)}" fill="#ffffff"/>` +
    `<rect x="${px(spineX)}" y="0" width="${px(spineIn)}" height="${H}" fill="#dfe4e8"/>` +
    box(backPanel, '#00a0c8', '10 6', 'BACK trim') +
    box(frontPanel, '#00a0c8', '10 6', 'FRONT trim') +
    box(safe(backPanel), '#c8a000', '6 5', `safe ${safeInsetIn}in`) +
    box(safe(frontPanel), '#c8a000', '6 5', `safe ${safeInsetIn}in`) +
    box(spineSafe, '#8a5a10', '4 4') +
    box(barcodeSafe, '#a32d20', '0', 'barcode') +
    `<line x1="${px(spineX)}" y1="0" x2="${px(spineX)}" y2="${H}" stroke="#d000a0" stroke-width="2"/>` +
    `<line x1="${px(frontX)}" y1="0" x2="${px(frontX)}" y2="${H}" stroke="#d000a0" stroke-width="2"/>` +
    `<text x="8" y="${H - 10}" font-family="monospace" font-size="13" fill="#14181c">` +
    `${BINDING} ${INK} ${PAPER} ${TRIM}in ${pageCount}pp — spine ${r3(spineIn)}in — wrap ${r3(fullWidthIn)} x ${r3(fullHeightIn)}in` +
    `</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(PROOF);
}

// ── Output ───────────────────────────────────────────────────────────────────
if (AS_JSON) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const L = (k: string, v: string) => `  ${k.padEnd(22)}${v}`;
  const rc = (r: Rect) => `x ${r.xIn.toFixed(4)}  y ${r.yIn.toFixed(4)}  ${r.widthIn.toFixed(4)} x ${r.heightIn.toFixed(4)}in`;
  console.log('');
  console.log(`COVER SPECIFICATION — ${BINDING} · ${INK} · ${PAPER} paper · ${TRIM}in`);
  console.log('─'.repeat(78));
  console.log(L('interior', INTERIOR));
  console.log(L('page count', `${pageCount}  (read from the PDF, not supplied)`));
  if (limit) console.log(L('printable range', `${limit.min}-${limit.max}pp  · ${limit.source.topic}`));
  console.log('');
  console.log(L('spine', `${r3(spineIn)}in`));
  console.log(L('', spineExplanation));
  console.log(L('authority', spineAuthority));
  console.log(L('source', spineSource));
  console.log('');
  for (const line of result.wrap.explanation.split('\n')) console.log(L('wrap', line));
  console.log(L('at 300 DPI', `${result.wrap.widthPx} x ${result.wrap.heightPx} px`));
  console.log('');
  console.log(L('back panel', rc(backPanel)));
  console.log(L('spine panel', rc(spinePanel)));
  console.log(L('front panel', rc(frontPanel)));
  console.log(L(`safe (${safeInsetIn}in)`, rc(safe(backPanel))));
  console.log(L('', rc(safe(frontPanel))));
  console.log(L('spine safe', rc(spineSafe)));
  console.log(L('folds at', `${result.folds.leftIn}in and ${result.folds.rightIn}in  (variance ${foldVariance}in either side)`));
  if (hingeIn !== null) console.log(L('hinge', `${hingeIn}in from the spine on each cover`));
  console.log(L('barcode reserve', rc(barcodeSafe)));
  console.log('');
  console.log(L('spine text', spineTextEligible ? 'ELIGIBLE' : `NOT ELIGIBLE — ${result.spineText.note}`));
  console.log(L('minimum DPI', String(result.minDpi)));
  if (PROOF) console.log(L('proof', PROOF));
  console.log('');
}
