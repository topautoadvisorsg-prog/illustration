/**
 * Set the copyright-page facts for 7 NATIONAL PARKS WITHOUT THE ROOKIE MISTAKES.
 *
 * ─── WHY THE DISCLOSURE IS READ FROM THE MANUSCRIPT ───────────────────────
 * The composite-narrator disclosure is a legal/ethical disclosure that must
 * survive to print VERBATIM. Retyping it into a script is exactly how a
 * disclosure acquires a comma it did not have, so it is EXTRACTED from the
 * shipping manuscript by anchor and the extraction is asserted. If the anchor
 * stops matching, this stops — it never falls back to a hand-copied string.
 *
 * The manuscript's own copyright block sits in the title block, which the
 * typeset parser drops on purpose (the title page is generated matter, so
 * typesetting the manuscript's own would set it twice). That is why these facts
 * have to be carried onto the generated copyright page explicitly.
 *
 * ─── WHAT IS DELIBERATELY NOT SET ─────────────────────────────────────────
 * No publisher, no imprint, no ISBN, and `edition: ''`. The operator's
 * instruction was not to invent any of them, and `edition` in particular
 * DEFAULTS to 'First Edition' in the schema — so leaving it alone would have
 * printed an edition string nobody chose. An empty string turns it off.
 *
 *   npx tsx scripts/national-parks-publication-facts.ts <projectId>
 */
import { readFileSync } from 'node:fs';

const API = process.env.WL_API_BASE ?? 'http://127.0.0.1:8001';
const KEY = process.env.WILDLANDS_KEY ?? process.env.CONSOLE_PASSWORD ?? '';
const projectId = process.argv[2];
if (!projectId) {
  console.error('usage: national-parks-publication-facts.ts <projectId>');
  process.exit(1);
}

const MANUSCRIPT =
  'C:/Users/jovan/Downloads/national parks book/LAYOUT-7-national-parks-without-the-rookie-mistakes.md';
const markdown = readFileSync(MANUSCRIPT, 'utf8');

/** The disclosure, taken from the source rather than retyped. */
const ANCHOR = 'Tom Everett is a pen name and a composite narrator.';
const line = markdown
  .split('\n')
  .map((l) => l.trim())
  .find((l) => l.includes(ANCHOR));
if (!line) {
  console.error(
    `REFUSING: could not find the composite-narrator disclosure in the manuscript.\n` +
      `Looked for a line containing: ${ANCHOR}`,
  );
  process.exit(1);
}
// The manuscript sets it in italics; the copyright page styles its own text.
const disclosure = line.replace(/^\*+/, '').replace(/\*+$/, '').trim();
if (!disclosure.startsWith(ANCHOR) || !disclosure.endsWith('independently researched and checked.')) {
  console.error(`REFUSING: the disclosure did not extract cleanly.\nGot: ${disclosure}`);
  process.exit(1);
}

console.log(`disclosure (${disclosure.length} chars):\n${disclosure}\n`);

const patch = {
  config: {
    publishing: {
      copyrightYear: 2026,
      copyrightHolder: 'Tom Everett',
      // Verbatim, exactly as the operator specified it.
      copyrightLine: 'Copyright © 2026 by Tom Everett',
      rightsStatement: 'All rights reserved.',
      // Off: not invented. See the header.
      edition: '',
      disclaimers: [disclosure],
    },
  },
};

const res = await fetch(`${API}/api/projects/${projectId}/config`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
  body: JSON.stringify(patch),
});
const text = await res.text();
if (!res.ok) {
  console.error(`patch failed: ${res.status}\n${text}`);
  process.exit(1);
}
const parsed = JSON.parse(text) as { project: { config: { publishing: Record<string, unknown> } } };
const p = parsed.project.config.publishing;
console.log('stored publishing facts:');
for (const k of ['copyrightYear', 'copyrightHolder', 'copyrightLine', 'rightsStatement', 'edition', 'publisher', 'isbn']) {
  console.log(`  ${k}: ${JSON.stringify(p[k])}`);
}
console.log(`  disclaimers: ${(p.disclaimers as string[]).length} — ${(p.disclaimers as string[])[0]?.slice(0, 60)}…`);
