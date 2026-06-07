/**
 * Stage 1.8 — CSS value sanitization.
 *
 * The preview HTML interpolates project-config strings (colors, font names)
 * directly into a `<style>` block. Without sanitization a config value like
 * `red; } body { display: none } .x{ color: blue` would escape its property
 * and overrule the rest of the stylesheet, and a font name containing `'`
 * would break the quote-wrapping. We constrain the inputs at the boundary so
 * the template can stay declarative.
 *
 * If a value fails validation, we substitute a safe default rather than
 * throw — preview rendering should never block on a bad palette field.
 */

/** Hex color: #rgb / #rrggbb / #rrggbbaa. */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** rgb()/rgba()/hsl()/hsla() with simple numeric / percent arguments only. */
const FUNCTIONAL_COLOR = /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.%,\s/-]+\)$/;

/** Named CSS color: alpha chars only, no spaces, no quotes. */
const NAMED_COLOR = /^[a-zA-Z]{3,30}$/;

/** Font family name: letters, digits, spaces, hyphen, underscore. No quotes, no semicolons. */
const SAFE_FONT_NAME = /^[a-zA-Z0-9 _-]{1,60}$/;

/**
 * Return `color` if it parses as a safe CSS color; otherwise return `fallback`.
 * Trims whitespace before checking.
 */
export function safeCssColor(color: string | null | undefined, fallback: string): string {
  if (typeof color !== 'string') return fallback;
  const v = color.trim();
  if (!v) return fallback;
  if (HEX_COLOR.test(v)) return v;
  if (FUNCTIONAL_COLOR.test(v)) return v;
  if (NAMED_COLOR.test(v)) return v;
  return fallback;
}

/**
 * Return a safe font-family token if `name` matches the allowed pattern; else
 * `fallback`. The returned value is intended to be wrapped in single quotes
 * inside CSS; the pattern excludes quotes so the wrapping stays balanced.
 */
export function safeCssFontName(name: string | null | undefined, fallback: string): string {
  if (typeof name !== 'string') return fallback;
  const v = name.trim();
  if (!v) return fallback;
  return SAFE_FONT_NAME.test(v) ? v : fallback;
}
