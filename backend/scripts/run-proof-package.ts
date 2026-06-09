/**
 * run-proof-package.ts — hit the proof-package endpoints for the verification
 * batch (4 picks) and pretty-print the AUTHORITY / INPUT / OUTPUT / PRINT
 * sections so the operator can audit each page BEFORE spending on image
 * generation.
 *
 * Default picks (operator-confirmed verification batch):
 *   CH05_P013    — image-top
 *   CH02_P010    — image-right
 *   CH08_P001    — pure-text
 *   CH01_P001_c1 — continuation
 *
 * Usage:
 *   tsx scripts/run-proof-package.ts                           # default picks
 *   tsx scripts/run-proof-package.ts --pages CH01_P001,CH02_P010
 *   tsx scripts/run-proof-package.ts --json > proof.json       # full JSON dump
 *   tsx scripts/run-proof-package.ts --render <renderId>       # post-render proof
 *
 * Env:
 *   BACKEND_URL   default https://wildlandsbackend-production.up.railway.app
 *   PROJECT_ID    default current operator project
 */

const BACKEND_URL =
  process.env.BACKEND_URL ?? 'https://wildlandsbackend-production.up.railway.app';
const PROJECT_ID =
  process.env.PROJECT_ID ?? '9e46d6b9-c8eb-46a0-bba8-88584b0add48';

const DEFAULT_PICKS = ['CH05_P013', 'CH02_P010', 'CH08_P001', 'CH01_P001_c1'];

const argv = process.argv.slice(2);
const argVal = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] ?? null : null;
};
const PAGES = (argVal('--pages')?.split(',').map((s) => s.trim()).filter(Boolean) ?? DEFAULT_PICKS);
const RENDER_ID = argVal('--render');
const JSON_OUT = argv.includes('--json');

const head = (msg: string) => console.log(`\n── ${msg} ──`);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const warn = (msg: string) => console.log(`  ⚠ ${msg}`);

async function listPages(): Promise<Array<{ id: string; pageKey: string; status: string }>> {
  const res = await fetch(`${BACKEND_URL}/api/projects/${PROJECT_ID}/pages`);
  if (res.status !== 200) {
    throw new Error(`/pages failed: HTTP ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.pages as Array<{ id: string; pageKey: string; status: string }>;
}

async function fetchPreviewPackage(pageId: string): Promise<any> {
  const res = await fetch(
    `${BACKEND_URL}/api/experimental/whole-page-render/page/${pageId}/preview-package`,
  );
  if (res.status === 503) {
    throw new Error('whole-page experiment flag is OFF — set WHOLE_PAGE_EXPERIMENT_ENABLED=true');
  }
  if (res.status !== 200) {
    throw new Error(`preview-package failed: HTTP ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

async function fetchProofPackage(renderId: string): Promise<any> {
  const res = await fetch(
    `${BACKEND_URL}/api/experimental/whole-page-render/${renderId}/proof-package`,
  );
  if (res.status === 503) {
    throw new Error('whole-page experiment flag is OFF — set WHOLE_PAGE_EXPERIMENT_ENABLED=true');
  }
  if (res.status !== 200) {
    throw new Error(`proof-package failed: HTTP ${res.status} ${await res.text()}`);
  }
  return await res.json();
}

function printPackage(label: string, pkg: any): void {
  head(`${label} — ${pkg.pageKey} (status: ${pkg.status})`);
  console.log('  AUTHORITY');
  ok(`layout         : ${pkg.authority.layoutTemplate}`);
  ok(`family label   : ${pkg.authority.layoutFamilyLabel}`);
  ok(`page type      : ${pkg.authority.pageType}`);
  ok(`entry title    : ${pkg.authority.entryTitle}`);
  ok(`trim           : ${pkg.authority.trim.widthIn}×${pkg.authority.trim.heightIn} in (bleed ${pkg.authority.trim.bleedIn})`);
  ok(`canvas         : ${pkg.authority.canvas.widthIn}×${pkg.authority.canvas.heightIn} in`);
  ok(`text frame     : ${pkg.authority.textFrame.widthIn.toFixed(3)}×${pkg.authority.textFrame.heightIn.toFixed(3)} in`);
  ok(`source text    : ${pkg.authority.sourceTextChars} chars / ${pkg.authority.sourceTextWords} words`);
  ok(`title          : ${JSON.stringify(pkg.authority.title)}`);
  ok(`drop cap       : ${pkg.authority.dropCap ?? '(none)'}`);
  ok(`badge context  : ${JSON.stringify(pkg.authority.badgeContext)}`);
  ok(`typo zones     : ${pkg.authority.zones.typographyZones?.length ?? 0}`);
  ok(`image zones    : ${pkg.authority.zones.imagePriorityZones?.length ?? 0}`);
  ok(`text-safe zones: ${pkg.authority.zones.textSafeZones?.length ?? 0}`);

  console.log('  INPUT');
  ok(`spec path      : ${pkg.input.specPath ?? '(in-memory, not persisted)'}`);
  ok(`prompt sha256  : ${pkg.input.promptSha256 ?? '(in-memory)'}`);
  ok(`prompt length  : ${pkg.input.prompt.length} chars`);
  ok(`prompt head    : ${pkg.input.prompt.slice(0, 140).replace(/\s+/g, ' ')}…`);
  if (pkg.input.blueprintImage.kind === 'url') {
    ok(`blueprint      : ${pkg.input.blueprintImage.url}`);
  } else {
    ok(`blueprint      : inline data URI (${pkg.input.blueprintImage.widthPx}×${pkg.input.blueprintImage.heightPx})`);
  }
  ok(`model requested: ${pkg.input.modelRequested} @ ${pkg.input.requestedSize}`);

  console.log('  OUTPUT');
  if (!pkg.output) {
    warn('no render yet (expected for preview package)');
  } else {
    ok(`image path     : ${pkg.output.imagePath}`);
    ok(`image url      : ${pkg.output.imageUrl}`);
    ok(`pixel size     : ${pkg.output.widthPx}×${pkg.output.heightPx}`);
    ok(`model returned : ${pkg.output.modelReturned}`);
    ok(`rendered at    : ${pkg.output.renderedAt}`);
    ok(`attempts       : ${pkg.output.attempts}`);
  }

  console.log('  PRINT');
  if (!pkg.print) {
    warn('no print-prep yet');
  } else {
    ok(`png            : ${pkg.print.printPngUrl}`);
    ok(`pdf            : ${pkg.print.printPdfUrl}`);
    ok(`preflight      : ${pkg.print.preflightPassed === true ? 'PASS' : pkg.print.preflightPassed === false ? 'FAIL' : 'pending'}`);
  }
}

async function main(): Promise<void> {
  console.log(`Backend : ${BACKEND_URL}`);
  console.log(`Project : ${PROJECT_ID}`);

  if (RENDER_ID) {
    const pkg = await fetchProofPackage(RENDER_ID);
    if (JSON_OUT) {
      console.log(JSON.stringify(pkg, null, 2));
      return;
    }
    printPackage('PROOF', pkg);
    return;
  }

  console.log(`Picks   : ${PAGES.join(', ')}`);

  const all = await listPages();
  const byKey = new Map(all.map((p) => [p.pageKey, p]));

  const matched: Array<{ key: string; id: string }> = [];
  const missing: string[] = [];
  for (const key of PAGES) {
    const row = byKey.get(key);
    if (row) matched.push({ key, id: row.id });
    else missing.push(key);
  }

  if (missing.length > 0) {
    console.log(`\n  ✗ missing in project: ${missing.join(', ')}`);
  }
  if (matched.length === 0) {
    console.error('no picks matched — aborting');
    process.exit(1);
  }

  const packages: Record<string, any> = {};
  for (const { key, id } of matched) {
    try {
      const pkg = await fetchPreviewPackage(id);
      packages[key] = pkg;
      if (!JSON_OUT) printPackage('PREVIEW', pkg);
    } catch (e) {
      console.error(`\n  ✗ ${key}: ${(e as Error).message}`);
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(packages, null, 2));
    return;
  }

  head('Summary');
  ok(`${matched.length} of ${PAGES.length} picks fetched`);
  ok('Each package above shows AUTHORITY / INPUT / OUTPUT / PRINT');
  ok('No image spend incurred — preview packages reuse prepareRender + renderBlueprintPng');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
