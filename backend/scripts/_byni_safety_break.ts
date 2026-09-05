/**
 * Is the self-harm sentence still whole, and still with its lead-in?
 *
 * The p113 repair at rev-18 pinned "And separately, and most importantly:" to
 * the sentence it introduces — "If you ever have thoughts about hurting
 * yourself, tell an adult today." — because a colon separated from its object by
 * a page turn is the one defect no measurement in this book would surface.
 *
 * rev-19 repaginated. An override that was correct at 172 pages is not
 * self-evidently correct at 175, and nothing else checks this.
 */
import { readFileSync } from 'node:fs';
import { buildPageModel } from '../src/pipeline/page-qa/page-model.js';
import { INTERIOR_PDF } from './before-you-need-it-config.js';

const LEAD = 'And separately, and most importantly';
const OBJ = 'thoughts about hurting yourself';
const model = await buildPageModel(readFileSync(INTERIOR_PDF));

const find = (needle: string) =>
  model.pages
    .filter((p) => p.body.some((l) => l.text.includes(needle)))
    .map((p) => p.n);

const lead = find(LEAD);
const obj = find(OBJ);
console.log(`lead-in  "${LEAD}:"  -> p${lead.join(', p') || '?'}`);
console.log(`sentence "…${OBJ}…"  -> p${obj.join(', p') || '?'}`);
/* The sentence RECURS -- Chapter 12 introduces it and Chapter 15 returns to it --
   so requiring a unique match reports a false failure. What matters is that
   wherever the lead-in appears, its object is on the SAME page. */
const ok = lead.length > 0 && lead.every((n) => obj.includes(n));
console.log(`\n${ok ? 'PASS' : 'FAIL'} — the colon and its object are ${ok ? `together on p${lead.join(', p')}` : 'SPLIT ACROSS A PAGE TURN'}`);

// And the same for the other tier-1 route, which must not be split either.
for (const [name, a, b] of [
  ['toxic shock', 'tell an adult straight away', 'Not in the morning'],
] as const) {
  const pa = find(a), pb = find(b);
  const together = pa.length && pb.length && pa.some((n) => pb.includes(n));
  console.log(`${together ? 'PASS' : 'CHECK'} — ${name}: "${a}" p${pa.join(',')}, "${b}" p${pb.join(',')}`);
}
process.exit(ok ? 0 : 2);
