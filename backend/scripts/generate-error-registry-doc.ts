/**
 * Generates docs/ERROR_REGISTRY.md from backend/src/lib/error-registry.ts.
 * Never hand-edit that doc — edit the registry and re-run this.
 *
 * Run: node ../node_modules/tsx/dist/cli.mjs scripts/generate-error-registry-doc.ts
 * (from backend/)
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allErrorRegistryEntries } from '../src/lib/error-registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', '..', 'docs', 'ERROR_REGISTRY.md');

const SEVERITY_ORDER = { structural: 0, validation: 1, system: 2 } as const;

function renderEntry(e: ReturnType<typeof allErrorRegistryEntries>[number]): string {
  return [
    `### ${e.code} — ${e.title}`,
    '',
    `| | |`,
    `|---|---|`,
    `| **Step** | \`${e.step}\` |`,
    `| **Severity** | ${e.severity} |`,
    `| **Friendly message** | ${e.friendlyMessage} |`,
    `| **Technical cause** | ${e.technicalCause} |`,
    `| **Recovery** | ${e.recovery} |`,
    '',
  ].join('\n');
}

function main(): void {
  const entries = allErrorRegistryEntries().sort(
    (a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || a.code.localeCompare(b.code),
  );

  const doc = [
    '# Error Registry',
    '',
    '**Generated — do not hand-edit.** Source of truth: `backend/src/lib/error-registry.ts`.',
    'Regenerate with `backend/scripts/generate-error-registry-doc.ts` after changing the registry.',
    '',
    `Total codes: ${entries.length}.`,
    '',
    ...entries.map(renderEntry),
  ].join('\n');

  writeFileSync(OUT_PATH, doc, 'utf8');
  console.log(`Wrote ${OUT_PATH} (${entries.length} codes).`);
}

main();
