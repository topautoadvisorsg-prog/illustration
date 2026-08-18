/**
 * Take DIRT RICH into the LOCAL dev platform.
 *
 * Uses `/api/books/intake`, the same endpoint the console's "Drop a book in"
 * panel calls, so this runs identical code to a human clicking the button —
 * create, ingest, breakdown — rather than a side door that writes rows directly.
 *
 * SAFE TO RE-RUN. Intake is idempotent on a hash of the brief plus the
 * manuscript: posting the same thing twice returns the project it already made
 * instead of a second copy. That is the guard against the duplicate-project
 * state this platform has been in before.
 *
 * LOCAL ONLY. Talks to http://127.0.0.1:8001 (wildlands_dev). It cannot reach
 * the deployed backend, and it creates nothing there.
 *
 *   yarn tsx scripts/dirt-rich-intake-local.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'http://127.0.0.1:8001';
const MANUSCRIPT = 'C:/Users/jovan/Downloads/DIRT-RICH-ABBY-FENWICK_FINAL.md';
/** Frozen revision 3. Refuse to ingest anything else. */
const FROZEN_SHA = 'bc27f4d50bb22be1eb4d0f4d83fa4041d97983cbbabc91077e496ee2205b358c';

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
console.log(`\nopen it at http://localhost:3001`);
