/**
 * Take 7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES into a Wildlands instance.
 *
 * Uses `/api/books/intake`, the same endpoint the console's "Drop a book in"
 * panel calls, so this runs identical code to a human clicking the button
 * rather than a side door that writes rows directly.
 *
 * SAFE TO RE-RUN. Intake is idempotent on a hash of the brief plus the
 * manuscript: posting the same thing twice returns the project it already made.
 *
 * ─── THE TARGET IS EXPLICIT ───────────────────────────────────────────────
 * Defaults to the local API. Production additionally requires
 * --confirm-production, because passing a URL is easy to do by accident and
 * typing a flag is not.
 *
 * ─── THE HASH GUARD ───────────────────────────────────────────────────────
 * Three files for this book exist on disk and two of them must never be
 * published: `6bb6db65…` is pre-revision and states a fatality count sourced to
 * a travel blog plus wildlife distances LESS protective than the park's own,
 * and `73153575…` carries the retired title and byline. Both live in
 * `_archive/superseded/`. This script refuses to ingest anything whose sha256
 * is not the shipping file, which is the one control that makes reaching for
 * the wrong path a stop rather than a print run.
 *
 *   npx tsx scripts/national-parks-intake-local.ts --dry-run
 *   npx tsx scripts/national-parks-intake-local.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sanitizeManuscript } from '../src/pipeline/stage-1-ingestion/sanitize-manuscript.js';
import { auditManuscriptParse } from '../src/pipeline/typeset/manuscript-parse-gate.js';

const argv = process.argv.slice(2);
const hasFlag = (n: string): boolean => argv.includes(`--${n}`);
const optionValue = (n: string): string | undefined => {
  const inline = argv.find((a) => a.startsWith(`--${n}=`));
  if (inline) return inline.slice(n.length + 3);
  const i = argv.indexOf(`--${n}`);
  const next = i >= 0 ? argv[i + 1] : undefined;
  return next && !next.startsWith('--') ? next : undefined;
};

const API = optionValue('api') ?? process.env.WL_API_BASE ?? 'http://127.0.0.1:8001';
const KEY = process.env.WILDLANDS_KEY ?? process.env.CONSOLE_PASSWORD ?? '';
const DRY_RUN = hasFlag('dry-run');
const CONFIRM_PRODUCTION = hasFlag('confirm-production');

const MANUSCRIPT =
  optionValue('manuscript') ??
  'C:/Users/jovan/Downloads/national parks book/LAYOUT-7-national-parks-without-the-rookie-mistakes.md';

/** The shipping file, per EDITORIAL-FREEZE-2026-08-20.md. Refuse anything else. */
const SHIPPING_SHA = '9d3263d7903211771bd5cf638f5a3c41bf8a27d53e4c75a5b5d310a4cf0912d1';

/** Named so a wrong-file message can say WHICH wrong file it is. */
const KNOWN_STALE: Record<string, string> = {
  '6bb6db65d92bcf12883bea045f943c460aea593eb964e87632f9ade05e29daad':
    'the PRE-REVISION export: a blog-sourced fatality count, wildlife distances less protective than the park\'s own, and inverted timing advice',
  '73153575c61e7677e91ef58829a5630bdbae5725f9b8e2e1fbcf2fba94d654d9':
    'the same text under the RETIRED title and byline (NATIONAL PARKS WITHOUT THE OVERWHELM / Nolan Withlow)',
};

const sha = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

const markdown = readFileSync(MANUSCRIPT, 'utf8');
const actual = sha(markdown);

console.log(`manuscript : ${MANUSCRIPT}`);
console.log(`sha256     : ${actual}`);

if (actual !== SHIPPING_SHA) {
  const known = KNOWN_STALE[actual];
  console.error(
    `\nREFUSING. This is not the shipping file.\n  expected ${SHIPPING_SHA}\n  got      ${actual}` +
      (known ? `\n\nThat hash is ${known}.` : '') +
      `\n\nThe shipping file is LAYOUT-7-national-parks-without-the-rookie-mistakes.md.`,
  );
  process.exit(1);
}
console.log('sha256     : MATCHES the shipping file.');

/**
 * The working copy intake will derive, asserted BEFORE anything is written.
 *
 * The canonical hash proves we hold the right source. It does not prove the
 * platform will derive the same working copy from it, and the working copy is
 * what every later stage reads — including the paginator whose page count sets
 * the spine width of a printed cover.
 */
const workingSha = sha(sanitizeManuscript(markdown));
console.log(`working    : ${workingSha}`);

// Free, deterministic, read-only: does the typesetter see the whole book?
const audit = auditManuscriptParse(markdown);
console.log(`\nparse gate : ${audit.ok ? 'OK' : 'FAILED'}  (convention: ${audit.convention})`);
console.log(
  `             ${audit.parsed.sections} sections, ${audit.parsed.chapters} chapters, ` +
    `${audit.parsed.tableRows} table rows, ${audit.droppedAfterStructure} lines dropped`,
);
for (const f of audit.findings) console.log(`             [${f.status}] ${f.label}: ${f.detail}`);
if (!audit.ok) {
  console.error('\nREFUSING: the parser cannot see the whole manuscript. Fix that before creating a project.');
  process.exit(1);
}

const body = {
  brief: {
    title: '7 National Parks Without the Rookie Mistakes',
    subtitle: "What's Worth Your Time, What to Skip, and What I Learned the Hard Way",
    authorName: 'Tom Everett',
    volume: 1,
    /**
     * EXPLICIT trimSize, not `trimPreset: '6x9'`.
     *
     * The preset carries `bleedIn: 0.125`, and `config.trimSize` overrides the
     * layout standard's own trim — so the preset would silently give a
     * text-only interior a bleed it has nothing to bleed into.
     */
    trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0 },
    paperStock: 'white' as const,
    productionProfileId: 'trade-nonfiction-guide',
    typesetLayoutStandardId: 'national-parks-guide-typeset@1',
  },
  manuscript: {
    filename: 'LAYOUT-7-national-parks-without-the-rookie-mistakes.md',
    markdown,
  },
  setupOnly: false,
};

if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(API) && !CONFIRM_PRODUCTION) {
  console.error(`\nREFUSING: ${API} is not local. Add --confirm-production if that is really the intent.`);
  process.exit(1);
}

console.log(`\ntarget     : ${API}`);
if (DRY_RUN) {
  console.log('\nDRY RUN — nothing posted. Brief:');
  console.log(JSON.stringify(body.brief, null, 2));
  process.exit(0);
}

const res = await fetch(`${API}/api/books/intake`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error(`\nintake failed: ${res.status}\n${text}`);
  process.exit(1);
}
console.log(`\nintake ${res.status}:`);
console.log(text);
