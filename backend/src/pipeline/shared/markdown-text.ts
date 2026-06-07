/**
 * Shared markdown text helpers — single source of truth for char/word counting.
 *
 * Before this module, four files (plan-pages.ts, stream.ts, layout-sequence.ts,
 * flow-engine.ts) each carried their own copy of the same regex chain. They
 * drift over time; centralizing here prevents that.
 *
 * The strip behavior MUST stay identical across the pipeline because Stage 6
 * text-fit and Stage 1.75 pagination both decide "does this fit" from the same
 * char count. If you change strip behavior, change it here and re-run every
 * stage's tests.
 */

/**
 * Strip markdown formatting down to plain text for char/word counting.
 *
 * Strips, in order: fenced code blocks, inline code, image embeds, link syntax,
 * markdown punctuation (#, >, *, _, ~, |, `, -). Collapses whitespace.
 *
 * NOTE: fenced code blocks and image embeds are removed ENTIRELY by this
 * function. Atomic-block tokens in Stage 1.75 use raw markdown length instead
 * because the fence content still has to render on the page even though it
 * looks like "zero chars" to this function.
 */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[#>*_~|`-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Char count of the stripped text. Use raw `markdown.length` for atomic blocks. */
export function countChars(markdown: string): number {
  return stripMarkdown(markdown).length;
}

/** Word count of the stripped text. Empty body returns 0. */
export function countWords(markdown: string): number {
  const text = stripMarkdown(markdown);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}
