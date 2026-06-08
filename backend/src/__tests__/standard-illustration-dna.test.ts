/**
 * Standard v1.2 — Illustration DNA + Ownership Rule Zero regression lock.
 *
 * These tests freeze the STD-1 reconciliation: the deleted clean-art rules
 * (text-free, contradictory paper/ink hex, "never centered", "no badges")
 * must never creep back into the Illustration DNA, and all colour must flow
 * through PALETTE tokens (Rule Zero). See STANDARD_V1_2_RECONCILIATION.md.
 */

import { describe, expect, it } from 'vitest';
import {
  PALETTE,
  STANDARD_VERSION,
  assembleIllustrationDna,
} from '../pipeline/publishing-standard/standard.js';

describe('Standard version', () => {
  it('is v1.2', () => {
    expect(STANDARD_VERSION).toBe('1.2');
  });
});

describe('Illustration DNA — Rule Zero (colour only via PALETTE tokens)', () => {
  const dna = assembleIllustrationDna();

  it('uses the Standard ink + parchment token values', () => {
    expect(dna).toContain(PALETTE.ink.hex); // #543C24
    expect(dna).toContain(PALETTE.parchment.hex); // #E0C8A0
  });

  it('contains NO deleted/contradictory hex', () => {
    for (const dead of ['#F5EDD6', '#2C1A0E', '#6B4C2A', '#3A5C3A', '#C8860A', '#B87333', '#8B2020']) {
      expect(dna).not.toContain(dead);
    }
  });
});

describe('Illustration DNA — owns artwork behaviour ONLY', () => {
  const dna = assembleIllustrationDna().toLowerCase();

  it('carries NO text rule (Typography owns text)', () => {
    expect(dna).not.toContain('text-free');
    expect(dna).not.toContain('no text');
    expect(dna).not.toContain('100%');
  });

  it('carries NO composition rule (Layout owns composition)', () => {
    expect(dna).not.toContain('never centered');
    expect(dna).not.toContain('symmetrical');
    expect(dna).not.toContain('grid-locked');
  });

  it('carries NO badge rule (Badge System owns badges)', () => {
    expect(dna).not.toContain('badge');
    expect(dna).not.toContain('banner');
  });

  it('retains the genuine artwork-behaviour language', () => {
    expect(dna).toContain('pen-and-ink');
    expect(dna).toContain('watercolor');
    expect(dna).toContain('audubon');
    expect(dna).toContain('naturalist');
  });

  it('drops the stale clean-art-era references', () => {
    expect(dna).not.toContain('cinematic_naturalist');
    expect(dna).not.toContain('4000');
  });
});
