/**
 * TIER 1 — LOCAL OCR TEXT-FIDELITY GATE  (beta / calibration prototype)
 *
 * WHAT IT DOES
 * Reads back the words actually baked into a rendered page and diffs them,
 * token by token, against the exact text the render pipeline asked the image
 * model to print. Every defect this book has produced so far is word-level
 * corruption of text we already hold in the database (`follage` for foliage,
 * `subialpine`, `iis`, a comma where the source has a full stop). That is a
 * string diff, not a judgement call, so it does not need a vision model.
 *
 * WHAT IT IS NOT
 * This proves TEXT FIDELITY ONLY. It says nothing about composition, trim and
 * bleed safety, illustration accuracy, baked-in artwork labels, or visual
 * hierarchy. A page that passes here is "text matches source", never
 * "approved". Those checks need separate visual evidence.
 *
 * COST: local only. No OpenAI calls, no network beyond fetching the render
 * from R2, and NO writes to canonical approval state. Read-only by design.
 *
 * Usage:
 *   tsx scripts/ocr-text-fidelity.ts <pageKey> [<pageKey> ...] [--render <id>] [--json <path>] [--no-cache]
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { and, desc, eq } from 'drizzle-orm';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';

import { P } from './_project.js';
import { getEnv } from '../src/env.js';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { prepareRender } from '../src/pipeline/whole-page-render/render-whole-page.js';

const CACHE_DIR = path.join(process.cwd(), '.ocr-cache');
/** Upscale factor before OCR. print-prep itself is only a Lanczos upscale of
 *  this same raster to 300 DPI, so OCRing the upscale reads the very pixels
 *  that reach the printer. */
const UPSCALE = 3;

// ─────────────────────────── normalisation ───────────────────────────
// ONLY transformations that are genuinely typographic and meaning-preserving.
// A letter or a word changing is a defect and must survive normalisation.

function normalise(raw: string): string {
  return (
    raw
      .normalize('NFKC')
      // quotes and apostrophes: the renderer sets curly, the source holds straight
      .replace(/[‘’‚‛′´`]/g, "'")
      .replace(/[“”„‟″]/g, '"')
      // dashes: en/em/minus/non-breaking hyphen all print as a hyphen
      .replace(/[‐‑‒–—―−]/g, '-')
      // invisible characters
      .replace(/[­​‌‍﻿]/g, '')
      // ellipsis
      .replace(/…/g, '...')
      // a word broken across a line by the typesetter is still one word
      .replace(/-\s*\n\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

const tokenise = (s: string): string[] => normalise(s).split(' ').filter(Boolean);
/** Letters and digits only — used to tell a punctuation slip apart from a
 *  misspelling, since the two need different repair decisions. */
const lettersOnly = (t: string): string => t.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

// ───────────────────────── local alignment ─────────────────────────
// A whole-page LCS is the wrong tool here: tesseract interleaves the artwork
// with the text column, so the OCR stream is not in reading order and a global
// alignment shreds. Instead every source PARAGRAPH is located independently by
// Smith-Waterman local alignment over the OCR stream. Noise between paragraphs
// is then simply unaligned rather than corrupting the result, and each
// paragraph reports its own recovery score.

interface Mismatch {
  /** token index within the paragraph */
  at: number;
  expected: string;
  printed: string | null;
  lettersDiffer: boolean;
}

interface BlockResult {
  index: number;
  expected: string[];
  /** fraction of source tokens the OCR recovered exactly */
  recovery: number;
  mismatches: Mismatch[];
}

const MATCH = 2;
const MISMATCH = -1;
const GAP = -2;

function alignBlock(exp: string[], ocrStream: string[], index: number): BlockResult {
  const n = exp.length;
  const m = ocrStream.length;
  const expL = exp.map(lettersOnly);
  const ocrL = ocrStream.map(lettersOnly);

  // score[i][j] = best local alignment ending at exp[i-1] / ocr[j-1]
  const score: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const ptr: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  let best = 0;
  let bi = 0;
  let bj = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const d = score[i - 1]![j - 1]! + (expL[i - 1] === ocrL[j - 1] ? MATCH : MISMATCH);
      const up = score[i - 1]![j]! + GAP;
      const left = score[i]![j - 1]! + GAP;
      let s = d;
      let p = 1; // diagonal
      if (up > s) {
        s = up;
        p = 2; // gap in OCR (source token not printed)
      }
      if (left > s) {
        s = left;
        p = 3; // gap in source (extra OCR token)
      }
      if (s < 0) {
        s = 0;
        p = 0;
      }
      score[i]![j] = s;
      ptr[i]![j] = p;
      if (s > best) {
        best = s;
        bi = i;
        bj = j;
      }
    }
  }

  // traceback
  const pairs: Array<{ e: number; o: number | null }> = [];
  let i = bi;
  let j = bj;
  while (i > 0 && j > 0 && score[i]![j]! > 0) {
    const p = ptr[i]![j]!;
    if (p === 1) {
      pairs.push({ e: i - 1, o: j - 1 });
      i--;
      j--;
    } else if (p === 2) {
      pairs.push({ e: i - 1, o: null });
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();

  const mismatches: Mismatch[] = [];
  let matched = 0;
  const covered = new Set<number>();
  for (const { e, o } of pairs) {
    covered.add(e);
    const printed = o === null ? null : ocrStream[o]!;
    if (printed !== null && lettersOnly(exp[e]!) === lettersOnly(printed)) {
      matched++;
      // exact letters, but punctuation may still differ (rock, vs rock.)
      if (exp[e] !== printed) {
        mismatches.push({ at: e, expected: exp[e]!, printed, lettersDiffer: false });
      }
    } else {
      mismatches.push({ at: e, expected: exp[e]!, printed, lettersDiffer: true });
    }
  }
  // source tokens the alignment never reached at all
  for (let k = 0; k < n; k++) {
    if (!covered.has(k)) mismatches.push({ at: k, expected: exp[k]!, printed: null, lettersDiffer: true });
  }
  mismatches.sort((a, b) => a.at - b.at);

  return { index, expected: exp, recovery: n === 0 ? 1 : matched / n, mismatches };
}

// ─────────────────────────── expected text ───────────────────────────
/** The words the pipeline actually asked the model to print — title block plus
 *  body blocks. Deliberately NOT `pages.readingFieldText`: that still carries
 *  markdown and header metadata (habitat, tagline) which the prompt strips, so
 *  diffing against it invents defects that are not on the page. */
async function expectedBlocksFor(pageId: string): Promise<string[]> {
  const { spec } = await prepareRender(pageId);
  const pt = (spec as any).pageText;
  if (!pt) throw new Error('spec has no pageText; keys=' + Object.keys(spec as any).join(','));
  const parts: string[] = [];
  const t = pt.title ?? {};
  for (const k of ['kicker', 'number', 'name', 'scientificName'] as const) {
    if (t[k]) parts.push(String(t[k]));
  }
  const blocks: Array<{ text: string }> = pt.bodyBlocks ?? [];
  for (const b of blocks) if (b?.text) parts.push(b.text);
  return parts.filter((p) => p.trim().length > 0);
}

// ─────────────────────────────── OCR ───────────────────────────────

async function fetchRenderPng(projectId: string, pageKey: string, renderId: string): Promise<Buffer> {
  const env = getEnv();
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  const key = `${projectId}/experimental/whole-page/${pageKey}-${renderId}.png`;
  const out = await client.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  return Buffer.from(await out.Body!.transformToByteArray());
}

/** Words tesseract is reasonably sure about. Artwork read as text comes back
 *  with very low confidence, so this drops the illustration noise without
 *  touching real body copy. Kept deliberately permissive: a genuinely corrupt
 *  word must still survive the filter, otherwise the gate hides the defect it
 *  exists to find. */
const MIN_WORD_CONFIDENCE = 40;

async function ocr(worker: Worker, png: Buffer): Promise<{ tokens: string[]; raw: string; dropped: number }> {
  const meta = await sharp(png).metadata();
  const prepped = await sharp(png)
    .resize({ width: (meta.width ?? 1024) * UPSCALE, kernel: 'lanczos3' })
    .grayscale()
    .normalise()
    .png()
    .toBuffer();
  const { data } = await worker.recognize(prepped, {}, { text: true, blocks: true });

  const words: Array<{ text: string; confidence: number }> = [];
  const walk = (node: any): void => {
    if (!node) return;
    if (Array.isArray(node)) return void node.forEach(walk);
    const CHILDREN = ['blocks', 'paragraphs', 'lines', 'words'] as const;
    const child = CHILDREN.find((k) => Array.isArray(node[k]) && node[k].length > 0);
    if (child) return void walk(node[child]);
    // leaf: a word, with no child collection of its own
    if (typeof node.text === 'string' && typeof node.confidence === 'number') {
      words.push({ text: node.text, confidence: node.confidence });
    }
  };
  walk((data as any).blocks);

  if (words.length === 0) {
    // fall back to the flat text if the structured output is unavailable
    return { tokens: tokenise(data.text), raw: data.text, dropped: 0 };
  }
  const kept = words.filter((w) => w.confidence >= MIN_WORD_CONFIDENCE);
  const tokens = kept.flatMap((w) => tokenise(w.text));
  return { tokens, raw: data.text, dropped: words.length - kept.length };
}

// ─────────────────────────────── main ───────────────────────────────

interface PageResult {
  pageKey: string;
  renderId: string;
  version: number | null;
  expectedTokens: number;
  ocrTokens: number;
  droppedLowConfidence: number;
  blocks: BlockResult[];
  /** overall fraction of source tokens recovered exactly */
  recovery: number;
  letterDefects: number;
  punctuationDefects: number;
  ocrMs: number;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const jsonOut = flag('--json');
  const forcedRender = flag('--render');
  const noCache = argv.includes('--no-cache');
  const pageKeys = argv.filter((a, i) => !a.startsWith('--') && !['--render', '--json'].includes(argv[i - 1] ?? ''));

  if (pageKeys.length === 0) {
    console.error('usage: tsx scripts/ocr-text-fidelity.ts <pageKey> [...] [--render <id>] [--json <path>] [--no-cache]');
    process.exit(2);
  }

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const db = getDb();
  const worker = await createWorker('eng');
  const results: PageResult[] = [];

  for (const pageKey of pageKeys) {
    const [page] = await db
      .select()
      .from(pages)
      .where(and(eq(pages.projectId, P), eq(pages.pageKey, pageKey)))
      .limit(1);
    if (!page) {
      console.error(`SKIP ${pageKey}: not found in project`);
      continue;
    }

    let renderId = forcedRender;
    let version: number | null = null;
    if (!renderId) {
      const [latest] = await db
        .select()
        .from(wholePageRenders)
        .where(and(eq(wholePageRenders.pageId, page.id), eq(wholePageRenders.status, 'RENDERED' as any)))
        .orderBy(desc(wholePageRenders.version))
        .limit(1);
      if (!latest) {
        console.error(`SKIP ${pageKey}: no RENDERED render`);
        continue;
      }
      renderId = latest.id;
      version = latest.version ?? null;
    }

    const expectedBlocks = await expectedBlocksFor(page.id);
    const cachePath = path.join(CACHE_DIR, `${pageKey}-${renderId}.json`);

    let ocrTokens: string[];
    let dropped = 0;
    let ocrMs = 0;
    if (!noCache && existsSync(cachePath)) {
      const c = JSON.parse(readFileSync(cachePath, 'utf8'));
      ocrTokens = c.tokens;
      dropped = c.dropped ?? 0;
    } else {
      const png = await fetchRenderPng(P, pageKey, renderId!);
      const t0 = Date.now();
      const r = await ocr(worker, png);
      ocrMs = Date.now() - t0;
      ocrTokens = r.tokens;
      dropped = r.dropped;
      writeFileSync(cachePath, JSON.stringify({ tokens: r.tokens, dropped: r.dropped, raw: r.raw }), 'utf8');
    }

    const blocks = expectedBlocks.map((b, idx) => alignBlock(tokenise(b), ocrTokens, idx));
    const expTotal = blocks.reduce((s, b) => s + b.expected.length, 0);
    const matchedTotal = blocks.reduce((s, b) => s + b.recovery * b.expected.length, 0);
    results.push({
      pageKey,
      renderId: renderId!,
      version,
      expectedTokens: expTotal,
      ocrTokens: ocrTokens.length,
      droppedLowConfidence: dropped,
      blocks,
      recovery: expTotal === 0 ? 1 : matchedTotal / expTotal,
      letterDefects: blocks.reduce((s, b) => s + b.mismatches.filter((m) => m.lettersDiffer).length, 0),
      punctuationDefects: blocks.reduce((s, b) => s + b.mismatches.filter((m) => !m.lettersDiffer).length, 0),
      ocrMs,
    });
  }

  await worker.terminate();

  // ── report ──
  for (const r of results) {
    console.log(`\n${'═'.repeat(74)}`);
    console.log(`${r.pageKey}  v${r.version ?? '?'}  render=${r.renderId}`);
    console.log(
      `source ${r.expectedTokens} tokens · OCR kept ${r.ocrTokens} (dropped ${r.droppedLowConfidence} low-confidence) · ` +
        `recovery ${(r.recovery * 100).toFixed(1)}% · ${r.letterDefects} letter, ${r.punctuationDefects} punctuation · ` +
        `${r.ocrMs || 'cached'}ms`,
    );
    for (const b of r.blocks) {
      const flagged = b.mismatches.filter((m) => m.printed !== null);
      const unread = b.mismatches.length - flagged.length;
      console.log(
        `  block ${b.index} (${b.expected.length} tok) recovery ${(b.recovery * 100).toFixed(1)}%` +
          (unread ? ` · ${unread} source tokens OCR never read` : ''),
      );
      for (const m of flagged) {
        const ctxL = b.expected.slice(Math.max(0, m.at - 3), m.at).join(' ');
        const ctxR = b.expected.slice(m.at + 1, m.at + 4).join(' ');
        console.log(`    [${m.lettersDiffer ? 'LETTERS' : 'punct  '}] ...${ctxL} 〔${m.expected}〕 ${ctxR}...`);
        console.log(`              printed: 〔${m.printed}〕`);
      }
    }
  }

  if (jsonOut) {
    writeFileSync(jsonOut, JSON.stringify({ projectId: P, generatedAt: new Date().toISOString(), results }, null, 2), 'utf8');
    console.log(`\nJSON → ${jsonOut}`);
  }
  console.log('\nRead-only. No canonical state was written. TEXT FIDELITY ONLY — not a publication-quality verdict.');
  process.exit(0);
}

main();
