/**
 * Spike 5 sidecar — validate the EPUB with EPUBCheck.
 *
 * Reports number of FATAL/ERROR/WARNING/USAGE messages. Phase 0 success
 * criterion: zero FATAL, zero ERROR. WARNINGs are inspected manually.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import epubchecker from 'epubchecker';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EPUB_PATH = path.join(__dirname, 'output', 'bakeoff.epub');

interface CheckMessage {
  ID?: string;
  severity?: string;
  message?: string;
  locations?: Array<{ path?: string; line?: number; column?: number }>;
}

interface CheckReport {
  checker?: { ePubVersion?: string };
  messages?: CheckMessage[];
}

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const check = (epubchecker as any).default ?? (epubchecker as any);
  const report: CheckReport = await check(EPUB_PATH);

  const messages = report.messages ?? [];
  const counts: Record<string, number> = { FATAL: 0, ERROR: 0, WARNING: 0, USAGE: 0, INFO: 0, SUPPRESSED: 0 };
  for (const m of messages) {
    const sev = (m.severity ?? 'INFO').toUpperCase();
    counts[sev] = (counts[sev] ?? 0) + 1;
  }

  // eslint-disable-next-line no-console
  console.log(`EPUBCheck — version ${report.checker?.ePubVersion ?? '?'}`);
  // eslint-disable-next-line no-console
  console.log('───────────────────────────────────────────────────');
  for (const sev of ['FATAL', 'ERROR', 'WARNING', 'USAGE', 'INFO']) {
    if ((counts[sev] ?? 0) > 0) {
      // eslint-disable-next-line no-console
      console.log(`  ${sev.padEnd(8)} ${counts[sev]}`);
    }
  }
  if (messages.length === 0) {
    // eslint-disable-next-line no-console
    console.log('  No messages reported.');
  }

  // Print details for FATAL + ERROR + WARNING
  const interesting = messages.filter((m) => ['FATAL', 'ERROR', 'WARNING'].includes((m.severity ?? '').toUpperCase()));
  if (interesting.length > 0) {
    // eslint-disable-next-line no-console
    console.log('\nDetails:');
    for (const m of interesting) {
      const loc = m.locations?.[0];
      const where = loc ? ` [${loc.path ?? '?'}:${loc.line ?? '?'}]` : '';
      // eslint-disable-next-line no-console
      console.log(`  [${m.severity}] ${m.ID ?? ''} — ${m.message ?? ''}${where}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log('');

  const failed = (counts.FATAL ?? 0) > 0 || (counts.ERROR ?? 0) > 0;
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('EPUBCheck failed to run:', e);
  process.exit(2);
});
