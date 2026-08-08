/**
 * Automated text-fidelity QA for a rendered whole-page image. Uses a cheap
 * vision-capable chat model (NOT gpt-image-2) to compare the baked text
 * against the literal source, so the operator doesn't have to eyeball every
 * word manually — a chat-completion call costs a fraction of a generation.
 */

import OpenAI from 'openai';
import { getEnv, isPlaceholder } from '../../env.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const env = getEnv();
  if (isPlaceholder(env.OPENAI_API_KEY)) {
    throw new Error('OPENAI_API_KEY is not configured; AI review is disabled.');
  }
  client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 1 });
  return client;
}

export interface TextReviewResult {
  pass: boolean;
  issues: string[];
  transcription?: string;
  model: string;
  /**
   * Token usage for THIS call. Reported so batch cost can be measured rather
   * than assumed — the cost-control policy forbids calling an operation cheap
   * without measuring it, and this review was run ~200 times on the assumption
   * it was inexpensive. Image tokens dominate: a full-page render sent at
   * detail:'high' is the bulk of promptTokens.
   */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// Two-step (transcribe, then diff) instead of "just tell me what's wrong" —
// forcing the model to commit to what it actually reads before judging gives
// it an anchor to compare against, instead of pattern-matching straight to a
// verdict. Testing showed the single-step version both missing real typos and
// inventing false positives; this is the fix attempt, not a proven cure.
const SYSTEM_PROMPT = `You are a meticulous proofreader for a print book. You will be shown a photo of a finished, illustrated book page and given the exact source text that should have been baked into that page's typography.

Work in two steps:
1. TRANSCRIBE: Read the body text baked into the image and transcribe it EXACTLY as printed, letter for letter, including any misspellings you see — do not silently correct anything. Ignore headings/subheadings styling, just capture the words in reading order.
2. COMPARE: Compare your transcription against the provided source text, word by word. List every place they differ.

Report ONLY genuine spelling/typography defects found by that comparison:
- misspelled, garbled, or invented words
- dropped, added, transposed, or duplicated letters
- dropped or duplicated words
- any text (captions, labels, scientific names) appearing inside the illustration itself, outside the main body-text column

Do NOT report: font style choices, illustration content/quality, layout, color, or anything that is not a literal text-accuracy defect. Ignore markdown-bold markers (**) from the source since they are not meant to be printed — they are formatting, not content.

Do NOT report typographic punctuation differences. These are CORRECT typesetting, not defects, and reporting them sends a good page for an expensive re-render:
- curly/smart quotes and apostrophes (' ' " ") versus straight ones (' ") — treat them as identical
- en/em dashes (– —) versus hyphens (-) — treat them as identical
- ellipsis character (…) versus three periods (...) — treat them as identical
- ligatures (ﬁ ﬂ) versus their separate letters — treat them as identical
A printed book SHOULD use curly apostrophes and proper dashes even when the source text uses plain ASCII. Only report a punctuation mark when it changes the sentence's meaning or grammar — for example a period printed where the source has a question mark.

Respond with STRICT JSON only, no markdown fences, in this exact shape:
{"transcription": "your full step-1 transcription", "pass": boolean, "issues": ["one specific word-level defect per entry, in the form: WRONG_WORD (as printed) -> CORRECT_WORD (from source)"]}
"pass" is true only if issues is empty. Every issue must name a SPECIFIC word that differs — never describe a defect without quoting the exact wrong word and the exact correct word side by side.`;

export async function reviewRenderedText(imagePngBuffer: Buffer, sourceText: string): Promise<TextReviewResult> {
  const env = getEnv();
  const openai = getClient();
  const b64 = imagePngBuffer.toString('base64');

  const response = await openai.chat.completions.create({
    model: env.OPENAI_REVIEW_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `SOURCE TEXT (must match exactly):\n\n${sourceText}` },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}`, detail: 'high' } },
        ],
      },
    ],
    // gpt-5.5 only supports its default temperature (1) — no low-temperature
    // determinism knob on this model generation. Accepted tradeoff for the
    // reasoning-quality improvement.
    // gpt-5.5 is a REASONING model: its internal reasoning tokens are billed
    // against this same budget before a single output token is produced. At
    // 3000 the densest pages spent the entire allowance reasoning and returned
    // an empty completion — surfacing as "AI review returned no content" and
    // costing a full paid call for no result. It reproduced on exactly the
    // text-heaviest pages (the look-alikes comparison table, the packed larch
    // page, the knots pages) and never on sparse ones, which is the signature.
    // Measured successful completions average ~1250 tokens, so the output
    // itself was never the problem; the reasoning overhead on top of it was.
    max_completion_tokens: 8000,
    response_format: { type: 'json_object' },
  });

  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error('AI review returned no content.');

  let parsed: { pass?: unknown; issues?: unknown; transcription?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI review returned non-JSON output: ${raw.slice(0, 300)}`);
  }

  const issues = Array.isArray(parsed.issues) ? parsed.issues.filter((x): x is string => typeof x === 'string') : [];
  const pass = typeof parsed.pass === 'boolean' ? parsed.pass : issues.length === 0;
  const transcription = typeof parsed.transcription === 'string' ? parsed.transcription : undefined;

  const u = response.usage;
  return {
    pass,
    issues,
    transcription,
    model: env.OPENAI_REVIEW_MODEL,
    usage: u
      ? { promptTokens: u.prompt_tokens ?? 0, completionTokens: u.completion_tokens ?? 0, totalTokens: u.total_tokens ?? 0 }
      : undefined,
  };
}
