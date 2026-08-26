/**
 * calibrate-vision — run the evidence profile against the labelled set.
 *
 *   tsx scripts/qa/calibrate-vision.ts --set DIR --split TUNING
 *   tsx scripts/qa/calibrate-vision.ts --set DIR --split HOLDOUT   (once, at the end)
 *
 * The model sees the page and NOTHING ELSE: no role, no label, no hint that a
 * sample is expected to be good or bad. Its observations are then handed to the
 * policy layer together with the role, and the policy's classification is
 * compared with ground truth held in `labels.json`.
 *
 * HOLDOUT IS RUN ONCE, after tuning looks finished. It is the only defence
 * against a prompt that has learned the examples rather than the job. If you
 * find yourself running holdout repeatedly and adjusting between runs, it has
 * stopped being a holdout.
 *
 * PAID, but small: one image per sample.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  PAGE_EVIDENCE_PROFILE,
  buildObservationRequest,
  validateObservations,
} from '../../src/pipeline/page-qa/vision-observations.js';
import { applyVisionPolicy, isDefect } from '../../src/pipeline/page-qa/vision-policy.js';
import type { PageRole } from '../../src/pipeline/page-qa/page-roles.js';
import { VisionCache, callVisionProfile } from '../../src/services/vision/vision-core.js';

const argv = process.argv.slice(2);
const flag = (n: string): string | undefined => {
  const hit = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (!hit) return undefined;
  if (hit.includes('=')) return hit.slice(hit.indexOf('=') + 1);
  const next = argv[argv.indexOf(hit) + 1];
  return next && !next.startsWith('--') ? next : '';
};

const SET = flag('set') ?? '.page-qa/calibration';
const SPLIT = (flag('split') ?? 'TUNING').toUpperCase();

interface Sample {
  id: string;
  file: string;
  label: 'GOOD' | 'BAD';
  role: PageRole;
  defect?: string;
  expect: 'CLEAN_OR_EXPECTED' | 'REVIEW_OR_WORSE' | 'HARD_FAIL';
  split: 'TUNING' | 'HOLDOUT';
}

const { samples } = JSON.parse(readFileSync(path.join(SET, 'labels.json'), 'utf8')) as { samples: Sample[] };
const chosen = SPLIT === 'ALL' ? samples : samples.filter((s) => s.split === SPLIT);
const cache = new VisionCache(path.join(SET, '.vision-cache'));

console.log('');
console.log(`VISION CALIBRATION — ${SPLIT}`);
console.log(`  profile ${PAGE_EVIDENCE_PROFILE.id}@${PAGE_EVIDENCE_PROFILE.version}   samples ${chosen.length}`);
console.log('─'.repeat(104));
console.log(`  ${'sample'.padEnd(30)} ${'role'.padEnd(15)} ${'truth'.padEnd(6)} ${'policy'.padEnd(10)} outcome`);
console.log('─'.repeat(104));

interface Row {
  id: string;
  role: PageRole;
  label: string;
  expect: string;
  policy: string;
  outcome: 'TRUE_POSITIVE' | 'TRUE_NEGATIVE' | 'FALSE_POSITIVE' | 'FALSE_NEGATIVE' | 'UNPARSED';
  defect?: string;
  concern?: string;
  contentEndsAtPercent?: number;
}
const rows: Row[] = [];

for (const s of chosen) {
  const png = readFileSync(path.join(SET, s.file));
  const res = await callVisionProfile({
    profile: PAGE_EVIDENCE_PROFILE,
    images: [{ label: 'page under review', png }],
    cache,
    userText: buildObservationRequest(1),
    validate: validateObservations,
  });

  if (!res.parsed) {
    rows.push({ id: s.id, role: s.role, label: s.label, expect: s.expect, policy: 'UNPARSED', outcome: 'UNPARSED', defect: s.defect });
    console.log(`  ${s.id.padEnd(30)} ${s.role.padEnd(15)} ${s.label.padEnd(6)} ${'UNPARSED'.padEnd(10)} ERROR${res.error ? ` ${res.error.slice(0, 40)}` : ''}`);
    continue;
  }

  const policy = applyVisionPolicy(res.parsed, s.role);
  const flaggedByPolicy = isDefect(policy);
  const shouldFlag = s.label === 'BAD';
  const outcome: Row['outcome'] = flaggedByPolicy
    ? shouldFlag
      ? 'TRUE_POSITIVE'
      : 'FALSE_POSITIVE'
    : shouldFlag
      ? 'FALSE_NEGATIVE'
      : 'TRUE_NEGATIVE';

  rows.push({
    id: s.id,
    role: s.role,
    label: s.label,
    expect: s.expect,
    policy: policy.overall,
    outcome,
    defect: s.defect,
    concern: policy.modelConcern,
    contentEndsAtPercent: res.parsed.fill.contentEndsAtPercent,
  });

  const mark = outcome === 'TRUE_POSITIVE' || outcome === 'TRUE_NEGATIVE' ? 'ok  ' : 'MISS';
  console.log(
    `  ${s.id.padEnd(30)} ${s.role.padEnd(15)} ${s.label.padEnd(6)} ${policy.overall.padEnd(10)} ${mark} ${outcome}` +
      `   [ends ${res.parsed.fill.contentEndsAtPercent}%]`,
  );
  if (policy.findings.length) {
    for (const f of policy.findings.slice(0, 2)) console.log(`  ${' '.repeat(30)} -> ${f.code}: ${f.evidence.slice(0, 74)}`);
  }
}

const n = (o: Row['outcome']) => rows.filter((r) => r.outcome === o).length;
const tp = n('TRUE_POSITIVE');
const tn = n('TRUE_NEGATIVE');
const fp = n('FALSE_POSITIVE');
const fn = n('FALSE_NEGATIVE');
const bad = rows.filter((r) => r.label === 'BAD').length;
const good = rows.filter((r) => r.label === 'GOOD').length;

console.log('─'.repeat(104));
console.log(`  true positives  ${tp} of ${bad} bad      false negatives ${fn}`);
console.log(`  true negatives  ${tn} of ${good} good     false positives ${fp}`);
console.log(`  unparsed        ${n('UNPARSED')}`);
if (bad) console.log(`  recall          ${tp}/${bad}  (${((tp / bad) * 100).toFixed(0)}%)`);
if (good) console.log(`  false-pos rate  ${fp}/${good}  (${((fp / good) * 100).toFixed(0)}%)`);
console.log(`  NOTE: ${rows.length} samples. Raw counts are the meaningful figure at this size.`);

// The permanent negative control must never pass.
const control = rows.find((r) => r.id === 'bad-body-erased-45');
if (control) {
  const ok = control.outcome === 'TRUE_POSITIVE';
  console.log('');
  console.log(`  NEGATIVE CONTROL bad-body-erased-45: ${ok ? 'CAUGHT' : 'MISSED'}  (${control.policy})`);
}
const contrast = rows.find((r) => r.id === 'good-chapterend-erased-45');
if (contrast) {
  const ok = contrast.outcome === 'TRUE_NEGATIVE';
  console.log(`  ROLE CONTRAST    good-chapterend-erased-45: ${ok ? 'CORRECTLY ACCEPTED' : 'WRONGLY FLAGGED'}  (${contrast.policy})`);
}

const s = cache.stats;
console.log('');
console.log(`  cache hits ${s.hits}   misses ${s.misses} (paid)   failures ${s.failures}   prompt tok ${s.promptTokens}   completion tok ${s.completionTokens}`);

writeFileSync(
  path.join(SET, `results-${SPLIT.toLowerCase()}.json`),
  JSON.stringify(
    { profile: `${PAGE_EVIDENCE_PROFILE.id}@${PAGE_EVIDENCE_PROFILE.version}`, split: SPLIT, counts: { tp, tn, fp, fn }, stats: s, rows },
    null,
    2,
  ),
);
console.log(`\n  results-${SPLIT.toLowerCase()}.json written\n`);
