/**
 * finalize-book-renders.ts — no-spend production finalizer.
 *
 * Render-batch gets pages to RENDERED/APPROVED. Assembly requires more:
 *
 *   rendered row -> APPROVED -> print-prepped -> selected-for-book
 *
 * This script performs those no-spend steps idempotently, then optionally calls
 * book assembly. It NEVER calls the paid render endpoint. If a page has no
 * RENDERED/APPROVED row, it reports that page as missing so the operator can
 * render only the actual gaps with render-batch.ts.
 *
 * Usage:
 *   tsx scripts/finalize-book-renders.ts --chapter 1
 *   tsx scripts/finalize-book-renders.ts --all --assemble
 *   tsx scripts/finalize-book-renders.ts --pages CH01_P001,CH02_P010 --dry-run
 *   BACKEND_URL=... PROJECT_ID=... tsx scripts/finalize-book-renders.ts --all
 */

const BACKEND_URL =
  process.env.BACKEND_URL ?? 'https://wildlandsbackend-production.up.railway.app';
const PROJECT_ID =
  process.env.PROJECT_ID ?? 'e51e5b4c-05c7-4d6e-8c00-60aa15de8992';
const DECIDED_BY = process.env.DECIDED_BY ?? 'production-finalizer';

const argv = process.argv.slice(2);
const argVal = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};

const CHAPTER = argVal('--chapter');
const PAGES_ARG = argVal('--pages');
const ALL = argv.includes('--all');
const ASSEMBLE = argv.includes('--assemble');
const DRY_RUN = argv.includes('--dry-run');

interface PageRef {
  id: string;
  pageKey: string;
  chapterNumber: number;
  plannedPageNumber?: number;
}

interface RenderRef {
  id: string;
  pageId: string;
  version: number;
  status: string;
  imagePath: string | null;
  printPdfPath?: string | null;
  preflightPassed?: boolean | null;
  active: boolean;
  approvedForBook: boolean;
  createdAt?: string | null;
}

interface ProjectRenderSummary {
  renders: RenderRef[];
}

interface AssemblyReport {
  blocked: boolean;
  expectedPages: number;
  assembledPages: number;
  interiorPdfPath: string | null;
  missing: string[];
  noPrintOutput: string[];
  preflightFailures: string[];
  dimensionFailures: string[];
  validations?: Array<{ id?: string; ok?: boolean; message?: string }>;
}

interface FinalizeResult {
  page: PageRef;
  render?: RenderRef;
  actions: string[];
  status: 'finalized' | 'already-ready' | 'missing-render' | 'failed';
  error?: string;
}

function requireScope(): void {
  if (!CHAPTER && !PAGES_ARG && !ALL) {
    throw new Error('Pass --chapter N, --pages a,b,c or --all (explicit scope required).');
  }
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`HTTP ${res.status} ${text.slice(0, 500)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

async function postJson<T>(path: string, body: unknown = {}): Promise<T> {
  return jsonFetch<T>(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function listTargetPages(): Promise<PageRef[]> {
  const body = await jsonFetch<{ pages: PageRef[] }>(
    `${BACKEND_URL}/api/projects/${PROJECT_ID}/pages`,
  );
  let pages = body.pages;
  if (CHAPTER) pages = pages.filter((p) => p.chapterNumber === Number(CHAPTER));
  if (PAGES_ARG) {
    const wanted = new Set(PAGES_ARG.split(',').map((s) => s.trim()).filter(Boolean));
    pages = pages.filter((p) => wanted.has(p.id) || wanted.has(p.pageKey));
  }
  return pages;
}

async function listRenders(): Promise<RenderRef[]> {
  const body = await jsonFetch<ProjectRenderSummary>(
    `${BACKEND_URL}/api/experimental/whole-page-render/project/${PROJECT_ID}`,
  );
  return body.renders ?? [];
}

function chooseRender(rows: RenderRef[]): RenderRef | undefined {
  const usable = rows
    .filter((r) => r.imagePath && (r.status === 'APPROVED' || r.status === 'RENDERED'))
    .sort((a, b) => b.version - a.version);

  return (
    usable.find((r) => r.active && r.approvedForBook) ??
    usable.find((r) => r.status === 'APPROVED') ??
    usable[0]
  );
}

async function finalizePage(page: PageRef, render: RenderRef | undefined): Promise<FinalizeResult> {
  const actions: string[] = [];
  if (!render) return { page, actions, status: 'missing-render' };

  try {
    if (render.active && render.approvedForBook && render.preflightPassed === true && render.printPdfPath) {
      return { page, render, actions: ['verified book-ready'], status: 'already-ready' };
    }

    if (render.status === 'RENDERED') {
      actions.push('approve');
      if (!DRY_RUN) {
        await postJson(`/api/experimental/whole-page-render/${render.id}/approve`, {
          decidedBy: DECIDED_BY,
          reason: 'Production finalizer approved existing rendered page for book assembly.',
        });
      }
    }

    actions.push('print-prep');
    if (!DRY_RUN) {
      await postJson(`/api/experimental/whole-page-render/${render.id}/print-prep`);
    }

    actions.push('select-for-book');
    if (!DRY_RUN) {
      await postJson(`/api/experimental/whole-page-render/${render.id}/select-for-book`, {
        decidedBy: DECIDED_BY,
        reason: 'Production finalizer selected the current approved render for book assembly.',
      });
    }

    return { page, render, actions, status: 'finalized' };
  } catch (e) {
    return { page, render, actions, status: 'failed', error: (e as Error).message };
  }
}

function printResult(r: FinalizeResult): void {
  const key = r.page.pageKey.padEnd(16);
  const ver = r.render ? `v${r.render.version}` : '--';
  const actionText = r.actions.length ? r.actions.join(' -> ') : 'no action';
  if (r.status === 'failed') {
    console.log(`  ${key} ${ver.padEnd(4)} FAILED       ${actionText} :: ${r.error}`);
    return;
  }
  console.log(`  ${key} ${ver.padEnd(4)} ${r.status.padEnd(13)} ${actionText}`);
}

function summarize(results: FinalizeResult[]): void {
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  console.log('\n=== FINALIZE SUMMARY ===');
  for (const status of ['already-ready', 'finalized', 'missing-render', 'failed']) {
    console.log(`${status.padEnd(15)} : ${counts.get(status) ?? 0}`);
  }

  const missing = results.filter((r) => r.status === 'missing-render');
  if (missing.length > 0) {
    console.log('\nMissing rendered rows. Render these first:');
    for (const r of missing.slice(0, 40)) {
      console.log(`  ${r.page.pageKey} (${r.page.id})`);
    }
    if (missing.length > 40) console.log(`  ...and ${missing.length - 40} more`);
  }
}

async function assemble(): Promise<void> {
  console.log('\n=== ASSEMBLY ===');
  if (DRY_RUN) {
    console.log('dry-run: skipped assemble');
    return;
  }
  const report = await postJson<AssemblyReport>(
    `/api/experimental/whole-page-render/project/${PROJECT_ID}/assemble`,
  );
  console.log(`blocked       : ${report.blocked}`);
  console.log(`assembled     : ${report.assembledPages}/${report.expectedPages}`);
  console.log(`interior PDF  : ${report.interiorPdfPath ?? '(none)'}`);
  if (report.blocked) {
    console.log(`missing       : ${report.missing.length}`);
    console.log(`no print      : ${report.noPrintOutput.length}`);
    console.log(`preflight fail: ${report.preflightFailures.length}`);
    console.log(`dim fail      : ${report.dimensionFailures.length}`);
  }
}

async function main(): Promise<void> {
  requireScope();
  console.log(`Backend : ${BACKEND_URL}`);
  console.log(`Project : ${PROJECT_ID}`);
  console.log(`Scope   : ${ALL ? 'all pages' : CHAPTER ? `chapter ${CHAPTER}` : PAGES_ARG}`);
  console.log(`Mode    : ${DRY_RUN ? 'dry-run/no mutations' : 'mutating/no spend'}\n`);

  const pages = await listTargetPages();
  const renders = await listRenders();
  const byPage = new Map<string, RenderRef[]>();
  for (const r of renders) {
    const bucket = byPage.get(r.pageId) ?? [];
    bucket.push(r);
    byPage.set(r.pageId, bucket);
  }

  const results: FinalizeResult[] = [];
  for (const page of pages) {
    const render = chooseRender(byPage.get(page.id) ?? []);
    const result = await finalizePage(page, render);
    printResult(result);
    results.push(result);
  }

  summarize(results);

  if (ASSEMBLE) await assemble();

  if (results.some((r) => r.status === 'failed')) process.exit(1);
  if (results.some((r) => r.status === 'missing-render')) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
