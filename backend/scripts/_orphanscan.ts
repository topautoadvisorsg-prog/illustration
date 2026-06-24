/* WHOLE-BOOK orphan scan (read-only). Walks every paginated page in reading order
 * and flags any page that ENDS with a trailing heading block (bold **…**, **…**
 * *(paren)*, or ATX ###) — i.e. a heading stranded with its body on the next page.
 * Catches chains (consecutive flagged folios = N→N+1→N+2 …) and any page the manual
 * list missed. Reads readingFieldText, so it reflects moves already applied.
 * Usage: _orphanscan.ts            (whole book)
 *        _orphanscan.ts CH02       (only pageKeys starting CH02) */
import { listPaginatedPagesForProject } from '../src/db/repositories/pagination.repo.js';
import { P } from './_project.js';

const FILTER = process.argv[2];
const ordered = await listPaginatedPagesForProject(P);

// READER-FOCUSED heading/label/lead-in detection (operator rule 2026-06-23): not
// just markdown. A trailing line is an orphan candidate if the reader would see a
// heading/label/lead-in with no body after it on the page.
function isHeading(l: string): boolean {
  if (!l) return false;
  if (/^[-—_=*•]{3,}$/.test(l)) return false;                 // divider, not heading
  if (/(…|\.{3,})\s*\d+$/.test(l)) return false;              // TOC / index entry "… 242"
  if (/^\*\*.+\*\*(\s*\*?\(.*\)\*?)?$/.test(l)) return true;  // bold (+optional paren)
  if (/^#{1,6}\s+\S/.test(l)) return true;                    // ATX ###
  const words = l.split(/\s+/).filter(Boolean).length;
  if (/:$/.test(l) && words <= 12) return true;               // colon lead-in "As a reference library:"
  // marker-less title/label: short, no terminal sentence punctuation, starts capital
  if (words <= 8 && /^[A-Z*"'(]/.test(l) && !/[.!?…:;,"'’”)]$/.test(l)) return true;
  return false;
}
function trailingHeadingBlock(text: string): string[] {
  const ne = (text ?? '').replace(/\s+$/, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const block: string[] = [];
  for (let i = ne.length - 1; i >= 0; i--) { if (isHeading(ne[i]!)) block.unshift(ne[i]!); else break; }
  return block;
}

const flagged: { folio: number | null; key: string; block: string[] }[] = [];
for (const p of ordered) {
  if (FILTER && !p.pageKey.startsWith(FILTER)) continue;
  const block = trailingHeadingBlock(p.readingFieldText ?? '');
  if (block.length) flagged.push({ folio: p.plannedPageNumber ?? null, key: p.pageKey, block });
}

const flaggedFolios = new Set(flagged.map((f) => f.folio));
console.log(`ORPHANS FOUND: ${flagged.length}\n`);
for (const f of flagged) {
  const chain = f.folio != null && flaggedFolios.has(f.folio + 1) ? '  ⛓ CHAIN→next folio also orphaned' : '';
  console.log(`  folio ${f.folio}\t${f.key}\t${JSON.stringify(f.block)}${chain}`);
}
console.log(`\nflagged folios: ${flagged.map((f) => f.folio).filter((x) => x != null).join(' ')}`);
process.exit(0);
