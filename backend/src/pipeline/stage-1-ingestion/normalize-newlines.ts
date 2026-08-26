/**
 * NEWLINE NORMALIZATION — the boundary where text becomes a manuscript.
 *
 * A manuscript's line-ending convention is a transport detail. It says something
 * about the machine the file was checked out on and nothing about the book.
 *
 * WHY THIS EXISTS. A tracked fixture in this repository is stored with CRLF
 * blobs, and every checkout runs `core.autocrlf=true`. Two working trees at the
 * SAME COMMIT therefore held byte-different copies of the same file: 218,750
 * bytes in one, 221,030 in the other, one carriage return per line. A test that
 * asked "can the vendored face draw every character in this manuscript?" then
 * failed in one checkout and passed in the other, reporting U+000D as a glyph
 * the font could not draw. It is not a glyph. It is a line ending.
 *
 * SCOPE, DELIBERATELY NARROW. This collapses CRLF and lone CR to LF. It does
 * NOT strip, replace or sanitise anything else. Zero-width characters, smart
 * quotes, non-breaking spaces, stray control codes: all of those are real
 * content defects that the QA layers exist to catch, and hiding them behind a
 * general "clean the text" pass would be a much worse bug than the one this
 * fixes.
 *
 * Apply this once, where text enters the manuscript domain. Do not sprinkle it
 * through the renderer.
 */

/** Collapse CRLF and lone CR to LF. Nothing else is touched. */
export function normalizeManuscriptNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/**
 * True when the text carries a carriage return.
 *
 * Useful in a test that wants to prove it is exercising the CRLF path rather
 * than assuming it, since git may hand back either convention.
 */
export function hasCarriageReturn(text: string): boolean {
  return text.includes('\r');
}
