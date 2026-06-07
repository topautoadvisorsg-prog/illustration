import { describe, expect, it } from 'vitest';
import { safeCssColor, safeCssFontName } from '../css-safety.js';

describe('safeCssColor', () => {
  it('accepts a 3-digit hex color', () => {
    expect(safeCssColor('#fff', '#000')).toBe('#fff');
  });

  it('accepts a 6-digit hex color', () => {
    expect(safeCssColor('#faf6ee', '#000')).toBe('#faf6ee');
  });

  it('accepts an 8-digit hex color (with alpha)', () => {
    expect(safeCssColor('#faf6ee80', '#000')).toBe('#faf6ee80');
  });

  it('accepts rgb()/rgba()', () => {
    expect(safeCssColor('rgb(10, 20, 30)', '#000')).toBe('rgb(10, 20, 30)');
    expect(safeCssColor('rgba(10, 20, 30, 0.5)', '#000')).toBe('rgba(10, 20, 30, 0.5)');
  });

  it('accepts a named color', () => {
    expect(safeCssColor('seagreen', '#000')).toBe('seagreen');
  });

  it('falls back when the color contains a CSS injection attempt', () => {
    const bad = 'red; } body { display: none } .x{ color: blue';
    expect(safeCssColor(bad, '#000')).toBe('#000');
  });

  it('falls back when the color is empty', () => {
    expect(safeCssColor('', '#000')).toBe('#000');
    expect(safeCssColor('   ', '#000')).toBe('#000');
  });

  it('falls back when the color is null / undefined', () => {
    expect(safeCssColor(null, '#000')).toBe('#000');
    expect(safeCssColor(undefined, '#000')).toBe('#000');
  });

  it('falls back when the color has a quote (would break CSS string)', () => {
    expect(safeCssColor('"red', '#000')).toBe('#000');
  });

  it('falls back on URL() and var() (we refuse anything fancy)', () => {
    expect(safeCssColor('url(evil.png)', '#000')).toBe('#000');
    expect(safeCssColor('var(--bad)', '#000')).toBe('#000');
  });
});

describe('safeCssFontName', () => {
  it('accepts a normal font name', () => {
    expect(safeCssFontName('EB Garamond', 'Georgia')).toBe('EB Garamond');
  });

  it('accepts hyphenated and underscored names', () => {
    expect(safeCssFontName('Source-Sans 3', 'Georgia')).toBe('Source-Sans 3');
  });

  it('falls back when the name contains a single quote', () => {
    expect(safeCssFontName("Don't Care", 'Georgia')).toBe('Georgia');
  });

  it('falls back when the name contains a semicolon (CSS injection)', () => {
    expect(safeCssFontName('Arial; } body { display: none', 'Georgia')).toBe('Georgia');
  });

  it('falls back on empty / null / undefined', () => {
    expect(safeCssFontName('', 'Georgia')).toBe('Georgia');
    expect(safeCssFontName(null, 'Georgia')).toBe('Georgia');
    expect(safeCssFontName(undefined, 'Georgia')).toBe('Georgia');
  });
});
