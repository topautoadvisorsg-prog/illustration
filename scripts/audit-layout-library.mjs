import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendApp = path.join(root, 'frontend', 'src', 'App.js');
const sharedIndex = path.join(root, 'shared', 'src', 'index.ts');
const planner = path.join(root, 'backend', 'src', 'pipeline', 'stage-2-planner', 'plan-pages.ts');

const appText = fs.readFileSync(frontendApp, 'utf8');
const sharedText = fs.readFileSync(sharedIndex, 'utf8');
const plannerText = fs.readFileSync(planner, 'utf8');

const failures = [];
const warnings = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

const templateBlock = appText.match(/const LAYOUT_TEMPLATES = \[([\s\S]*?)\];/);
assert(Boolean(templateBlock), 'Could not find LAYOUT_TEMPLATES block in frontend/src/App.js.');

const templateMatches = [...(templateBlock?.[1] ?? '').matchAll(/\["(LAYOUT_\d+_[A-Z0-9_]+)",\s*"([^"]+)"/g)];
const templates = templateMatches.map((match) => ({ id: match[1], label: match[2] }));
const uniqueIds = new Set(templates.map((template) => template.id));

assert(templates.length >= 16, `Expected at least 16 layout templates, found ${templates.length}.`);
assert(uniqueIds.size === templates.length, 'Layout template IDs must be unique.');

for (const { id } of templates) {
  assert(sharedText.includes(`'${id}'`), `${id} is missing from shared LayoutTemplateIdSchema.`);
  assert(plannerText.includes(`${id}: { minWords:`), `${id} is missing default planner capacity.`);
  assert(appText.includes(`id === "${id}"`), `${id} is missing frontend metadata branches.`);
}

const imageRefs = [...appText.matchAll(/"(\/layout-references\/[^"]+\.png)"/g)].map((match) => match[1]);
const uniqueImageRefs = [...new Set(imageRefs)];
assert(uniqueImageRefs.length >= templates.length, `Expected at least ${templates.length} layout image refs, found ${uniqueImageRefs.length}.`);

for (const imageRef of uniqueImageRefs) {
  const imagePath = path.join(root, 'frontend', 'public', imageRef.replace(/^\//, ''));
  assert(fs.existsSync(imagePath), `Missing layout reference image: ${imageRef}`);
  if (fs.existsSync(imagePath)) {
    const size = fs.statSync(imagePath).size;
    assert(size > 50_000, `Layout reference image appears too small or broken: ${imageRef} (${size} bytes).`);
  }
}

for (let index = 1; index <= templates.length; index += 1) {
  const padded = String(index).padStart(2, '0');
  warn(uniqueImageRefs.some((imageRef) => imageRef.includes(`layout-${padded}-`)), `No canonical layout-${padded}-*.png reference found.`);
}

const requiredRuleSnippets = [
  'Treat the selected layout as a strong reference template',
  'Preserve future text areas above all else',
  'Do not generate readable text by default',
  'explicit subject-name label',
  'large and legible',
  'Limit callouts to 0-2',
  'Negative space is intentional',
];

for (const snippet of requiredRuleSnippets) {
  assert(appText.includes(snippet), `Frontend layout system rules missing: ${snippet}`);
  assert(plannerText.includes(snippet), `Backend prompt safety rules missing: ${snippet}`);
}

assert(plannerText.includes('labelTextRules(page)'), 'Planner must append exact subject-name label rules into composition notes.');
assert(plannerText.includes('appendPromptSafetyRules(promptTemplate)'), 'Planner must append safety rules to final prompts.');
assert(sharedText.includes("comparisonTemplate: LayoutTemplateIdSchema.default('LAYOUT_4_DANGER_WARNING')"), 'Comparison default must point to the comparison layout.');

const forbiddenStalePhrases = [
  'validates the 9-layout',
  'chooses one of the 9 layout',
  'Do not generate readable text anywhere in the image',
];

for (const phrase of forbiddenStalePhrases) {
  assert(!appText.includes(phrase), `Frontend still contains stale phrase: ${phrase}`);
  assert(!plannerText.includes(phrase), `Planner still contains stale phrase: ${phrase}`);
}

if (warnings.length > 0) {
  console.warn('Layout audit warnings:');
  for (const message of warnings) console.warn(`- ${message}`);
}

if (failures.length > 0) {
  console.error('Layout audit failed:');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Layout audit passed: ${templates.length} templates, ${uniqueImageRefs.length} image references, safety rules enforced.`);
