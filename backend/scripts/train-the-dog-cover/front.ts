/**
 * TRAIN THE DOG YOU'VE GOT — FRONT COVER ONLY.
 *
 * Design proof. Front panel at 6x9 trim, artwork plus live type, nothing else:
 * no spine, no back, no barcode, no wrap. The full KDP wrap is built by
 * `build.ts` once the front is approved.
 *
 * Every word is LIVE TYPE. The artwork carries no lettering at all.
 *
 *   yarn tsx scripts/train-the-dog-cover/front.ts --art=<png> [--out=<stem>]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { AUTHOR, COVER_DIR } from './book.js';
import { FACES, LAYOUT, PALETTE, TITLE_BREAKS } from './design.js';
import { assertFontResolves, fitUniform, setStack } from './type.js';

const arg = (n: string, d?: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const ART = arg('art');
if (!ART) throw new Error('--art=<png> is required');
const STEM = arg('out', 'FRONT')!;
const BREAK = (arg('break', 'primary') as 'primary' | 'alternative');

for (const f of Object.values(FACES)) await assertFontResolves(f.family, f.weight);

/** Front cover at trim. 6 x 9in is what a reader sees; bleed is a wrap concern. */
const DPI = 300;
const W_IN = 6;
const H_IN = 9;
const WPX = W_IN * DPI;
const HPX = H_IN * DPI;
const px = (i: number) => i * DPI;
/** KDP: keep anything that must survive 0.25in inside the trim. */
const SAFE_IN = 0.25;

/**
 * The artwork is placed to FILL the panel, cropping the overflow, never
 * stretched. Aspect is preserved because a distorted dog is a distorted dog.
 */
const art = readFileSync(ART);
const meta = await sharp(art).metadata();

/**
 * PUSH THE SUBJECT DOWN, DON'T REGENERATE.
 *
 * The generated art puts the treat hand about 3.9in down, and the subtitle
 * block ends at about 4.4in — so the second and third subtitle lines printed
 * straight across the hand and the dog's muzzle. The fix is not another
 * generation: the background is one flat blue field, so the picture can be slid
 * down the panel and the space above it filled with the SAME blue, sampled from
 * the artwork itself rather than guessed at. The dog runs off the bottom trim,
 * which is what bleed is for.
 */
const shiftPx = Math.round(px(Number(arg('shift', String(LAYOUT.artShiftDownIn)))));
const scaled = await sharp(art).resize({ width: WPX, kernel: 'lanczos3' }).toBuffer();
/**
 * The vacated band is filled by STRETCHING THE ARTWORK'S OWN TOP ROW, not by a
 * flat colour sampled from a corner. The blue is not actually flat — it carries
 * a slight vertical gradient — so a sampled fill met the picture at a different
 * shade and drew a hard horizontal seam straight across the top of the cover.
 * Stretching row zero upward meets row zero exactly, so there is no seam to see.
 */
const topRow = await sharp(scaled).extract({ left: 0, top: 0, width: WPX, height: 2 }).toBuffer();
const base = await sharp({ create: { width: WPX, height: HPX, channels: 3, background: '#000' } })
  .composite([
    { input: await sharp(topRow).resize(WPX, shiftPx, { fit: 'fill' }).toBuffer(), left: 0, top: 0 },
    { input: scaled, left: 0, top: shiftPx },
  ])
  .png()
  .toBuffer();

/**
 * Positions are the wrap's positions less the bleed, so the front proof and the
 * final wrap put the type in exactly the same place on the panel.
 */
const BLEED_IN = 0.125;
const centreXPx = px(W_IN / 2);

const titleFit = await fitUniform(
  [...TITLE_BREAKS[BREAK]],
  FACES.title,
  px(LAYOUT.titleMeasureIn),
  px(LAYOUT.titleMaxCapIn),
);
const title = await setStack({
  lines: [...TITLE_BREAKS[BREAK]],
  style: FACES.title,
  centreXPx,
  firstBaselinePx: px(LAYOUT.titleTopIn - BLEED_IN) + titleFit.capPx,
  sizePx: titleFit.sizePx,
  leadingEm: LAYOUT.titleLeadingEm,
  fill: PALETTE.titleInk,
  halo: PALETTE.halo,
  haloEm: LAYOUT.titleHaloEm,
  wrapWidthPx: WPX,
  wrapHeightPx: HPX,
});

const subFit = await fitUniform(
  [...LAYOUT.subtitleLines],
  FACES.subtitle,
  px(LAYOUT.subtitleMeasureIn),
  px(LAYOUT.subtitleMaxCapIn),
);
const subtitle = await setStack({
  lines: [...LAYOUT.subtitleLines],
  style: FACES.subtitle,
  centreXPx,
  firstBaselinePx: title.ink.bottom + px(LAYOUT.subtitleGapIn) + subFit.capPx,
  sizePx: subFit.sizePx,
  leadingEm: LAYOUT.subtitleLeadingEm,
  fill: PALETTE.subtitleInk,
  halo: PALETTE.halo,
  haloEm: LAYOUT.haloEm,
  wrapWidthPx: WPX,
  wrapHeightPx: HPX,
});

const authorFit = await fitUniform([AUTHOR], FACES.author, px(LAYOUT.authorMaxWidthIn), px(LAYOUT.authorCapIn));
const author = await setStack({
  lines: [AUTHOR],
  style: FACES.author,
  centreXPx,
  firstBaselinePx: px(H_IN - LAYOUT.authorBaselineFromBottomIn),
  sizePx: authorFit.sizePx,
  leadingEm: 1,
  fill: PALETTE.authorInk,
  halo: PALETTE.halo,
  haloEm: LAYOUT.haloEm,
  wrapWidthPx: WPX,
  wrapHeightPx: HPX,
});

const cover = await sharp(base)
  .composite([title, subtitle, author].map((b) => ({ input: Buffer.from(b.svg), left: 0, top: 0 })))
  .toBuffer();

const DIR = `${COVER_DIR}/front`;
mkdirSync(DIR, { recursive: true });
writeFileSync(`${DIR}/${STEM}.png`, await sharp(cover).png().toBuffer());
writeFileSync(`${DIR}/${STEM}-THUMB.png`, await sharp(cover).resize({ width: 160, kernel: 'lanczos3' }).png().toBuffer());

/** Guides kept in a separate file, never in the deliverable. */
const g = (i: number) => Math.round(i * 150);
const guides =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${g(W_IN)}" height="${g(H_IN)}">` +
  `<rect x="${g(SAFE_IN)}" y="${g(SAFE_IN)}" width="${g(W_IN - SAFE_IN * 2)}" height="${g(H_IN - SAFE_IN * 2)}" ` +
  `fill="none" stroke="#c8a000" stroke-width="2" stroke-dasharray="6 5"/>` +
  [
    ['title', title.ink],
    ['subtitle', subtitle.ink],
    ['author', author.ink],
  ]
    .map(
      ([id, b]: any) =>
        `<rect x="${g(b.left / DPI)}" y="${g(b.top / DPI)}" width="${g((b.right - b.left) / DPI)}" ` +
        `height="${g((b.bottom - b.top) / DPI)}" fill="none" stroke="#12b886" stroke-width="1.5" stroke-dasharray="3 3"/>` +
        `<text x="${g(b.left / DPI)}" y="${g(b.top / DPI) - 3}" font-family="monospace" font-size="11" ` +
        `fill="#12b886" stroke="#fff" stroke-width="0.6" paint-order="stroke">${id}</text>`,
    )
    .join('') +
  '</svg>';
writeFileSync(
  `${DIR}/${STEM}-GUIDES.png`,
  await sharp(await sharp(cover).resize({ width: g(W_IN), height: g(H_IN), fit: 'fill' }).toBuffer())
    .composite([{ input: Buffer.from(guides), left: 0, top: 0 }])
    .png()
    .toBuffer(),
);

const clear = (b: { left: number; right: number; top: number; bottom: number }) => ({
  l: (b.left - px(SAFE_IN)) / DPI,
  r: (px(W_IN - SAFE_IN) - b.right) / DPI,
  t: (b.top - px(SAFE_IN)) / DPI,
  b: (px(H_IN - SAFE_IN) - b.bottom) / DPI,
});
const rows: Array<[string, ReturnType<typeof clear>]> = [
  ['title', clear(title.ink)],
  ['subtitle', clear(subtitle.ink)],
  ['author', clear(author.ink)],
];
const worst = Math.min(...rows.flatMap(([, c]) => [c.l, c.r, c.t, c.b]));

console.log(`\nFRONT COVER — ${STEM}`);
console.log(`  artwork        ${ART.split(/[\\/]/).pop()}  ${meta.width}x${meta.height}px`);
console.log(`  placed         ${WPX}x${HPX}px at ${DPI}dpi  =  ${((meta.width ?? 0) / W_IN).toFixed(0)} effective ppi`);
console.log(`  title          ${TITLE_BREAKS[BREAK].join(' / ')}`);
console.log(`  title size     ${titleFit.sizePx}px, cap ${(titleFit.capPx / DPI).toFixed(3)}in, ` +
  `${((titleFit.capPx / DPI) * (160 / W_IN)).toFixed(1)}px cap at 160px thumbnail`);
console.log(`  subtitle       ${subFit.sizePx}px, cap ${(subFit.capPx / DPI).toFixed(3)}in`);
console.log(`  author         ${authorFit.sizePx}px, baseline ${LAYOUT.authorBaselineFromBottomIn}in from bottom trim`);
console.log('  clearance to the 0.25in safe area, in inches (measured ink, halo included):');
for (const [id, c] of rows) {
  console.log(`    ${id.padEnd(9)} left ${c.l.toFixed(3)}  right ${c.r.toFixed(3)}  top ${c.t.toFixed(3)}  bottom ${c.b.toFixed(3)}`);
}
console.log(`  SAFE AREA      ${worst >= 0 ? `PASS — tightest ${worst.toFixed(3)}in` : `FAIL — over by ${Math.abs(worst).toFixed(3)}in`}`);
console.log(`  -> ${DIR}/${STEM}.png\n`);
