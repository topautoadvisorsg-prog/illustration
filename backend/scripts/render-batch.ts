/**
 * render-batch.ts — F-7: the production render rule.
 *
 *   Render → Verify (via DB, never the response) → Retry only ACTUAL failures.
 *
 * Why this exists (CHAPTER1_RUN_FINDINGS.md F-7): in the Chapter 1 run, 5 of
 * 22 render responses looked failed while every render had succeeded server-
 * side, and one page ended up with a duplicate paid render. Response-driven
 * retry double-spends. This script:
 *   1. Sends every render with skipIfRendered=true (server-side idempotency —
 *      an existing RENDERED/APPROVED row short-circuits before any spend).
 *   2. IGNORES the POST response entirely for success accounting.
 *   3. Verifies each page against the versions endpoint (the DB truth).
 *   4. Retries only pages with no good row, up to --retries times.
 *
 * Usage:
 *   tsx scripts/render-batch.ts --chapter 1
 *   tsx scripts/render-batch.ts --all
 *   tsx scripts/render-batch.ts --pages <pageId,pageId,...>
 *   BACKEND_URL=... PROJECT_ID=... tsx scripts/render-batch.ts --chapter 2 --retries 2
 */

const BACKEND_URL =
  process.env.BACKEND_URL ?? 'https://wildlandsbackend-production.up.railway.app';
const PROJECT_ID =
  process.env.PROJECT_ID ?? 'e51e5b4c-05c7-4d6e-8c00-60aa15de8992';

const argv = process.argv.slice(2);
const argVal = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const CHAPTER = argVal('--chapter');
const PAGES_ARG = argVal('--pages');
const ALL = argv.includes('--all');
const MAX_RETRIES = Number(argVal('--retries') ?? 2);

interface PageRef {
  id: string;
  pageKey: string;
  chapterNumber: number;
}

async function listTargetPages(): Promise<PageRef[]> {
  const res = await fetch(`${BACKEND_URL}/api/projects/${PROJECT_ID}/pages`);
  if (res.status !== 200) throw new Error(`/pages HTTP ${res.status}`);
  const body = (await res.json()) as { pages: PageRef[] };
  let pages = body.pages;
  if (CHAPTER) pages = pages.filter((p) => p.chapterNumber === Number(CHAPTER));
  if (PAGES_ARG) {
    const wanted = new Set(PAGES_ARG.split(',').map((s) => s.trim()));
    pages = pages.filter((p) => wanted.has(p.id) || wanted.has(p.pageKey));
  }
  if (!CHAPTER && !PAGES_ARG && !ALL) {
    throw new Error('Pass --chapter N, --pages a,b,c or --all (explicit scope required).');
  }
  return pages;
}

/** DB truth: does this page have a good render? Never trust POST responses. */
async function hasGoodRender(pageId: string): Promise<boolean> {
  const res = await fetch(
    `${BACKEND_URL}/api/experimental/whole-page-render/page/${pageId}/versions`,
  );
  if (res.status !== 200) return false; // transient — caller treats as "not yet"
  const body = (await res.json()) as { versions?: Array<{ status: string }> };
  const rows = body.versions ?? [];
  return rows.some((r) => r.status === 'RENDERED' || r.status === 'APPROVED');
}

async function renderOnce(pageId: string): Promise<void> {
  // skipIfRendered makes a duplicate POST free; response is informational only.
  await fetch(`${BACKEND_URL}/api/experimental/whole-page-render/${pageId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skipIfRendered: true }),
  }).catch(() => {
    /* response-layer errors are expected and meaningless — DB verify decides */
  });
}

async function main(): Promise<void> {
  console.log(`Backend : ${BACKEND_URL}`);
  console.log(`Project : ${PROJECT_ID}`);
  const pages = await listTargetPages();
  console.log(`Scope   : ${pages.length} pages${CHAPTER ? ` (chapter ${CHAPTER})` : ''}\n`);

  let pending = [...pages];
  for (let round = 0; round <= MAX_RETRIES && pending.length > 0; round++) {
    if (round > 0) console.log(`\n── retry round ${round}: ${pending.length} page(s) ──`);
    for (const page of pending) {
      const t0 = Date.now();
      await renderOnce(page.id);
      const ok = await hasGoodRender(page.id);
      const secs = Math.round((Date.now() - t0) / 1000);
      console.log(`  ${page.pageKey.padEnd(16)} ${ok ? 'VERIFIED' : 'NOT-YET'}  ${secs}s`);
    }
    // Verify pass — only ACTUAL failures survive into the next round.
    const still: PageRef[] = [];
    for (const page of pending) {
      if (!(await hasGoodRender(page.id))) still.push(page);
    }
    pending = still;
  }

  console.log(`\n=== BATCH COMPLETE ===`);
  console.log(`verified : ${pages.length - pending.length}/${pages.length}`);
  if (pending.length > 0) {
    console.log(`FAILED after ${MAX_RETRIES} retries:`);
    for (const p of pending) console.log(`  ${p.pageKey} (${p.id})`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
