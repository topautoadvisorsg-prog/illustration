import { describe, it, expect } from 'vitest';
import { resolveEditionStyle, DEFAULT_COLOR_EDITION } from '../pipeline/editions/resolve-edition-style.js';
import { assembleIllustrationDna } from '../pipeline/publishing-standard/index.js';

describe('resolveEditionStyle — One Book → Many Editions', () => {
  it('default Color edition → byte-identical Color master style block (no behaviour change)', () => {
    const r = resolveEditionStyle({ styleDnaId: DEFAULT_COLOR_EDITION.styleDnaId });
    expect(r.styleDnaId).toBe('cinematic-naturalist-color');
    expect(r.masterStyleBlock).toBe(assembleIllustrationDna()); // == registry default
    expect(r.masterStyleBlock).not.toMatch(/MONOCHROME/);
    expect(r.palette.inkHex).toBe('#543C24'); // Standard sepia
    expect(r.paperType).toBe('premium-color');
  });
  it('B&W edition is selectable by CONFIG ONLY — monochrome + different palette', () => {
    const r = resolveEditionStyle({ styleDnaId: 'bw-naturalist' });
    expect(r.styleDnaId).toBe('bw-naturalist');
    expect(r.masterStyleBlock).toMatch(/MONOCHROME/);
    expect(r.palette.inkHex).not.toBe('#543C24');
    expect(r.paperType).toBe('standard-bw');
  });
  it('palette override beats the profile default', () => {
    const r = resolveEditionStyle({ styleDnaId: 'cinematic-naturalist-color', paletteOverride: { paperHex: '#FFFFFF', inkHex: '#000000' } });
    expect(r.palette).toEqual({ paperHex: '#FFFFFF', inkHex: '#000000' });
  });
  it('unknown Style DNA falls back to Color', () => {
    expect(resolveEditionStyle({ styleDnaId: 'does-not-exist' }).styleDnaId).toBe('cinematic-naturalist-color');
  });
});
