/**
 * Minimal ambient types for `fontkit`, which ships no declarations.
 *
 * Only the surface the font-coverage test uses. Deliberately not a full or
 * "faithful" typing: a bigger stub would be a second, unverified copy of
 * someone else's API that nothing checks and everything trusts.
 *
 * `hasGlyphForCodePoint` is the whole point — it is what makes a missing glyph
 * detectable at all, since a font that cannot draw a character fails silently at
 * render time.
 */
declare module 'fontkit' {
  export interface Font {
    hasGlyphForCodePoint(codePoint: number): boolean;
    readonly familyName?: string;
    readonly numGlyphs?: number;
  }
  /** Throws on an unreadable or unsupported file rather than returning null. */
  export function openSync(filename: string, postscriptName?: string): Font;
}
