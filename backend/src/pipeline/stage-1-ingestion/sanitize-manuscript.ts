/**
 * Manuscript input sanitizer — a production safety guard.
 *
 * Dirty manuscript input must never reach breakdown, pagination, prompts, or a
 * paid image render. This runs ONCE at ingestion (before the manuscript is
 * stored) and does exactly three things, conservatively:
 *
 *   1. Repair common double-encoded (mojibake) punctuation — em/en dashes,
 *      curly quotes, apostrophes, ellipses.
 *   2. Strip decorative icon markers — emoji glyphs and literal "ICON: x" tokens
 *      (e.g. "[ICON: pine]", "ICON: warning") that would otherwise bake as
 *      literal text into a heading or body line.
 *   3. Tidy only the whitespace the removals leave behind.
 *
 * It NEVER removes real words, scientific names, measurements, headings, or
 * safety-warning copy — only decorative artifacts and broken encoding.
 *
 * KNOWN LIMIT - "decorative" is an assumption, not a fact.
 *
 * Rule 2 treats every Extended_Pictographic character as decoration. That is
 * right for a stray sparkle in a heading and WRONG for a pictograph an author
 * is using as MEANING: a flag marking a warning, a triangle before a safety
 * line, a tick/cross pair carrying a contrast. Those are content. The
 * sanitizer cannot tell the difference, so it strips them, and because it runs
 * ONCE at ingestion the loss lands in the STORED WORKING COPY. Every later
 * stage - pagination, prompts, the rendered PDF - then sees a manuscript that
 * never had the marker.
 *
 * Nothing downstream reports it. Text-fidelity QA compares the PARSED sections
 * against the PDF, so both sides are already missing the character and the
 * check passes clean. The canonical hash still covers the original upload
 * (canonicalManuscriptSha256), which is what makes recovery possible - but
 * only for someone who already suspects a marker is gone. None of this is an
 * alarm; it is silent by construction.
 *
 * This has bitten once already: a flag marker was restored only because we
 * happened to know to look for it. Treat that as the expected failure mode
 * rather than a one-off. Before accepting a new book, diff the canonical
 * upload against the working copy for pictographs and confirm every removal
 * was genuinely decorative.
 *
 * Fixing it properly means an allow-list of meaningful pictographs mapped to
 * typographic equivalents the interior can actually set - the layout already
 * draws tick, cross and flag as vector glyphs, see the `.gl` rules in
 * typeset-book.ts - plus a report of what was stripped. That is a deliberate
 * change to ingestion, not a tweak, and it is NOT done.
 *
 * The whole file is ASCII: every non-ASCII character is a \u escape, so the
 * source encoding can never corrupt the patterns. Mojibake source: a UTF-8
 * punctuation mark is 3 bytes (E2 80 xx); decoded as Windows-1252 those bytes
 * surface as U+00E2, U+20AC, and the CP1252 mapping of the third byte. We match
 * that exact 3-codepoint sequence and swap it for the intended character.
 */

/** Double-encoded punctuation sequence -> intended character. */
const MOJIBAKE: ReadonlyArray<readonly [string, string]> = [
  ['â€”', '—'], // -> em dash (U+2014), third byte 0x94
  ['â€“', '–'], // -> en dash (U+2013), third byte 0x93
  ['â€™', '’'], // -> right single quote / apostrophe, 0x99
  ['â€˜', '‘'], // -> left single quote, 0x98
  ['â€œ', '“'], // -> left double quote, 0x9c
  ['â€', '”'], // -> right double quote, 0x9d
  ['â€¦', '…'], // -> ellipsis, 0xa6
  ['Â ', ' '], // -> U+00C2 + NBSP collapses to NBSP
];

// Stray U+00C2 left in front of a degree / (c) / (r) / +- / micro sign.
const STRAY_C2 = /Â(?=[ ©®°±µ])/g;

/**
 * PICTOGRAPHS THAT ARE MEANING, NOT DECORATION — the allow-list the KNOWN LIMIT
 * above called for.
 *
 * Each of these carries content no other character on the page carries, so
 * removing it removes information rather than clutter:
 *
 *   U+26A0  WARNING SIGN     an author's safety marker. It opens the paragraph
 *                            and is the only thing separating a line the reader
 *                            must not skim from ordinary prose. The interior
 *                            draws it as a vector glyph (`.gl-warn` in
 *                            typeset-book.ts), exactly as it draws the flag.
 *   U+00A9  COPYRIGHT SIGN   the one glyph on the copyright page that is not
 *                            decorative. Stripping it turned "Copyright (c)
 *                            2026 by X" into "Copyright 2026 by X" on a page
 *                            whose whole job is to be legally exact.
 *   U+00AE  REGISTERED SIGN  same class: a mark whose absence changes meaning.
 *
 * Note U+00A9 and U+00AE are already named in STRAY_C2 above — mojibake repair
 * restored them and the strip below then deleted them on the very next line.
 *
 * Adding a character here is a decision that the interior can SET it. A
 * pictograph the vendored faces cannot draw needs a drawn glyph in
 * typeset-book.ts at the same time, or it prints as a tofu box.
 */
export const SEMANTIC_PICTOGRAPHS: ReadonlySet<string> = new Set([
  '⚠', // WARNING SIGN
  '©', // COPYRIGHT SIGN
  '®', // REGISTERED SIGN
]);

// Emoji + pictographs + ZWJ + variation selector + regional indicators.
// \p{Extended_Pictographic} covers emoji without touching the degree sign,
// multiplication sign, micro sign, dashes, digits, letters, or measurements.
const EMOJI = /(?:\p{Extended_Pictographic}|‍|️|[\u{1F1E6}-\u{1F1FF}])/gu;

/**
 * The VARIATION SELECTOR is stripped even from an allow-listed character: it
 * only asks for emoji-colour presentation, which a black-and-white interior must
 * not honour, and the drawn glyph replaces the character anyway.
 */
const VARIATION_SELECTOR = '️';

// Decorative icon marker: literal "ICON: <name>" (one token), optionally wrapped
// in [] or (). The icon name is a single word (pine, mountain, leaf, warning,
// ...), so \w+ never swallows the heading text that follows the marker.
const ICON_MARKER = /[[(]?ICON:\s*\w+\s*[)\]]?/gi;

/** Repair the listed mojibake punctuation. Exposed for tests. */
export function repairMojibake(input: string): string {
  let s = input;
  for (const [from, to] of MOJIBAKE) s = s.split(from).join(to);
  return s.replace(STRAY_C2, '');
}

/**
 * Remove emoji glyphs and literal ICON: markers, KEEPING the pictographs on the
 * semantic allow-list. Exposed for tests.
 */
export function stripDecorativeMarkers(input: string): string {
  return input
    .replace(ICON_MARKER, '')
    .replace(EMOJI, (m) => (SEMANTIC_PICTOGRAPHS.has(m) ? m : ''));
}

/**
 * What the strip WOULD remove, as a report — the second half of the fix the
 * KNOWN LIMIT asked for.
 *
 * The loss used to be silent by construction: it lands in the stored working
 * copy, and text-fidelity QA compares the parsed sections against the PDF, so
 * both sides are already missing the character and the check passes clean. The
 * only way to see it is to look at the canonical upload BEFORE sanitization,
 * which is what this does.
 *
 * Read by the manuscript-parse gate, which fails a book whose author marked
 * meaning with a pictograph this file does not yet know about, instead of
 * printing a page that quietly lost it.
 */
export function strippedPictographs(input: string): Array<{ char: string; codePoint: string; count: number }> {
  const counts = new Map<string, number>();
  for (const m of input.matchAll(EMOJI)) {
    const ch = m[0]!;
    if (ch === VARIATION_SELECTOR || ch === '‍') continue;
    if (SEMANTIC_PICTOGRAPHS.has(ch)) continue;
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([char, count]) => ({
      char,
      codePoint: `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.codePoint.localeCompare(b.codePoint));
}

/**
 * Full sanitizer: repair encoding, strip decorative markers, then tidy ONLY the
 * whitespace the removals leave behind (never touches newlines or real words).
 */
export function sanitizeManuscript(markdown: string): string {
  let s = repairMojibake(markdown);
  s = stripDecorativeMarkers(s);
  // Tidy per line: normalize the space after a heading hash, collapse runs of
  // spaces a removal created, and trim trailing spaces. Newlines are preserved.
  s = s
    .split('\n')
    .map((line) =>
      line
        .replace(/^(#{1,6})\s+/, '$1 ') // collapse extra spaces after a heading hash
        .replace(/ {2,}/g, ' ') // collapse runs of spaces
        .replace(/[ \t]+$/g, ''), // trim trailing whitespace
    )
    .join('\n');
  return s;
}
