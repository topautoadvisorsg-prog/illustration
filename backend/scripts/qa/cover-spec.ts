/**
 * cover-spec — what the geometry IS, without building anything.
 *
 * The reporting half of the cover system. `build-cover` makes the file; this
 * answers "what should it be, and who says so" for an operator holding a final
 * interior and about to commission artwork. Every dimension prints WITH ITS
 * ARITHMETIC, so the number can be checked rather than trusted.
 *
 *   tsx scripts/qa/cover-spec.ts --interior final-interior.pdf \
 *       --binding paperback --ink bw --paper white --trim 6x9
 *
 *   --json            structured output instead of the report
 *   --proof out.png   geometry proof: panels, safe zones, folds, hinges, barcode
 *
 * THERE IS NO --pages FLAG, deliberately. A typed page count cannot be wrong
 * loudly, and a wrong spine is scrap paper and a reprint.
 *
 * FAILS CLOSED. A configuration the verified specification cannot serve gets
 * UNVERIFIED KDP CONFIGURATION and exit 3, never the nearest factor.
 *
 * Since Phase 1C this file holds NO geometry of its own. Every figure comes from
 * `pipeline/cover/compositor/geometry.ts`, the same resolver the compositor
 * uses, so a spec printed here and a cover built by that tool cannot disagree.
 *
 * Free: reads a PDF, does arithmetic, optionally draws a PNG. No model, no
 * network, no database.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { readInteriorPageCount } from '../../src/pipeline/cover/compositor/build-cover.js';
import { resolveCoverGeometry } from '../../src/pipeline/cover/compositor/geometry.js';
import type { Rect } from '../../src/pipeline/cover/compositor/geometry.js';
import { renderProof } from '../../src/pipeline/cover/compositor/proof.js';
import { UnverifiedKdpConfigurationError } from '../../src/pipeline/publishing-standard/kdp-spec.js';
import type { KdpBinding, KdpInk, KdpPaper } from '../../src/pipeline/publishing-standard/kdp-spec.js';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const i = argv.indexOf(hit);
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : '';
};
const has = (name: string) => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const die = (msg: string, code = 1): never => {
  console.error(msg);
  process.exit(code);
};

const INTERIOR = flag('interior');
if (!INTERIOR) die('cover-spec: --interior <final interior PDF> is required. The page count is read from it.');

const BINDINGS: Record<string, KdpBinding> = { paperback: 'PAPERBACK', hardcover: 'HARDCOVER' };
const INKS: Record<string, KdpInk> = {
  bw: 'BLACK_AND_WHITE',
  'black-and-white': 'BLACK_AND_WHITE',
  premium: 'PREMIUM_COLOR',
  standard: 'STANDARD_COLOR',
};
const PAPERS: Record<string, KdpPaper> = { white: 'WHITE', cream: 'CREAM', groundwood: 'GROUNDWOOD' };

const BINDING = BINDINGS[(flag('binding') ?? 'paperback').toLowerCase()];
const INK = INKS[(flag('ink') ?? 'bw').toLowerCase()];
const PAPER = PAPERS[(flag('paper') ?? 'white').toLowerCase()];
if (!BINDING) die(`cover-spec: --binding must be one of ${Object.keys(BINDINGS).join(', ')}.`);
if (!INK) die(`cover-spec: --ink must be one of ${Object.keys(INKS).join(', ')}.`);
if (!PAPER) die(`cover-spec: --paper must be one of ${Object.keys(PAPERS).join(', ')}.`);
const TRIM = flag('trim') ?? '6x9';
const PROOF = flag('proof');

const pageCount = await readInteriorPageCount(readFileSync(INTERIOR));

let g: ReturnType<typeof resolveCoverGeometry>;
try {
  g = resolveCoverGeometry({ binding: BINDING, ink: INK, paper: PAPER, trim: TRIM, pageCount });
} catch (e) {
  if (e instanceof UnverifiedKdpConfigurationError) die(e.message, 3);
  throw e;
}

const r3 = (n: number) => Number(n.toFixed(6));
const rc = (r: Rect) =>
  `x ${r.xIn.toFixed(4)}  y ${r.yIn.toFixed(4)}  ${r.widthIn.toFixed(4)} x ${r.heightIn.toFixed(4)}in`;

if (PROOF) {
  // Geometry-only proof: guides over a blank ground, no artwork involved.
  const dpi = 150;
  const blank = await sharp({
    create: {
      width: Math.round(g.fullWidthIn * dpi),
      height: Math.round(g.fullHeightIn * dpi),
      channels: 3,
      background: { r: 233, g: 235, b: 237 },
    },
  })
    .png()
    .toBuffer();
  writeFileSync(PROOF, await renderProof(blank, g, { dpi, proofDpi: dpi }));
}

if (has('json')) {
  console.log(JSON.stringify({ interior: INTERIOR, ...g }, null, 2));
} else {
  const L = (k: string, v: string) => `  ${k.padEnd(22)}${v}`;
  console.log('');
  console.log(`COVER SPECIFICATION — ${g.binding} · ${g.ink} · ${g.paper} paper · ${g.trim}in`);
  console.log('─'.repeat(78));
  console.log(L('interior', INTERIOR!));
  console.log(L('page count', `${g.pageCount}  (read from the PDF, not supplied)`));
  if (g.pageCountRange)
    console.log(
      L('printable range', `${g.pageCountRange.min}-${g.pageCountRange.max}pp  · ${g.pageCountRange.source}`),
    );
  console.log('');
  console.log(L('spine', `${r3(g.spineIn)}in`));
  console.log(L('', g.spineExplanation));
  console.log(L('authority', g.spineAuthority));
  console.log(L('source', g.spineSource));
  console.log('');
  for (const line of g.wrapExplanation.split('\n')) console.log(L('wrap', line));
  console.log(L('at 300 DPI', `${Math.round(g.fullWidthIn * 300)} x ${Math.round(g.fullHeightIn * 300)} px`));
  console.log('');
  console.log(L('back panel', rc(g.backPanel)));
  console.log(L('spine panel', rc(g.spinePanel)));
  console.log(L('front panel', rc(g.frontPanel)));
  console.log(L(`safe (${g.safeInsetIn}in)`, rc(g.backSafe)));
  console.log(L('', rc(g.frontSafe)));
  console.log(L('spine safe', rc(g.spineSafe)));
  console.log(
    L('folds at', `${r3(g.foldLeftIn)}in and ${r3(g.foldRightIn)}in  (variance ${g.foldVarianceIn}in either side)`),
  );
  if (g.hingeIn !== null) console.log(L('hinge', `${g.hingeIn}in from the spine on each cover`));
  console.log(L('barcode reserve', rc(g.barcodeSafe)));
  console.log('');
  console.log(
    L(
      'spine text',
      g.spineTextEligible === null
        ? 'NOT PUBLISHED — KDP states no hardcover spine-text page minimum. Confirm in the Cover Calculator.'
        : g.spineTextEligible
          ? 'ELIGIBLE'
          : `NOT ELIGIBLE — KDP prints spine text only above ${(g.spineTextMinPages ?? 80) - 1} pages; this is ${g.pageCount}.`,
    ),
  );
  console.log(L('minimum DPI', String(g.minDpi)));
  if (PROOF) console.log(L('proof', PROOF));
  console.log('');
}
