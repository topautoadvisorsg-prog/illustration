/**
 * The accuracy note, and the claim it is not allowed to make.
 *
 * "Medically reviewed" is a statement about a person. The schema refuses it
 * unless a person is named, so the rule holds for the API and for scripts, not
 * only for whoever is looking at the form.
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema, DEFAULT_ACCURACY_NOTE } from '@wildlands/shared';
import { buildFrontMatterHtml } from '../pipeline/typeset/front-matter.js';

const book = (accuracyNote?: Record<string, unknown>) =>
  ProjectConfigSchema.parse({
    volume: 1,
    title: 'NO ONE TOLD ME THAT',
    authorName: 'Nolan Whitlow',
    trimSize: { widthIn: 5.5, heightIn: 8.5, bleedIn: 0 },
    paperStock: 'cream',
    productionProfileId: 'bw-educational-nonfiction',
    ...(accuracyNote ? { publishing: { accuracyNote } } : {}),
  });

const html = (cfg: ReturnType<typeof book>) =>
  buildFrontMatterHtml({ config: cfg, entries: [], publication: { year: 2026 } });

describe('accuracy note', () => {
  it('is off by default, so no existing book gains a claim', () => {
    const cfg = book();
    expect(cfg.publishing.accuracyNote.enabled).toBe(false);
    expect(html(cfg)).not.toContain('Medical accuracy');
  });

  it('prints on the copyright page when switched on', () => {
    const out = html(book({ enabled: true, text: DEFAULT_ACCURACY_NOTE }));
    expect(out).toContain('cp-accuracy');
    expect(out).toContain('researched and cross-checked against guidance');
    expect(out).not.toContain('Reviewed by');
  });

  it('carries the operator\'s own wording, not a fixed sentence', () => {
    const out = html(book({ enabled: true, text: 'Checked against the 2026 national curriculum.' }));
    expect(out).toContain('Checked against the 2026 national curriculum.');
    expect(out).not.toContain('cross-checked against guidance');
  });

  it('REFUSES a medical-review claim with nobody named', () => {
    expect(() => book({ enabled: true, text: 'Medically reviewed by a pediatrician.' })).toThrow(
      /name them in reviewerName|remove the claim/i,
    );
    expect(() => book({ enabled: true, text: 'This book was medically vetted.' })).toThrow();
    expect(() => book({ enabled: true, text: 'Reviewed by a doctor before publication.' })).toThrow();
  });

  it('allows the claim when a real reviewer is named, and prints them', () => {
    const cfg = book({
      enabled: true,
      text: 'Medically reviewed for accuracy.',
      reviewerName: 'Dr Jane Okafor',
      reviewerCredentials: 'MD, FAAP',
    });
    const out = html(cfg);
    expect(out).toContain('Medically reviewed for accuracy.');
    expect(out).toContain('Reviewed by Dr Jane Okafor, MD, FAAP.');
  });

  it('does not print a reviewer line when no reviewer is named', () => {
    const out = html(book({ enabled: true, text: DEFAULT_ACCURACY_NOTE, reviewerName: '   ' }));
    expect(out).not.toContain('Reviewed by');
  });

  it('the default wording makes no claim about a person', () => {
    expect(DEFAULT_ACCURACY_NOTE).not.toMatch(/reviewed by/i);
    expect(() => book({ enabled: true, text: DEFAULT_ACCURACY_NOTE })).not.toThrow();
  });
});
