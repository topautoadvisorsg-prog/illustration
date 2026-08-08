/**
 * SPOT VERIFIER — crops only the disputed line, never the page.
 *
 * A single `;` printed as `,` does not justify loading a 1024x1536 page into an
 * agent's context, and doing that repeatedly is what made agent cost dominate
 * this project. This locates the disputed token via tesseract word boxes, cuts
 * a one-line strip around it, and stacks every strip from every page into ONE
 * labelled montage. Ten disputed spots become one small image instead of ten
 * full pages.
 *
 * It renders evidence for a human to read. It decides nothing.
 *
 * Usage:
 *   tsx scripts/verify-spot.ts <pageKey>:<sourceToken> [...] --out montage.png
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { and, desc, eq } from 'drizzle-orm';
import { readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';

import { P } from './_project.js';
import { getEnv } from '../src/env.js';
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';

const UPSCALE = 3;
const OCR_REPORTS = ['./ocr-screen-45.json', './ocr-calibration.json', './ocr-textheavy-11.json'];

interface Box { x0: number; y0: number; x1: number; y1: number }
interface Word { text: string; confidence: number; bbox: Box }

const bare = (s: string): string => s.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();

/** Source context around the disputed token, so we can anchor on a rare word. */
function contextFor(pageKey: string, token: string): string[] {
  for (const f of OCR_REPORTS) {
    if (!existsSync(f)) continue;
    const j = JSON.parse(readFileSync(f, 'utf8'));
    const r = (j.results ?? []).find((x: any) => x.pageKey === pageKey);
    if (!r) continue;
    for (const b of r.blocks) {
      for (const m of b.mismatches) {
        if (bare(m.expected) === bare(token)) {
          return b.expected.slice(Math.max(0, m.at - 4), m.at + 5);
        }
      }
      const idx = b.expected.findIndex((t: string) => bare(t) === bare(token));
      if (idx !== -1) return b.expected.slice(Math.max(0, idx - 4), idx + 5);
    }
  }
  return [token];
}

async function fetchPng(pageKey: string, renderId: string): Promise<Buffer> {
  const env = getEnv();
  const c = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  const out = await c.send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: `${P}/experimental/whole-page/${pageKey}-${renderId}.png` }),
  );
  return Buffer.from(await out.Body!.transformToByteArray());
}

async function wordsOf(worker: Worker, png: Buffer): Promise<{ words: Word[]; img: Buffer; w: number; h: number }> {
  const meta = await sharp(png).metadata();
  const img = await sharp(png)
    .resize({ width: (meta.width ?? 1024) * UPSCALE, kernel: 'lanczos3' })
    .grayscale()
    .normalise()
    .png()
    .toBuffer();
  const { data } = await worker.recognize(img, {}, { blocks: true });
  const words: Word[] = [];
  const walk = (n: any): void => {
    if (!n) return;
    if (Array.isArray(n)) return void n.forEach(walk);
    const kid = ['blocks', 'paragraphs', 'lines', 'words'].find((k) => Array.isArray(n[k]) && n[k].length);
    if (kid) return void walk(n[kid]);
    if (typeof n.text === 'string' && n.bbox) words.push({ text: n.text, confidence: n.confidence ?? 0, bbox: n.bbox });
  };
  walk((data as any).blocks);
  const m2 = await sharp(img).metadata();
  return { words, img, w: m2.width ?? 0, h: m2.height ?? 0 };
}

async function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const out = outIdx === -1 ? './spot-montage.png' : argv[outIdx + 1]!;
  const targets = argv.filter((a, i) => a.includes(':') && argv[i - 1] !== '--out');

  const db = getDb();
  const worker = await createWorker('eng');
  const strips: Array<{ buf: Buffer; label: string }> = [];

  // group by page so each page is fetched and OCR'd exactly once
  const byPage = new Map<string, string[]>();
  for (const t of targets) {
    const [pk, tok] = t.split(':');
    byPage.set(pk!, [...(byPage.get(pk!) ?? []), tok!]);
  }

  for (const [pageKey, tokens] of byPage) {
    const [page] = await db.select().from(pages).where(and(eq(pages.projectId, P), eq(pages.pageKey, pageKey))).limit(1);
    if (!page) continue;
    const [render] = await db
      .select()
      .from(wholePageRenders)
      .where(and(eq(wholePageRenders.pageId, page.id), eq(wholePageRenders.status, 'RENDERED' as any)))
      .orderBy(desc(wholePageRenders.version))
      .limit(1);
    if (!render) continue;

    const { words, img, w, h } = await wordsOf(worker, await fetchPng(pageKey, render.id));

    for (const token of tokens) {
      const ctx = contextFor(pageKey, token);
      // Anchor on a word that occurs EXACTLY ONCE on the page. A common word
      // like "not" or "here" lands on the wrong instance and the strip shows a
      // sentence that was never in dispute.
      const occurrences = (a: string): number => words.filter((wd) => bare(wd.text) === bare(a)).length;
      const candidates = [token, ...ctx].filter((a) => bare(a).length >= 4);
      const unique = candidates.filter((a) => occurrences(a) === 1);
      const anchors = (unique.length ? unique : candidates).sort((a, b) => bare(b).length - bare(a).length);
      let hit: Word | undefined;
      for (const a of anchors) {
        hit = words.find((wd) => bare(wd.text) === bare(a));
        if (hit) break;
      }
      if (!hit) {
        console.error(`  ${pageKey}:${token} — anchor not located`);
        continue;
      }
      // Two lines tall and wide enough to carry the disputed mark, which sits
      // to the RIGHT of the anchor and was being cropped off.
      const lineH = hit.bbox.y1 - hit.bbox.y0;
      const top = Math.max(0, hit.bbox.y0 - lineH);
      const height = Math.min(h - top, lineH * 4);
      const left = Math.max(0, hit.bbox.x0 - Math.round(w * 0.06));
      const width = Math.min(w - left, Math.round(w * 0.62));
      const buf = await sharp(img).extract({ left, top, width, height }).resize({ width: 1200 }).png().toBuffer();
      strips.push({ buf, label: `${pageKey}  «${token}»` });
      console.error(`  ${pageKey}:${token} — strip cut at y=${top}`);
    }
  }
  await worker.terminate();

  if (strips.length === 0) {
    console.error('no strips produced');
    process.exit(1);
  }

  // stack strips with a label bar above each
  const LABEL_H = 34;
  const parts: Array<{ input: Buffer; top: number; left: number }> = [];
  let y = 0;
  for (const s of strips) {
    const m = await sharp(s.buf).metadata();
    const label = await sharp({
      create: { width: 1200, height: LABEL_H, channels: 3, background: { r: 20, g: 20, b: 28 } },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="1200" height="${LABEL_H}"><text x="8" y="24" font-family="monospace" font-size="20" fill="#7fd1ff">${s.label}</text></svg>`,
          ),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();
    parts.push({ input: label, top: y, left: 0 });
    y += LABEL_H;
    parts.push({ input: s.buf, top: y, left: 0 });
    y += m.height ?? 0;
  }
  await sharp({ create: { width: 1200, height: y, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .composite(parts)
    .png()
    .toFile(out);
  console.error(`\nmontage → ${out}  (${strips.length} strips, ${y}px tall)`);
  process.exit(0);
}

main();
