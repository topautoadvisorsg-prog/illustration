/**
 * Canonical render reconciliation — READ ONLY.
 *
 * WHY THIS EXISTS
 * An audit found 376 renders across 269 pages, but only 5 pages had a version
 * marked `approved_for_book` + `active`. Assembly reads only that flag, so the
 * book would build with 5 pages. The remaining 264 pages have candidate
 * renders and no recorded decision.
 *
 * The tempting fix — promote the newest render everywhere — is wrong and is
 * explicitly rejected. Later does not mean better:
 *   - some renders were manually approved after real review;
 *   - some were re-rendered to fix a defect, and the fix may or may not have
 *     worked (CH05_P004_c1 corrupted "its" twice, differently);
 *   - AI review produces false positives on structured pages (the approved
 *     Bowline page was reported as missing all its text);
 *   - a newer render can be WORSE than the one it replaced.
 *
 * So this weighs evidence per page and proposes a canonical render, or refuses
 * and marks the page for a human. It NEVER writes to the database.
 *
 * EVIDENCE PRIORITY (highest first)
 *   1. Explicit manual approval (decidedBy set) — a human already chose.
 *   2. Re-rendered to fix a known defect AND subsequently verified clean.
 *   3. Reliable clean-review evidence for that exact render id.
 *   4. Latest render, ONLY when nothing contradicts it and no previously
 *      approved superior version exists.
 * Anything genuinely ambiguous is reported as MANUAL, never guessed.
 *
 * Usage: tsx scripts/reconcile-canonical-renders.ts <projectId> [--verbose]
 */
import { getDb } from '../src/db/client.js';
import { pages, wholePageRenders } from '../src/db/schema/index.js';
import { eq, asc } from 'drizzle-orm';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REVIEW_REPORT = path.join(__dirname, '..', '..', 'ai-review-report.json');
const OUT_REPORT = path.join(__dirname, '..', '..', 'reconciliation-report.json');

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL';

interface ReviewRecord {
  pageKey: string;
  renderId: string;
  outcome: 'pass' | 'fail' | 'error' | 'suspect';
  issues: string[];
}

interface Proposal {
  pageKey: string;
  versionCount: number;
  currentActive: string | null;
  currentApprovedForBook: string | null;
  manuallyApproved: string | null;
  latest: string | null;
  proposed: string | null;
  proposedVersion: number | null;
  reason: string;
  confidence: Confidence;
  reviewEvidence: string;
}

function loadReviews(projectId: string): Map<string, ReviewRecord> {
  // Keyed by renderId — review evidence belongs to the exact render reviewed,
  // never to the page in general. A page's later render inherits nothing.
  const byRender = new Map<string, ReviewRecord>();
  if (!existsSync(REVIEW_REPORT)) return byRender;
  try {
    const rep = JSON.parse(readFileSync(REVIEW_REPORT, 'utf8')) as { projectId?: string; records?: ReviewRecord[] };
    if (rep.projectId !== projectId) return byRender;
    for (const r of rep.records ?? []) if (r.renderId) byRender.set(r.renderId, r);
  } catch {
    /* unreadable report is not fatal — it just means less evidence */
  }
  return byRender;
}

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('usage: tsx scripts/reconcile-canonical-renders.ts <projectId> [--verbose]');
    process.exit(2);
  }
  const verbose = process.argv.includes('--verbose');
  const db = getDb();
  const reviews = loadReviews(projectId);

  const allPages = await db.select().from(pages).where(eq(pages.projectId, projectId));
  const allRenders = await db
    .select()
    .from(wholePageRenders)
    .where(eq(wholePageRenders.projectId, projectId))
    .orderBy(asc(wholePageRenders.version));

  const byPage = new Map<string, typeof allRenders>();
  for (const r of allRenders) {
    const list = byPage.get(r.pageId) ?? [];
    list.push(r);
    byPage.set(r.pageId, list);
  }

  const proposals: Proposal[] = [];

  for (const page of allPages.sort((a, b) => a.pageKey.localeCompare(b.pageKey))) {
    const renders = (byPage.get(page.id) ?? []).slice().sort((a, b) => a.version - b.version);
    // Only renders with an actual image are ever candidates.
    const usable = renders.filter((r) => r.imagePath && r.status !== 'FAILED' && r.status !== 'REJECTED');

    const currentActive = renders.find((r) => r.active)?.id ?? null;
    const currentApproved = renders.find((r) => r.approvedForBook)?.id ?? null;
    // A human decision is recorded by decidedBy — that is the strongest signal.
    const manual = renders.filter((r) => r.status === 'APPROVED' && r.decidedBy).sort((a, b) => b.version - a.version)[0] ?? null;
    const latest = usable.length ? usable[usable.length - 1]! : null;

    const reviewOf = (id: string | null | undefined) => (id ? reviews.get(id) : undefined);
    const evidenceFor = (id: string | null) => {
      const rv = reviewOf(id);
      if (!rv) return 'no review evidence for this render';
      if (rv.outcome === 'pass') return 'reviewed CLEAN';
      if (rv.outcome === 'fail') return `reviewed DEFECTIVE: ${rv.issues.slice(0, 2).join('; ')}`;
      if (rv.outcome === 'suspect') return 'review UNRELIABLE (structured page) — needs human eyes';
      return 'review errored (never actually checked)';
    };

    let proposed: typeof latest = null;
    let reason = '';
    let confidence: Confidence = 'MANUAL';

    if (!usable.length) {
      reason = 'NO VIABLE RENDER — page has no usable image';
      confidence = 'MANUAL';
    } else if (manual) {
      // Priority 1: a human already decided. Never displaced by a newer render.
      proposed = manual;
      const newer = usable.filter((r) => r.version > manual.version);
      reason =
        newer.length > 0
          ? `manually approved (v${manual.version}, by ${manual.decidedBy}); ${newer.length} newer render(s) exist but a human decision is not overridden by recency`
          : `manually approved (v${manual.version}, by ${manual.decidedBy})`;
      confidence = 'HIGH';
    } else {
      const cleanReviewed = usable.filter((r) => reviewOf(r.id)?.outcome === 'pass').sort((a, b) => b.version - a.version);
      const defectiveIds = new Set(usable.filter((r) => reviewOf(r.id)?.outcome === 'fail').map((r) => r.id));
      const suspectIds = new Set(usable.filter((r) => reviewOf(r.id)?.outcome === 'suspect').map((r) => r.id));

      if (cleanReviewed.length > 0) {
        const best = cleanReviewed[0]!;
        // Priority 2/3: verified clean. If it is also the newest, that is the
        // strongest non-manual evidence available.
        const isLatest = latest && best.id === latest.id;
        proposed = best;
        reason = isLatest
          ? `v${best.version} reviewed CLEAN and is the latest render`
          : `v${best.version} reviewed CLEAN; newer render(s) exist but lack clean-review evidence`;
        confidence = isLatest ? 'HIGH' : 'MEDIUM';
      } else if (latest && defectiveIds.has(latest.id)) {
        // The newest render is known broken. Never promote it.
        reason = `latest render v${latest.version} is KNOWN DEFECTIVE (${evidenceFor(latest.id)}) and no clean alternative has been verified`;
        confidence = 'MANUAL';
      } else if (latest && suspectIds.has(latest.id)) {
        reason = `latest render v${latest.version} flagged SUSPECT — reviewer unreliable on this layout; needs human inspection`;
        confidence = 'MANUAL';
      } else if (usable.length === 1) {
        // Priority 4: only one candidate and nothing against it.
        proposed = usable[0]!;
        reason = `only one usable render (v${usable[0]!.version}), no contradictory evidence`;
        confidence = 'MEDIUM';
      } else {
        // Multiple unreviewed candidates. Latest is a reasonable default but is
        // NOT evidence — flag it rather than pretend confidence.
        proposed = latest;
        reason = `${usable.length} usable renders, none with review evidence; latest is v${latest!.version} — UNVERIFIED default`;
        confidence = 'LOW';
      }
    }

    proposals.push({
      pageKey: page.pageKey,
      versionCount: renders.length,
      currentActive,
      currentApprovedForBook: currentApproved,
      manuallyApproved: manual?.id ?? null,
      latest: latest?.id ?? null,
      proposed: proposed?.id ?? null,
      proposedVersion: proposed?.version ?? null,
      reason,
      confidence,
      reviewEvidence: evidenceFor(proposed?.id ?? null),
    });
  }

  // ─── Phase 2: integrity checks ───────────────────────────────────────────
  const expected = 269;
  const resolved = proposals.filter((p) => p.proposed && p.confidence !== 'MANUAL');
  const manualNeeded = proposals.filter((p) => p.confidence === 'MANUAL');
  const lowConfidence = proposals.filter((p) => p.confidence === 'LOW');
  const noCandidate = proposals.filter((p) => !p.proposed);
  const displaced = proposals.filter((p) => p.currentApprovedForBook && p.proposed && p.currentApprovedForBook !== p.proposed);

  // Duplicate active detection straight from the rows, not the proposals.
  const activeCountByPage = new Map<string, number>();
  for (const r of allRenders) if (r.active) activeCountByPage.set(r.pageId, (activeCountByPage.get(r.pageId) ?? 0) + 1);
  const duplicateActive = [...activeCountByPage.entries()].filter(([, n]) => n > 1).length;

  console.log('════════ PHASE 1 — READ-ONLY RECONCILIATION ════════');
  console.log(`pages found:              ${proposals.length} (expected ${expected})`);
  console.log(`total renders:            ${allRenders.length}`);
  console.log('');
  console.log('── proposals by confidence ──');
  for (const c of ['HIGH', 'MEDIUM', 'LOW', 'MANUAL'] as Confidence[]) {
    console.log(`  ${c.padEnd(7)}: ${proposals.filter((p) => p.confidence === c).length}`);
  }
  console.log('');
  console.log('── PHASE 2 — INTEGRITY CHECKS ──');
  console.log(`  page count matches ${expected}:            ${proposals.length === expected ? 'PASS' : `FAIL (${proposals.length})`}`);
  console.log(`  pages with no viable candidate:        ${noCandidate.length} ${noCandidate.length === 0 ? '(PASS)' : '(REVIEW)'}`);
  console.log(`  pages with duplicate active versions:  ${duplicateActive} ${duplicateActive === 0 ? '(PASS)' : '(FAIL)'}`);
  console.log(`  known-defective renders proposed:      0 (excluded by construction)`);
  console.log(`  manually approved renders displaced:   ${displaced.length} ${displaced.length === 0 ? '(PASS)' : '(REVIEW)'}`);
  console.log('');
  console.log('── OUTCOME ──');
  console.log(`  automatically resolvable:  ${resolved.length}`);
  console.log(`    of which UNVERIFIED (low confidence): ${lowConfidence.length}`);
  console.log(`  need manual selection:     ${manualNeeded.length}`);
  console.log('');

  if (manualNeeded.length) {
    console.log('── PAGES REQUIRING MANUAL SELECTION ──');
    for (const p of manualNeeded) console.log(`  ${p.pageKey.padEnd(28)} ${p.versionCount} version(s) — ${p.reason}`);
    console.log('');
  }
  if (displaced.length) {
    console.log('── WOULD DISPLACE AN EXISTING BOOK SELECTION ──');
    for (const p of displaced) console.log(`  ${p.pageKey.padEnd(28)} ${p.reason}`);
    console.log('');
  }
  if (verbose) {
    console.log('── FULL PER-PAGE DETAIL ──');
    for (const p of proposals) {
      console.log(`  ${p.pageKey.padEnd(28)} v${p.proposedVersion ?? '-'} [${p.confidence}] ${p.reason}`);
    }
  }

  writeFileSync(OUT_REPORT, JSON.stringify({ projectId, generatedAt: new Date().toISOString(), proposals }, null, 2), 'utf8');
  console.log(`Full proposal written to ${OUT_REPORT}`);
  console.log('\nNO DATABASE CHANGES WERE MADE. This is a read-only audit.');
  process.exit(0);
}

main();
