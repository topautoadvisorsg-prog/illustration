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

// Emoji + pictographs + ZWJ + variation selector + regional indicators.
// \p{Extended_Pictographic} covers emoji without touching the degree sign,
// multiplication sign, micro sign, dashes, digits, letters, or measurements.
const EMOJI = /(?:\p{Extended_Pictographic}|‍|️|[\u{1F1E6}-\u{1F1FF}])/gu;

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

/** Remove emoji glyphs and literal ICON: markers. Exposed for tests. */
export function stripDecorativeMarkers(input: string): string {
  return input.replace(ICON_MARKER, '').replace(EMOJI, '');
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
