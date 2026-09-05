/**
 * BEFORE YOU NEED IT — prove what a repagination actually did.
 *
 * Renders the book TWICE from one process — once with the project's overrides
 * and once with a named override removed — and compares every block:
 *
 *   • did its text change?      (textSha)
 *   • did its line breaking change?  (line count, and every line's width)
 *   • which page did it land on, and by how much did that move?
 *
 * A page-count change is only safe if every block simply shifts by the same
 * whole number of pages and NOT ONE LINE REWRAPS. This says so from measurement
 * rather than from an argument about margins.
 *
 *   yarn tsx scripts/_byni_cascade.ts <blockId>
 *
 * Local and free.
 */
import { ProjectConfigSchema } from '@wildlands/shared';
import { renderTypesetBook } from '../src/pipeline/typeset/render-typeset.js';
import { CONFIG, RENDER_INPUT, readManuscript } from './before-you-need-it-config.js';

const DROP = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!DROP.length) {
  console.error('usage: _byni_cascade.ts <blockId> [blockId ...]   (removed to form the control)');
  process.exit(1);
}

const { md } = readManuscript();

const without = { ...(CONFIG.layoutOverrides ?? {}) };
for (const id of DROP) delete (without as Record<string, unknown>)[id];
const controlConfig = ProjectConfigSchema.parse({ ...CONFIG, layoutOverrides: without });

console.log(`control : project overrides minus ${DROP.join(', ')}`);
const control = await renderTypesetBook({ ...RENDER_INPUT, config: controlConfig, markdown: md, deepProbe: true });
console.log(`  ${control.report.totalPages} pages`);

console.log('current : project overrides as configured');
const current = await renderTypesetBook({ ...RENDER_INPUT, markdown: md, deepProbe: true });
console.log(`  ${current.report.totalPages} pages\n`);

type Row = { blockId: string; frag: number; page: number | null; lines: [number, number, number][]; textSha: string };
const key = (b: Row) => `${b.blockId}#${b.frag}`;
const mapOf = (rows: readonly Row[]) => new Map(rows.map((b) => [key(b), b]));

const A = mapOf(control.probe as Row[]);
const B = mapOf(current.probe as Row[]);

const onlyA: string[] = [];
const onlyB: string[] = [];
const textChanged: string[] = [];
const rewrapped: string[] = [];
const shifts = new Map<number, number>();
const movedBy = new Map<string, number>();

for (const [k, a] of A) {
  const b = B.get(k);
  if (!b) {
    onlyA.push(k);
    continue;
  }
  if (a.textSha !== b.textSha) textChanged.push(k);
  const sameWrap =
    a.lines.length === b.lines.length &&
    a.lines.every((l, i) => Math.abs(l[2] - b.lines[i]![2]) < 0.5);
  if (!sameWrap) rewrapped.push(k);
  if (a.page !== null && b.page !== null) {
    const d = b.page - a.page;
    shifts.set(d, (shifts.get(d) ?? 0) + 1);
    movedBy.set(k, d);
  }
}
for (const k of B.keys()) if (!A.has(k)) onlyB.push(k);

console.log(`blocks: ${A.size} control, ${B.size} current`);
console.log(`  present only in control : ${onlyA.length}${onlyA.length ? ` (${onlyA.slice(0, 6).join(', ')})` : ''}`);
console.log(`  present only in current : ${onlyB.length}${onlyB.length ? ` (${onlyB.slice(0, 6).join(', ')})` : ''}`);
console.log(`  TEXT changed            : ${textChanged.length}${textChanged.length ? ` (${textChanged.slice(0, 6).join(', ')})` : ''}`);
console.log(`  LINE BREAKING changed   : ${rewrapped.length}${rewrapped.length ? ` (${rewrapped.slice(0, 8).join(', ')})` : ''}`);

console.log('\npage movement, by amount:');
for (const [d, n] of [...shifts.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${d > 0 ? '+' : ''}${d} page(s): ${String(n).padStart(4)} block(s)`);
}

// Where the shift begins: the lowest control page whose blocks moved.
const firstMoved = Math.min(
  ...[...movedBy.entries()].filter(([, d]) => d !== 0).map(([k]) => A.get(k)!.page ?? Infinity),
);
const lastUnmoved = Math.max(
  ...[...movedBy.entries()].filter(([, d]) => d === 0).map(([k]) => A.get(k)!.page ?? -Infinity),
);
for (const k of rewrapped) {
  console.log(`\n${k} line boxes [top,left,width]:`);
  console.log(`  control: ${JSON.stringify(A.get(k)!.lines)}`);
  console.log(`  current: ${JSON.stringify(B.get(k)!.lines)}`);
}

console.log(`\nlast page unaffected: p${lastUnmoved}`);
console.log(`first page moved    : p${firstMoved} (control numbering)`);
process.exit(rewrapped.length || textChanged.length ? 1 : 0);
