/**
 * C3 — fenced / preformatted blocks.
 *
 * A fenced block is a drawing made of characters. DIRT RICH's Appendix E is a
 * box-drawing site plan whose alignment IS its meaning; reflowed as prose it
 * says nothing. Manuscript Studio's layout exporter already destroyed this once
 * by collapsing runs of whitespace inside the fence — 28 corrupted lines — so
 * the tests here check the shape survives byte for byte.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { buildTypesetHtml, parseTypesetSections } from '../pipeline/typeset/typeset-book.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V1 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v1.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V2 } from '../pipeline/typeset/layout-standards/educational-nonfiction-v2.js';
import { normalizeManuscriptNewlines } from '../pipeline/stage-1-ingestion/normalize-newlines.js';
import type {
  TypesetLayoutStandard,
  TypesetPreformattedStyles,
} from '../pipeline/typeset/layout-standards/types.js';

const PRE: TypesetPreformattedStyles = {
  family: 'EB Garamond', // placeholder; the real face is a pending operator decision
  typePt: 8,
  lineHeight: 1.1,
  fit: 'shrink-to-measure',
  keepTogether: true,
  paddingEm: 0.4,
};

const CONFIG = ProjectConfigSchema.parse({
  volume: 1,
  title: 'DIRT RICH',
  authorName: 'Abby Fenwick',
  trimSize: { widthIn: 6, heightIn: 9, bleedIn: 0 },
  typography: { bodyPt: 11, lineHeight: 1.35, headingFont: 'Archivo', bodyFont: 'EB Garamond' },
});

const standard = (pre?: TypesetPreformattedStyles): TypesetLayoutStandard => ({
  ...EDUCATIONAL_NONFICTION_TYPESET_V1,
  id: 'test-standard@1',
  ...(pre ? { preformatted: pre } : {}),
});

const render = (md: string, pre?: TypesetPreformattedStyles): string =>
  buildTypesetHtml({ sections: parseTypesetSections(md), config: CONFIG, layoutStandard: standard(pre) });

const FENCED = `# Book

Title block.

## Plot

Before the fence.

\`\`\`
        ┌──────────────┐
        │  front lawn  │   kept as lawn
        └──────────────┘
             20 steps ↓
\`\`\`

After the fence.
`;

describe('C3 — a standard without the policy is unchanged', () => {
  it('does not emit a pre block', () => {
    expect(render(FENCED)).not.toContain('<pre');
  });

  it('emits no preformatted CSS', () => {
    expect(render(FENCED)).not.toContain('white-space: pre');
  });

  it('the two SHIPPED standards declare no preformatted policy', () => {
    expect(EDUCATIONAL_NONFICTION_TYPESET_V1.preformatted).toBeUndefined();
    expect(EDUCATIONAL_NONFICTION_TYPESET_V2.preformatted).toBeUndefined();
  });
});

describe('C3 — fenced content is preserved verbatim', () => {
  const html = render(FENCED, PRE);

  it('emits a pre block and drops the fence markers', () => {
    expect(html).toMatch(/<pre[^>]*class="tset-pre"/);
    expect(html).not.toContain('```');
  });

  it('preserves interior padding exactly — the bug that mangled Appendix E', () => {
    expect(html).toContain('│  front lawn  │   kept as lawn');
    expect(html).not.toContain('│ front lawn │ kept as lawn');
  });

  it('preserves leading indentation on every line', () => {
    const pre = html.slice(html.indexOf('<pre'), html.indexOf('</pre>'));
    expect(pre).toContain('        ┌──────────────┐');
    expect(pre).toContain('             20 steps ↓');
  });

  it('keeps prose either side as prose', () => {
    expect(html).toContain('Before the fence.');
    expect(html).toContain('After the fence.');
  });

  it('never applies inline markdown inside the fence', () => {
    const withStars = render('# B\n\nT.\n\n## S\n\n```\n**not bold** and *not italic*\n```\n', PRE);
    const pre = withStars.slice(withStars.indexOf('<pre'), withStars.indexOf('</pre>'));
    expect(pre).toContain('**not bold**');
    expect(pre).not.toContain('<strong>');
  });

  it('never inserts break opportunities inside a fence', () => {
    const md = '# B\n\nT.\n\n## S\n\n```\nhttps://example.com/a/very/long/path/that/keeps/going/onwards\n```\n';
    const withBoth = buildTypesetHtml({
      sections: parseTypesetSections(md),
      config: CONFIG,
      layoutStandard: {
        ...standard(PRE),
        longTokens: { mode: 'after-punctuation', minTokenLength: 28, breakAnywhereFallback: true },
      },
    });
    const pre = withBoth.slice(withBoth.indexOf('<pre'), withBoth.indexOf('</pre>'));
    expect(pre).not.toContain('<wbr>');
  });

  it('escapes markup rather than letting it render', () => {
    const md = '# B\n\nT.\n\n## S\n\n```\n<b>literal</b> & co\n```\n';
    const pre = render(md, PRE);
    expect(pre).toContain('&lt;b&gt;literal&lt;/b&gt; &amp; co');
  });

  it('an unterminated fence keeps its content rather than reverting to prose', () => {
    const md = '# B\n\nT.\n\n## S\n\n```\n  aligned  line\n  second   line\n';
    const html2 = render(md, PRE);
    expect(html2).toContain('  aligned  line');
    expect(html2).toContain('  second   line');
  });

  it('gets a block id, so it can be targeted like any other block', () => {
    expect(html).toMatch(/<pre[^>]*data-block-id="[0-9a-f]+"/);
  });

  it('honours keep-together', () => {
    expect(html).toContain('break-inside: avoid');
  });
});

describe('C3 — the real Appendix E', () => {
  const md = normalizeManuscriptNewlines(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/dirt-rich-manuscript.md'), 'utf8'));
  const html = render(md, PRE);

  /** The fence as the canonical file holds it, read independently of the render. */
  const lines = md.split('\n');
  const open = lines.findIndex((l) => l.trim().startsWith('```'));
  const close = lines.findIndex((l, i) => i > open && l.trim().startsWith('```'));
  const fenceLines = lines.slice(open + 1, close);

  it('finds exactly one fenced block in the book', () => {
    expect((html.match(/<pre[^>]*class="tset-pre"/g) ?? []).length).toBe(1);
  });

  it('carries every line of the canonical site plan', () => {
    expect(fenceLines.length).toBeGreaterThan(20);
    const pre = html.slice(html.indexOf('<pre'), html.indexOf('</pre>'));
    for (const line of fenceLines) {
      if (!line.trim()) continue;
      expect(pre, `missing: ${line}`).toContain(line);
    }
  });

  it('preserves the called-out 26 ft setback dimension', () => {
    expect(html).toContain('26 ft from property line: code wants 25');
  });

  it('reports the line count on the block for downstream checks', () => {
    expect(html).toContain(`data-lines="${fenceLines.length}"`);
  });
});
