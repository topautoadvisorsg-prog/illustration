/**
 * Pre-flight prompt sanity check — NO IMAGE SPEND. Runs before the operator
 * commits to a paid render: does this page's spec actually make sense (right
 * subject for the entry, body text intact and not truncated/garbled at the
 * JSON level, nothing internally contradictory)? Text-only chat completion,
 * a fraction of even the text-review call's cost since there's no image.
 *
 * This is a single, explicit, operator-triggered check — never automatic,
 * never looped. Same discipline as everything else in this pipeline: one
 * request, and if something looks wrong, the operator investigates and fixes
 * the source data before trying again. It does not retry itself.
 */

import OpenAI from 'openai';
import { getEnv, isPlaceholder } from '../../env.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const env = getEnv();
  if (isPlaceholder(env.OPENAI_API_KEY)) {
    throw new Error('OPENAI_API_KEY is not configured; prompt review is disabled.');
  }
  client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 1 });
  return client;
}

export interface PromptReviewResult {
  pass: boolean;
  issues: string[];
  model: string;
}

const SYSTEM_PROMPT = `You are a pre-flight checker for a print-book page-generation pipeline. You will be given the page's context (entry title, chapter, illustration subject) and the literal body text that is about to be baked into a page image by an expensive AI image call. Your job is to catch problems BEFORE that money gets spent.

Check for:
1. SUBJECT MISMATCH — does the illustration subject actually match the entry title / species / topic? (e.g. an entry titled "Black Bear" whose illustration subject says "Wolverine" is wrong.)
2. TRUNCATED OR BROKEN TEXT — does the body text look cut off mid-sentence, duplicated, or contain obvious data corruption (garbled characters, repeated blocks, JSON artifacts leaking into the prose)?
3. EMPTY OR PLACEHOLDER CONTENT — placeholder text like "TODO", "Lorem ipsum", empty strings where real content is expected.
4. WRONG-SUBJECT TEXT — the body text is actually ABOUT a different animal/plant/topic than the entry claims to be (e.g. an entry titled "Black Bear" whose body paragraphs describe wolf pack behavior throughout, with no bear content at all). This means the WRONG CONTENT got assigned to this page — a real data-pipeline bug.

CRITICAL — this is naturalist field-guide writing, and comparing or contrasting the entry's subject against OTHER species by name is a normal, deliberate, and frequent technique in this book, NOT a defect:
- Identification sections routinely say things like "unlike black bears, grizzlies have..." — naming the OTHER animal is exactly how you teach the reader to tell two species apart. This is correct, not a mismatch.
- Hooks and closing lines often open with a rhetorical contrast ("Everyone remembers the wolves. What they actually remember is the mosquito that ruined the evening.") to make a point about the ACTUAL subject. Mentioning the other animal is the literary device, not an error.
- Only flag WRONG-SUBJECT TEXT when the entry's OWN topic is genuinely absent or when another subject has clearly and mistakenly REPLACED it as the actual content — never merely because another species/plant/place is named somewhere in the text. When in doubt because the text plausibly reads as a deliberate comparison or contrast, do NOT flag it — false alarms cost the operator time on every single page and erode trust in every future warning; only flag what you are confident is a genuine pipeline error.

Do NOT flag: writing style, prompt length, illustration style choices, comparative/contrastive references to other species, or anything that isn't a concrete, checkable defect from the list above. If everything looks consistent and complete, pass.

Respond with STRICT JSON only, no markdown fences:
{"pass": boolean, "issues": ["specific defect, quoting the exact mismatched text"]}`;

export async function reviewPromptSanity(input: {
  entryTitle: string;
  chapterLabel?: string;
  illustrationSubject: string;
  bodyText: string;
}): Promise<PromptReviewResult> {
  const env = getEnv();
  const openai = getClient();

  const userContent = [
    `ENTRY TITLE: ${input.entryTitle || '(none — front/back matter page)'}`,
    input.chapterLabel ? `CHAPTER: ${input.chapterLabel}` : '',
    `ILLUSTRATION SUBJECT (what the image model was told to draw): ${input.illustrationSubject}`,
    `BODY TEXT (what the image model will bake in as typography):\n\n${input.bodyText || '(none)'}`,
  ].filter(Boolean).join('\n\n');

  const response = await openai.chat.completions.create({
    model: env.OPENAI_REVIEW_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    // gpt-5.5 only supports its default temperature (1) — no low-temperature
    // determinism knob on this model generation. Accepted tradeoff for the
    // reasoning-quality improvement.
    max_completion_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Prompt review returned no content.');

  let parsed: { pass?: unknown; issues?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Prompt review returned non-JSON output: ${raw.slice(0, 300)}`);
  }

  const issues = Array.isArray(parsed.issues) ? parsed.issues.filter((x): x is string => typeof x === 'string') : [];
  const pass = typeof parsed.pass === 'boolean' ? parsed.pass : issues.length === 0;

  return { pass, issues, model: env.OPENAI_REVIEW_MODEL };
}
