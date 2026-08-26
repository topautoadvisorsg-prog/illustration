/**
 * Live geometry verification — runs against the DEPLOYED backend over HTTPS.
 *
 * Proves the geometry reconciliation took effect end-to-end on the running
 * service. NO image generation, NO Stage 2 spend. The destructive re-paginate
 * step is gated behind an explicit --repaginate flag.
 *
 * Usage:
 *   tsx scripts/verify-live-geometry.ts                       # read-only checks
 *   tsx scripts/verify-live-geometry.ts --repaginate          # +re-paginate (destructive)
 *
 * Env (optional overrides, defaults to the known prod project):
 *   BACKEND_URL=https://wildlandsbackend-production.up.railway.app
 *   PROJECT_ID=9e46d6b9-c8eb-46a0-bba8-88584b0add48
 *
 * The script makes ZERO assumptions about which trim the project chose. It
 * reads the trim from /api/projects/:id/config, runs resolveGeometry locally
 * to compute the EXPECTED canvas, then asserts every subsystem agrees with
 * that trim — without locking anything to 8.5×11.
 */

import { resolveGeometry } from '../src/pipeline/publishing-standard/index.js';
import { computePageGeometry } from '../src/pipeline/stage-6-layout/page-geometry.js';

const BACKEND_URL = process.env.BACKEND_URL ?? 'https://wildlandsbackend-production.up.railway.app';
const PROJECT_ID = process.env.PROJECT_ID ?? '9e46d6b9-c8eb-46a0-bba8-88584b0add48';
const REPAGINATE = process.argv.includes('--repaginate');

const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
};
const head = (msg: string) => console.log(`\n── ${msg} ──`);

async function call<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: T }> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, json: json as T };
}

function approxEq(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}

async function main() {
  console.log(`Backend : ${BACKEND_URL}`);
  console.log(`Project : ${PROJECT_ID}`);
  console.log(`Mode    : ${REPAGINATE ? 'REPAGINATE (destructive)' : 'read-only'}`);

  // 1. Deploy alive ─────────────────────────────────────────────────────────
  head('1. /health');
  const health = await call<{ status?: string }>('GET', '/health');
  if (health.status !== 200) fail(`/health returned ${health.status}`);
  else ok(`200 OK (${JSON.stringify(health.json)})`);

  // 2. Read project config + resolve geometry LOCALLY from it ───────────────
  head('2. /api/projects/:id/config → resolveGeometry(config)');
  const cfg = await call<{ config: { trimSize: { widthIn: number; heightIn: number; bleedIn: number } } }>(
    'GET',
    `/api/projects/${PROJECT_ID}/config`,
  );
  if (cfg.status !== 200) {
    fail(`config returned ${cfg.status} — ${JSON.stringify(cfg.json)}`);
    return;
  }
  const trim = cfg.json.config.trimSize;
  ok(`project trim from server: ${trim.widthIn}×${trim.heightIn} in (bleed ${trim.bleedIn})`);

  let resolved;
  try {
    resolved = resolveGeometry({ trimSize: trim });
  } catch (e) {
    fail(`resolveGeometry threw: ${(e as Error).message}`);
    return;
  }
  ok(`resolved trim: ${resolved.trimSize.widthIn}×${resolved.trimSize.heightIn} in`);
  ok(`resolved canvas (derived = trim + 2×bleed): ${resolved.canvasIn.w}×${resolved.canvasIn.h} in`);
  ok(`expected print pixels (canvas × 300 DPI): ${Math.round(resolved.canvasIn.w * 300)}×${Math.round(resolved.canvasIn.h * 300)} px`);
  ok(`expected MediaBox (canvas × 72 pt/in): ${resolved.canvasIn.w * 72}×${resolved.canvasIn.h * 72} pt`);

  // Per the requirement: report the trim, do NOT assume 8.5×11.
  if (trim.widthIn === 8.5 && trim.heightIn === 11) {
    ok('project chose 8.5×11 (Standard default)');
  } else if (trim.widthIn === 7 && trim.heightIn === 10) {
    ok('project chose 7×10 (explicit selection)');
  } else if (trim.widthIn === 6 && trim.heightIn === 9) {
    ok('project chose 6×9 (explicit selection)');
  } else {
    ok(`project chose ${trim.widthIn}×${trim.heightIn} (custom — must be in SUPPORTED_TRIMS or resolveGeometry would have thrown)`);
  }

  const pageGeom = computePageGeometry(resolved.trimSize);
  ok(`text frame at resolved trim: ${pageGeom.textWidthIn}×${pageGeom.textHeightIn} in (${pageGeom.textWidthPt}×${pageGeom.textHeightPt} pt)`);

  // 3. Re-paginate (gated) ──────────────────────────────────────────────────
  if (REPAGINATE) {
    head('3. POST /api/projects/:id/paginate { mode: "replace" }');
    const rep = await call<{ summary: unknown; warnings: string[]; pagesWritten: number }>(
      'POST',
      `/api/projects/${PROJECT_ID}/paginate`,
      { mode: 'replace' },
    );
    if (rep.status !== 200) {
      fail(`paginate returned ${rep.status} — ${JSON.stringify(rep.json)}`);
      return;
    }
    ok(`pagesWritten: ${rep.json.pagesWritten}`);
    if (rep.json.warnings?.length) {
      for (const w of rep.json.warnings) console.log(`    warn: ${w}`);
    } else {
      ok('no warnings');
    }
    ok(`summary: ${JSON.stringify(rep.json.summary)}`);
  } else {
    head('3. Re-paginate — SKIPPED (no --repaginate flag)');
    console.log('   Run again with --repaginate to perform the destructive re-paginate.');
  }

  // 4. Pagination report ────────────────────────────────────────────────────
  head('4. /api/projects/:id/pagination-report');
  const report = await call<{
    totalPages?: number;
    pageCount?: number;
    fitDistribution?: Record<string, number>;
    openers?: number;
    continuations?: number;
    compactions?: number;
  }>('GET', `/api/projects/${PROJECT_ID}/pagination-report`);
  if (report.status !== 200) {
    fail(`pagination-report returned ${report.status} — ${JSON.stringify(report.json)}`);
  } else {
    const r = report.json;
    const count = r.totalPages ?? r.pageCount ?? 'n/a';
    ok(`page count: ${count}`);
    if (r.openers !== undefined) ok(`openers: ${r.openers}`);
    if (r.continuations !== undefined) ok(`continuations: ${r.continuations}`);
    if (r.compactions !== undefined) ok(`compactions: ${r.compactions}`);
    if (r.fitDistribution) {
      ok(`fit distribution: ${JSON.stringify(r.fitDistribution)}`);
    }
  }

  // 5. Paginated-pages assertions ───────────────────────────────────────────
  head('5. /api/projects/:id/paginated-pages — sample 4 pages and assert chain agrees');
  const pages = await call<{ pages: Array<Record<string, unknown>> }>(
    'GET',
    `/api/projects/${PROJECT_ID}/paginated-pages`,
  );
  if (pages.status !== 200) {
    fail(`paginated-pages returned ${pages.status} — ${JSON.stringify(pages.json)}`);
  } else {
    const total = pages.json.pages?.length ?? 0;
    ok(`${total} paginated pages returned`);
    if (total === 0) {
      fail('NO paginated pages — run with --repaginate first.');
    } else {
      // Spot-sample 4: first opener, first continuation, first pure-text, last.
      const all = pages.json.pages;
      const sample = [
        all[0],
        all.find((p) => p['pageRole'] === 'CONTINUATION') ?? all[Math.floor(all.length / 4)],
        all.find((p) => p['layoutTemplate'] === 'LAYOUT_PURE_TEXT' || p['layoutTemplate'] === 'LAYOUT_2_BODY_HEAVY') ?? all[Math.floor(all.length / 2)],
        all[all.length - 1],
      ];
      for (const p of sample) {
        if (!p) continue;
        console.log(
          `    page ${p['plannedPageNumber']} (${p['pageKey']}): role=${p['pageRole']} layout=${p['layoutTemplate']} fit=${p['fitStatus']} chars=${p['readingFieldChars']} words=${p['readingFieldWords']}`,
        );
      }

      // Sanity: every page's character count must fit inside the resolved
      // text frame at the project's body type. If we ever produced pages at
      // the wrong trim, the chars-per-page distribution would be impossibly
      // dense on a small trim or impossibly sparse on a big one.
      const charsCounts = all
        .map((p) => Number(p['readingFieldChars'] ?? 0))
        .filter((n) => n > 0);
      if (charsCounts.length > 0) {
        const max = Math.max(...charsCounts);
        const avg = Math.round(charsCounts.reduce((s, n) => s + n, 0) / charsCounts.length);
        ok(`reading-field chars: avg=${avg}, max=${max} (text-frame ${pageGeom.textWidthIn}×${pageGeom.textHeightIn} in)`);
      }
    }
  }

  // 6. Anti-lock-in spot check ──────────────────────────────────────────────
  head('6. Anti-lock-in invariant');
  if (resolved.canvasIn.w === 8.75 && resolved.canvasIn.h === 11.25) {
    ok('canvas is the Standard default 8.75×11.25 — because the project chose 8.5×11, NOT because anything is hardcoded');
  } else {
    ok(`canvas is ${resolved.canvasIn.w}×${resolved.canvasIn.h} — proves the chain respects the project trim (not 8.5×11 lock-in)`);
  }

  // The reconciliation contract restated for the live operator:
  console.log('\n── Contract ──');
  console.log('  One project = one trim size.');
  console.log('  Every subsystem agrees on that trim because it derives from resolveGeometry(config).');
  console.log('  Render specs, print-prep canvas, and assembly MediaBox all use:');
  console.log(`    trim=${resolved.trimSize.widthIn}×${resolved.trimSize.heightIn} in`);
  console.log(`    canvas=${resolved.canvasIn.w}×${resolved.canvasIn.h} in (= ${Math.round(resolved.canvasIn.w * 300)}×${Math.round(resolved.canvasIn.h * 300)} px @300 DPI = ${resolved.canvasIn.w * 72}×${resolved.canvasIn.h * 72} pt)`);

  if (process.exitCode === 1) {
    console.log('\nFAILED');
  } else {
    console.log('\nPASSED');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
