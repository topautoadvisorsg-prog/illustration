/**
 * C4 — long-token / URL wrapping.
 *
 * `Where I Checked` carries 65 source URLs, several over 120 characters against
 * a ~72-character measure. Each is a single unbreakable token, so before this
 * they ran straight out of the text block.
 *
 * The half of this file that matters most is the half asserting that a standard
 * WITHOUT the policy renders exactly as it always did.
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { buildTypesetHtml, parseTypesetSections } from '../pipeline/typeset/typeset-book.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v1.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V2 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v2.js';
import type { LongTokenWrappingPolicy, TypesetLayoutStandard } from '../pipeline/typeset/layout-standards/types.js';

/** A real URL from the DIRT RICH source list — 118 characters. */
const REAL_URL =
  'https://extension.uga.edu/publications/detail.html?number=C896&title=soil-testing-for-home-lawns-gardens-and-wildlife';

const AFTER_PUNCT: LongTokenWrappingPolicy = {
  mode: 'after-punctuation',
  minTokenLength: 28,
  breakAnywhereFallback: true,
};

const withPolicy = (p?: LongTokenWrappingPolicy): TypesetLayoutStandard => ({
  ...EDUCATIONAL_NONFICTION_TYPESET_V1,
  id: 'test-standard@1',
  ...(p ? { longTokens: p } : {}),
});

const MD = `# Book

Title block.

## Sources

Oregon State University Extension, *Reducing Lead Hazard*
${REAL_URL}

An ordinary paragraph with normal words that must not be touched at all.
`;

const CONFIG = ProjectConfigSchema.parse({
  volume: 1,
  title: 'DIRT RICH',
  authorName: 'Abby Fenwick',
  trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0 },
  typography: { bodyPt: 11, lineHeight: 1.35, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
});

const render = (standard: TypesetLayoutStandard): string =>
  buildTypesetHtml({
    sections: parseTypesetSections(MD),
    config: CONFIG,
    layoutStandard: standard,
  });

describe('C4 — a standard that does not declare the policy is unchanged', () => {
  it('emits no <wbr> at all', () => {
    expect(render(withPolicy())).not.toContain('<wbr>');
  });

  it('emits no overflow-wrap rule', () => {
    expect(render(withPolicy())).not.toContain('overflow-wrap');
  });

  it('the two SHIPPED standards declare no long-token policy', () => {
    // The regression guarantee, asserted on the real objects rather than copies:
    // adding a capability must not reach back into an approved design.
    expect(EDUCATIONAL_NONFICTION_TYPESET_V1.longTokens).toBeUndefined();
    expect(EDUCATIONAL_NONFICTION_TYPESET_V2.longTokens).toBeUndefined();
  });

  it('renders byte-identically to an explicit mode:none policy', () => {
    const none = withPolicy({ mode: 'none', minTokenLength: 28, breakAnywhereFallback: false });
    expect(render(none)).toBe(render(withPolicy()));
  });
});

describe('C4 — after-punctuation wrapping', () => {
  const html = render(withPolicy(AFTER_PUNCT));

  it('gives a real 118-character URL break opportunities', () => {
    expect(html).toContain('<wbr>');
    // One per structural punctuation mark in the URL, and enough of them that no
    // fragment can exceed the measure.
    const url = html.slice(html.indexOf('https:'), html.indexOf('</p>', html.indexOf('https:')));
    expect(url.split('<wbr>').length - 1).toBeGreaterThan(10);
  });

  it('no fragment between break opportunities exceeds a 6x9 measure', () => {
    const url = html.slice(html.indexOf('https:'), html.indexOf('</p>', html.indexOf('https:')));
    const longest = Math.max(...url.split('<wbr>').map((f) => f.replace(/&amp;/g, '&').length));
    // ~72 characters fit the 4.625in text block at 11pt. Leave real headroom.
    expect(longest).toBeLessThan(40);
  });

  it('leaves ordinary prose completely alone', () => {
    const para = html.slice(html.indexOf('An ordinary paragraph'));
    expect(para.slice(0, para.indexOf('</p>'))).not.toContain('<wbr>');
  });

  it('does not break emphasis markup', () => {
    // The italic source title sits on the line above the URL.
    expect(html).toContain('<em>Reducing Lead Hazard</em>');
  });

  it('does not corrupt HTML entities', () => {
    // The URL contains a literal & — it must still escape to &amp;, unsplit.
    expect(html).toContain('&amp;');
    expect(html).not.toMatch(/&amp<wbr>;/);
    expect(html).not.toMatch(/&<wbr>amp;/);
  });

  it('emits the fallback rule only when the standard asks for it', () => {
    expect(html).toContain('overflow-wrap: break-word');
    const noFallback = render(withPolicy({ ...AFTER_PUNCT, breakAnywhereFallback: false }));
    expect(noFallback).toContain('<wbr>');
    expect(noFallback).not.toContain('overflow-wrap');
  });

  it('leaves the private-use sentinel nowhere in the output', () => {
    expect(html).not.toContain(String.fromCharCode(0xe000));
  });
});
