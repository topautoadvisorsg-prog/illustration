/**
 * corrections — the operator command for book-local corrections.
 *
 * The workflow this exists to make possible:
 *
 *   "Change this period to a comma in block a1b2c3d4."
 *     -> add a correction    -> rebuild -> read the exact diff -> QA
 *
 * rather than:
 *
 *   -> open the renderer -> change the parser -> rebuild the platform
 *     -> accidentally repaginate three other books
 *
 * FOUR VERBS, DELIBERATELY:
 *
 *   blocks    list the addressable block ids, so an anchor can be chosen
 *   add       append or replace one correction in the document
 *   validate  resolve every correction and exit non-zero if any is unresolved
 *   report    resolve and print the full before/after report
 *
 * No editor UI. The correction document is JSON a person can read and a diff can
 * show.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ProjectConfigSchema, CorrectionSchema } from '@wildlands/shared';
import type { Correction } from '@wildlands/shared';
import { parseTypesetSections } from '../../src/pipeline/typeset/typeset-book.js';
import { resolveTypesetLayoutStandard } from '../../src/pipeline/typeset/layout-standards/registry.js';
import { normalizeManuscriptNewlines } from '../../src/pipeline/stage-1-ingestion/normalize-newlines.js';
import { resolveCorrections, enumerateBlocks } from '../../src/pipeline/corrections/resolve-corrections.js';
import { renderCorrectionReport, correctionReportJson } from '../../src/pipeline/corrections/correction-report.js';

const argv = process.argv.slice(2);
const verb = argv[0];
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const next = argv[argv.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : '';
};
const has = (n: string) => argv.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const die = (msg: string, code = 1): never => {
  console.error(msg);
  process.exit(code);
};

const USAGE = `
corrections — book-local corrections

  blocks   --manuscript m.md [--section SLUG] [--kind p|h3|callout|table|...]
  add      --corrections c.json --type TYPE --id ID --reason "..." [type fields]
  validate --manuscript m.md --corrections c.json
  report   --manuscript m.md --corrections c.json [--json]

Common:
  --manuscript FILE   the book's canonical markdown
  --corrections FILE  the correction document (JSON array)
  --standard ID       layout standard id (defaults to the trade guide)
  --title / --author  metadata for the synthetic config

Types and their fields:
  text              --anchor ID --expect "..." --replace "..."
  metadata          --field title|subtitle|authorName|edition --value "..."
  headingDisplay    --anchor ID [--display "..."] [--strip-drawn-marks]
  runningHead       --section SLUG --display "..."
  tocDisplay        --section SLUG --display "..."
  layout            --anchor ID --keep-with-next | --keep-together | --break-before page
  illustration      --anchor ID --asset NAME [--placement after-block|chapter-end|section-start]
  blockPresentation --anchor ID --variant compact|roomy|closing-beat
`;

if (!verb || has('help')) {
  console.log(USAGE);
  process.exit(verb ? 0 : 1);
}

const CORRECTIONS_PATH = flag('corrections');

function readCorrections(): Correction[] {
  if (!CORRECTIONS_PATH) return [];
  if (!existsSync(CORRECTIONS_PATH)) return [];
  const raw: unknown = JSON.parse(readFileSync(CORRECTIONS_PATH, 'utf8'));
  if (!Array.isArray(raw)) die(`${CORRECTIONS_PATH} must contain a JSON array of corrections.`);
  return (raw as unknown[]).map((entry, i) => {
    const parsed = CorrectionSchema.safeParse(entry);
    if (!parsed.success) {
      die(
        `Correction ${i} in ${CORRECTIONS_PATH} is not valid:\n` +
          parsed.error.issues.map((iss) => `  ${iss.path.join('.') || '(root)'}: ${iss.message}`).join('\n') +
          `\n\nAn unknown property is an error, not something to ignore: a correction typed wrong must not\n` +
          `look like a correction that applied.`,
      );
    }
    return parsed.data;
  });
}

function loadBook() {
  const manuscriptPath = flag('manuscript');
  if (!manuscriptPath) die('corrections: --manuscript <file.md> is required.');
  const markdown = normalizeManuscriptNewlines(readFileSync(manuscriptPath!, 'utf8'));
  const config = ProjectConfigSchema.parse({
    volume: 1,
    title: flag('title') ?? 'Untitled',
    authorName: flag('author') ?? 'Unknown',
    trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0.125 },
    paperStock: 'white',
  });
  const standard = resolveTypesetLayoutStandard(flag('standard') ?? 'trade-nonfiction-guide-typeset@2');
  return { sections: parseTypesetSections(markdown), config, standard };
}

// ── blocks ──────────────────────────────────────────────────────────────────
if (verb === 'blocks') {
  const { sections, config, standard } = loadBook();
  const blocks = enumerateBlocks(sections, config, standard);
  const section = flag('section');
  const kind = flag('kind');
  const shown = blocks.filter((b) => (!section || b.sectionSlug === section) && (!kind || b.kind === kind));
  console.log('');
  console.log(`ADDRESSABLE BLOCKS — ${shown.length} of ${blocks.length}`);
  console.log('─'.repeat(96));
  let lastSection = '';
  for (const b of shown) {
    if (b.sectionSlug !== lastSection) {
      console.log(`\n  ${b.sectionTitle}   [${b.sectionSlug}]`);
      lastSection = b.sectionSlug;
    }
    console.log(`    ${b.blockId}  ${b.kind.padEnd(12)} ${b.preview.slice(0, 62)}`);
  }
  console.log('');
  process.exit(0);
}

// ── add ─────────────────────────────────────────────────────────────────────
if (verb === 'add') {
  if (!CORRECTIONS_PATH) die('corrections add: --corrections <file.json> is required.');
  const type = flag('type');
  const id = flag('id');
  const reason = flag('reason');
  if (!type) die('corrections add: --type is required.');
  if (!id) die('corrections add: --id is required.');
  if (!reason) die('corrections add: --reason is required. A correction without a stated reason is a mystery later.');

  const base: Record<string, unknown> = { type, id, reason, status: 'active', createdAt: new Date().toISOString() };
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== '') base[k] = v;
  };
  set('anchor', flag('anchor'));
  set('section', flag('section'));
  set('display', flag('display'));
  set('expect', flag('expect'));
  if (has('replace')) base.replace = flag('replace') ?? '';
  set('field', flag('field'));
  set('value', flag('value'));
  set('asset', flag('asset'));
  set('placement', flag('placement'));
  set('variant', flag('variant'));
  if (has('strip-drawn-marks')) base.stripDrawnMarks = true;
  if (has('width-percent')) base.widthPercent = Number(flag('width-percent'));
  if (type === 'layout') {
    const override: Record<string, unknown> = {};
    if (has('keep-with-next')) override.keepWithNext = true;
    if (has('keep-together')) override.keepTogether = true;
    if (has('break-before')) override.breakBefore = flag('break-before');
    if (has('space-before-em')) override.spaceBeforeEm = Number(flag('space-before-em'));
    if (has('space-after-em')) override.spaceAfterEm = Number(flag('space-after-em'));
    base.override = override;
  }

  const parsed = CorrectionSchema.safeParse(base);
  if (!parsed.success) {
    die(
      'That correction is not valid:\n' +
        parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n'),
    );
  }

  const existing = readCorrections();
  const at = existing.findIndex((c) => c.id === id);
  if (at >= 0) existing[at] = parsed.data;
  else existing.push(parsed.data);
  writeFileSync(CORRECTIONS_PATH!, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`${at >= 0 ? 'Replaced' : 'Added'} correction "${id}" in ${CORRECTIONS_PATH}`);
  console.log('Run `validate` before building.');
  process.exit(0);
}

// ── validate / report ───────────────────────────────────────────────────────
if (verb === 'validate' || verb === 'report') {
  const { sections, config, standard } = loadBook();
  const result = resolveCorrections({ sections, config, layoutStandard: standard, corrections: readCorrections() });

  if (has('json')) console.log(JSON.stringify(correctionReportJson(result), null, 2));
  else console.log(renderCorrectionReport(result));

  // Fail closed. A build must not be READY while a correction is unresolved.
  process.exit(result.ok ? 0 : 2);
}

die(`corrections: unknown verb "${verb}".\n${USAGE}`);
