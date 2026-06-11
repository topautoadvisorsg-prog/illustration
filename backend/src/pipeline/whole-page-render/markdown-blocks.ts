/**
 * Deterministic markdown → render-ready body blocks.
 *
 * The image model cannot be trusted to parse markdown — it renders `###` and
 * `**` as literal characters, intermittently (a customer-facing print defect).
 * So we remove markdown responsibility from the model entirely: parse the body
 * here into typed blocks (heading / subheading / paragraph) whose `text` is
 * PLAIN — no `#`, `*`, `_`, backticks, pipes, or stray emoji can survive to the
 * page. The prompt renders each block by type. Pure, deterministic, testable.
 *
 * v1 strips inline emphasis (keeps the words, drops the markers). Preserving
 * italic/bold spans is a later refinement; eliminating the literal-character
 * bleed is the priority.
 */

export interface BodyBlock {
  type: 'heading' | 'subheading' | 'paragraph';
  text: string;
}

/** Remove all inline markdown/markup so no syntax char reaches the page. */
export function stripInlineMarkup(s: string): string {
  return (s ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/\*([^*]+)\*/g, '$1') // *italic*
    .replace(/__([^_]+)__/g, '$1') // __bold__
    .replace(/_([^_]+)_/g, '$1') // _italic_
    .replace(/`([^`]+)`/g, '$1') // `code`
    .replace(/[*_`#]/g, ' ') // any stray markdown chars
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️]/gu, '') // emoji/symbols
    .replace(/\s*\|\s*/g, ' ') // stray pipes (binomial-header residue)
    .replace(/\[([^\]]*)\]/g, '$1') // [bracket annotations] → keep inner text
    .replace(/[^\S\n]+/g, ' ')
    .trim();
}

/** Parse a markdown body into typed, plain-text blocks. */
export function markdownToBlocks(body: string): BodyBlock[] {
  const lines = (body ?? '').split('\n');
  const blocks: BodyBlock[] = [];
  let para: string[] = [];

  const flushPara = (): void => {
    if (para.length === 0) return;
    const text = stripInlineMarkup(para.join(' '));
    if (text) blocks.push({ type: 'paragraph', text });
    para = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      flushPara();
      continue;
    }
    // F-9 — horizontal rules ("---", "***", "___") are manuscript section
    // separators, never content. Without this they fell through to the
    // paragraph path and the model printed a literal "---" on the page
    // (observed on CH01_P005 and CH02_P010 production renders).
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushPara();
      continue;
    }
    // ATX heading: # … ###### . 1–2 = heading, 3+ = subheading.
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      flushPara();
      const text = stripInlineMarkup(h[2] ?? '');
      if (text) blocks.push({ type: (h[1]?.length ?? 1) >= 3 ? 'subheading' : 'heading', text });
      continue;
    }
    // A whole-line bold lead-in label ("**Natural shelter first:**") → subheading.
    if (/^\*\*[^*]+\*\*:?\s*$/.test(line)) {
      flushPara();
      const text = stripInlineMarkup(line);
      if (text) blocks.push({ type: 'subheading', text });
      continue;
    }
    // List item ("- …" or "* …") → its own paragraph (bullet dropped).
    const li = line.match(/^[-*]\s+(.+)$/);
    if (li) {
      flushPara();
      const text = stripInlineMarkup(li[1] ?? '');
      if (text) blocks.push({ type: 'paragraph', text });
      continue;
    }
    para.push(line);
  }
  flushPara();
  return blocks;
}

/** Clean plain-text body (no markdown) — for the source-review panel + QC. */
export function blocksToPlainText(blocks: BodyBlock[]): string {
  return blocks.map((b) => b.text).join('\n\n');
}
