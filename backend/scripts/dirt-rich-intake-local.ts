/**
 * Take DIRT RICH into a Wildlands platform instance.
 *
 * Uses `/api/books/intake`, the same endpoint the console's "Drop a book in"
 * panel calls, so this runs identical code to a human clicking the button
 * rather than a side door that writes rows directly.
 *
 * SAFE TO RE-RUN. Intake is idempotent on a hash of the brief plus the
 * manuscript: posting the same thing twice returns the project it already made
 * instead of a second copy.
 *
 * --- TARGET IS EXPLICIT, AND PRODUCTION NEEDS AN EXTRA YES ----------------
 * The API base and manuscript path used to be hardcoded to localhost and to one
 * operator's Downloads folder. That made this unrunnable once the file moved
 * and, worse, meant "run the intake" silently meant "write to wildlands_dev" --
 * which is how DIRT RICH came to exist in dev only while everyone believed it
 * was on the platform.
 *
 * So the target is supplied, and a non-local host is NOT enough on its own:
 * production also requires --confirm-production. Passing a URL is easy to do by
 * accident; typing the flag is not.
 *
 * --- WHY THE SANITIZED HASH IS ASSERTED TOO ------------------------------
 * FROZEN_SHA proves we hold the right canonical source. It does NOT prove the
 * platform will derive the same working copy from it, and the working copy is
 * what every downstream stage -- including pagination -- actually reads. The
 * known-good 126-page build came from one specific sanitized artifact, so that
 * artifact's hash is asserted here, before anything is written. A moved page
 * count invalidates the spine, and the spine is printed into an approved cover.
 *
 *   yarn tsx scripts/dirt-rich-intake-local.ts --manuscript "<path>" --dry-run
 *   yarn tsx scripts/dirt-rich-intake-local.ts --manuscript "<path>"
 *   yarn tsx scripts/dirt-rich-intake-local.ts --manuscript "<path>"
 *     --api https://wildlandsbackend-production.up.railway.app --confirm-production
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeManuscript } from '../src/pipeline/stage-1-ingestion/sanitize-manuscript.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const argv = process.argv.slice(2);
const hasFlag = (name: string): boolean => argv.includes(`--${name}`);
const optionValue = (name: string): string | undefined => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  const next = i >= 0 ? argv[i + 1] : undefined;
  return next && !next.startsWith('--') ? next : undefined;
};

const API = optionValue('api') ?? process.env.WL_API_BASE ?? 'http://127.0.0.1:8001';
const MANUSCRIPT = optionValue('manuscript') ?? process.env.WL_MANUSCRIPT ?? '';
const DRY_RUN = hasFlag('dry-run');
const CONFIRM_PRODUCTION = hasFlag('confirm-production');

/** Frozen revision 3. Refuse to ingest anything else. */
const FROZEN_SHA = 'bc27f4d50bb22be1eb4d0f4d83fa4041d97983cbbabc91077e496ee2205b358c';
/**
 * What INTAKE produces: the canonical source with sanitization applied, and
 * nothing else. Asserted so a change in the sanitizer is caught before a project
 * is created rather than after.
 *
 * --- THIS IS NOT THE MANUSCRIPT THE BOOK WAS TYPESET FROM ----------------
 * This guard originally expected 0376567e, the working manuscript behind the
 * approved 126-page interior, and it could never have passed: that manuscript
 * carries nine figure references the canonical source does not contain, so no
 * amount of sanitizing reaches it. The failure was the useful part -- it exposed
 * that the approved book came from canonical PLUS a figure pipeline which
 * overwrites intake's output entirely.
 *
 * Reaching 0376567e is dirt-rich-figure-pipeline.ts's job, asserted there stage
 * by stage. Intake owns exactly one hop: canonical -> sanitized.
 */
const EXPECTED_INTAKE_SHA = 'ee59a65b2198e73cbcc81e1039db50ad7ccf387bf0a1e6d248d20c3b06221f4e';

const isLocalTarget = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(API);

if (!MANUSCRIPT) {
  console.error('No manuscript given. Pass --manuscript "<path>" or set WL_MANUSCRIPT.');
  console.error('There is deliberately no default: the old hardcoded path went stale when the file moved.');
  process.exit(2);
}
if (!isLocalTarget && !CONFIRM_PRODUCTION) {
  console.error('Refusing to write to a non-local target without an explicit opt-in.');
  console.error(`  target: ${API}`);
  console.error('  Add --confirm-production if you really mean to create this book there.');
  process.exit(2);
}

/**
 * The dev console password, read from the env file rather than typed in.
 * Never printed — only forwarded as a bearer token to our own local server.
 */
function consolePassword(): string {
  for (const file of ['.env.development.local', '.env.local', '.env']) {
    try {
      const text = readFileSync(path.join(ROOT, file), 'utf8');
      const m = text.match(/^\s*CONSOLE_PASSWORD\s*=\s*"?([^"\n\r]+)"?\s*$/m);
      if (m) return m[1]!.trim();
    } catch {
      /* try the next file */
    }
  }
  return (process.env.CONSOLE_PASSWORD ?? '').trim();
}

const markdown = readFileSync(MANUSCRIPT, 'utf8');
const sha = createHash('sha256').update(readFileSync(MANUSCRIPT)).digest('hex');
if (sha !== FROZEN_SHA) {
  throw new Error(
    `Manuscript sha256 is ${sha}, expected ${FROZEN_SHA}. That is not the frozen revision 3 — ` +
      `there are superseded copies in the same folder. Stopping rather than ingesting the wrong book.`,
  );
}
console.log(`manuscript verified: ${sha.slice(0, 16)}… (frozen rev 3, ${markdown.length} bytes)`);

/**
 * Derive the working copy the SAME way ingestion will, and refuse to proceed if
 * it is not the artifact the 126-page build came from. Canonical bytes matching
 * is necessary but not sufficient: pagination reads the SANITIZED derivative, so
 * a change in sanitization would produce a different book from an identical
 * source, and the page count could move.
 */
const intakeSha = createHash('sha256').update(sanitizeManuscript(markdown), 'utf8').digest('hex');
if (intakeSha !== EXPECTED_INTAKE_SHA) {
  console.error(`Sanitized intake output is ${intakeSha}`);
  console.error(`expected                   ${EXPECTED_INTAKE_SHA}`);
  console.error('Same canonical source, different sanitized result -- the sanitizer has changed.');
  console.error('Stopping before any write: every later stage is measured against this one.');
  process.exit(1);
}
console.log(`intake output verified: ${intakeSha.slice(0, 16)}… (canonical -> sanitized)`);
console.log('note: the figure pipeline overwrites this working copy on its way to 0376567e…');

const body = {
  brief: {
    title: 'DIRT RICH',
    subtitle: "A Beginner's Guide to Backyard Homesteading",
    authorName: 'Abby Fenwick',
    volume: 1,
    trimPreset: '6x9',
    paperStock: 'cream',
    productionProfileId: 'bw-educational-nonfiction',
    // Pinned EXPLICITLY at intake. Without this the profile's own default
    // (educational-nonfiction-typeset@1, the 5.5x8.5 digest) would be written on
    // the first typeset and silently become this book's design.
    typesetLayoutStandardId: 'trade-nonfiction-guide-typeset@1',
  },
  manuscript: { filename: 'DIRT-RICH-ABBY-FENWICK_FINAL.md', markdown },
  setupOnly: false,
};

console.log('');
console.log('RESOLVED TARGET AND PAYLOAD');
console.log(`  api base                : ${API}${isLocalTarget ? '  (local)' : '  (NON-LOCAL, --confirm-production given)'}`);
console.log(`  manuscript              : ${MANUSCRIPT}`);
console.log(`  canonical sha256        : ${sha}`);
console.log(`  sanitized sha256        : ${intakeSha}   (intake stage only)`);
console.log(`  title / author          : ${body.brief.title} / ${body.brief.authorName}`);
console.log(`  trim / paper            : ${body.brief.trimPreset} / ${body.brief.paperStock}`);
console.log(`  productionProfileId     : ${body.brief.productionProfileId}`);
console.log(`  typesetLayoutStandardId : ${body.brief.typesetLayoutStandardId}`);
console.log(`  setupOnly               : ${body.setupOnly}`);

if (DRY_RUN) {
  console.log('');
  console.log('DRY RUN -- nothing posted, nothing written. Re-run without --dry-run to intake.');
  process.exit(0);
}

const res = await fetch(`${API}/api/books/intake`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${consolePassword()}`,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error(`intake failed: HTTP ${res.status}\n${text.slice(0, 2000)}`);
  process.exit(1);
}

const out = JSON.parse(text) as {
  projectId: string;
  created: boolean;
  message?: string;
  steps?: { step: string; status: string; detail: string }[];
  readiness: { status: string; nextAction: string; checks: { label: string; status: string; detail: string }[] };
};

console.log(`\nproject ${out.projectId}  (${out.created ? 'CREATED' : 'already existed — returned as is'})`);
if (out.message) console.log(`  ${out.message}`);

for (const s of out.steps ?? []) console.log(`  ${s.status.padEnd(7)} ${s.step.padEnd(12)} ${s.detail}`);

console.log(`\nreadiness: ${out.readiness.status} — ${out.readiness.nextAction}`);
for (const c of out.readiness.checks) {
  if (c.status !== 'PASS') console.log(`  ${c.status.padEnd(5)} ${c.label}: ${c.detail}`);
}
console.log(`\ntarget was ${API}`);
