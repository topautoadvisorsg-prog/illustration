/**
 * PART-DIVIDER ILLUSTRATION for 7 NATIONAL PARKS.
 *
 * Black-and-white, because this one goes INSIDE a black-and-white interior. The
 * cover is full colour; the divider is not, and the two rules are separate.
 *
 * ─── WHY STAMPED, NOT PLACED IN THE FLOW ──────────────────────────────────
 * An `<img>` in the typeset HTML is content: Paged.js flows it, and the moment
 * it flows, line breaks and page breaks can move. This book's 116 pages were
 * accepted against a measured baseline, and the SPINE OF AN APPROVED COVER is
 * computed from that number. A divider illustration is not allowed to spend it.
 *
 * So the art is stamped onto the finished PDF at fixed coordinates, anchored to
 * the stable block id of the part page's own heading. Page count, folios,
 * running heads and every line box are untouched by construction.
 *
 * Two steps, so nothing is generated blind:
 *   --blocks    list the part-divider block ids (free)
 *   --generate  generate the artwork (SPENDS ~$0.05)
 *
 *   npx tsx scripts/national-parks-divider-art.ts <projectId> --blocks
 *   npx tsx scripts/national-parks-divider-art.ts <projectId> --generate --confirm
 */
await import('../src/env.js');
process.env.CHROMIUM_PATH ??= 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const projectId = process.argv[2];
if (!projectId) throw new Error('usage: national-parks-divider-art.ts <projectId> --blocks|--generate');

const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject } = await import('../src/db/repositories/projects.repo.js');

const project = await getProject(projectId);
if (!project) throw new Error(`project ${projectId} not found`);
const config = ProjectConfigSchema.parse(project.config);

// ── List the part-divider blocks ───────────────────────────────────────────
if (process.argv.includes('--blocks')) {
  const { buildTypesetInterior } = await import('../src/pipeline/typeset/build-typeset-interior.js');
  const built = await buildTypesetInterior(projectId, config, { chaptersStartRecto: true });
  console.log(`interior : ${built.pageCount} pages\n`);
  const parts = built.blocks.filter((b) => /^part\s+\d/i.test(b.sectionTitle ?? ''));
  console.log('PART DIVIDER BLOCKS');
  for (const b of parts) {
    console.log(`  ${b.blockId}  [${b.sectionSlug}]  ${b.sectionTitle}`);
  }
  if (parts.length === 0) {
    console.log('  none found — check how part sections are titled');
    console.log('  sample section titles:', [...new Set(built.blocks.map((b) => b.sectionTitle))].slice(0, 12));
  }
  process.exit(0);
}

// ── Generate the artwork ───────────────────────────────────────────────────
if (!process.argv.includes('--generate')) throw new Error('pass --blocks or --generate');
if (!process.argv.includes('--confirm')) {
  console.error('REFUSING: --generate produces a paid image. Re-run with --confirm.');
  process.exit(1);
}

/**
 * THE MOTIF: a single continuous ridgeline of SEVEN distinct summits.
 *
 * It encodes the book's structure in one shape — seven parks, one range — and
 * it belongs to the section it introduces rather than being decoration that
 * could sit anywhere. Restrained on purpose: this is a divider, not a plate.
 */
const PROMPT = [
  'A single black-and-white pen-and-ink wood-engraving illustration for a book PART-DIVIDER page.',
  '',
  'SUBJECT: one continuous mountain ridgeline running left to right, made of SEVEN clearly distinct',
  'summits — each a different silhouette so they read as different places: a rounded granite dome, a',
  'flat-topped canyon rim with horizontal strata, a sharp alpine peak, a broad forested shoulder, a',
  'jagged spire, a long low ridge, and a rounded bluff. Below the ridge, a thin band of small conifer',
  'silhouettes. Nothing else. No figures, no buildings, no signs, no animals.',
  '',
  'STYLE: traditional wood engraving / scratchboard. PURE BLACK INK ON PURE WHITE. No greys, no',
  'gradients, no halftone dots, no wash. All tone built from carved parallel hatching and cross-hatching.',
  'Crisp confident silhouettes. High contrast. Restrained and elegant — this is a small divider ornament,',
  'not a poster.',
  '',
  'COMPOSITION: a wide horizontal band, roughly 4:1. The ridgeline is centred and symmetrical in weight,',
  'with clear white space above the summits and below the treeline so the shape reads instantly at a',
  'small printed size (about 3.5 inches wide).',
  '',
  'MUST NOT INCLUDE: no text, no letters, no numbers, no title, no logo, no watermark, no signature,',
  'no border, no frame, no colour of any kind, no photorealism, no perspective landscape, no sky detail,',
  'no sun, no clouds.',
  '',
  'OUTPUT: white background, full bleed to the edges of the image, no margins or matting.',
].join('\n');

console.log('PROMPT:\n');
console.log(PROMPT);
console.log('\ngenerating…');

const { generateImage } = await import('../src/services/openai/openai.js');
const t0 = Date.now();
const result = await generateImage({ prompt: PROMPT, size: '1536x1024', quality: 'high' });
console.log(`
generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`model  : ${result.model}`);
console.log(`pixels : ${result.widthPx} x ${result.heightPx}`);

const { writeFileSync } = await import('node:fs');
const out = 'C:/Users/jovan/Downloads/_np_build/part-divider-ridgeline.png';
writeFileSync(out, result.pngBuffer);
console.log(`file   : ${out} (${result.pngBuffer.length} bytes)`);
process.exit(0);
