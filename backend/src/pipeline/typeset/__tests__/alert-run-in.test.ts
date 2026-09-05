/**
 * RUN-IN ALERT MATCHER — the contract.
 *
 * The capability under test: an alert panel may be opened by a bold run-in at
 * the head of a paragraph, not only by an ALL-CAPS heading.
 *
 * The thing that must be proved is NOT "the phrase gets styled". It is that this
 * is a STRUCTURAL matcher and not a keyword highlighter. Every negative control
 * below is taken from a real occurrence in BEFORE YOU NEED IT rev-16, which
 * contains 314 bold run-ins of which six are the safety marker, plus four inline
 * references to the same words that must remain ordinary text.
 *
 * Synthetic markdown on purpose: this is a portable test and must not depend on
 * a manuscript in an operator's Downloads folder. The real-book counts are
 * asserted by the production render, outside this gate.
 */
import { describe, expect, it } from 'vitest';
import { ProjectConfigSchema } from '@wildlands/shared';
import { buildTypesetHtml, parseTypesetSections } from '../typeset-book.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V3 } from '../layout-standards/educational-nonfiction-v3.js';
import { EDUCATIONAL_NONFICTION_TYPESET_V4 } from '../layout-standards/educational-nonfiction-v4.js';
import type { TypesetLayoutStandard } from '../layout-standards/types.js';

const CONFIG = ProjectConfigSchema.parse({
  volume: 1,
  title: 'Run-In Fixture',
  authorName: 'The Fixture Standards Board',
  trimSize: EDUCATIONAL_NONFICTION_TYPESET_V4.trim,
});

const render = (md: string, standard: TypesetLayoutStandard): string =>
  buildTypesetHtml({
    sections: parseTypesetSections(md),
    config: CONFIG,
    margins: { topIn: 0.625, bottomIn: 0.625, outsideIn: 0.5, gutterIn: 0.625 },
    layoutStandard: standard,
  } as never);

/**
 * Matches both weights. The emphatic variant emits
 * `class="alert-panel alert-panel--immediate"`, so an exact-match on
 * `class="alert-panel"` would silently stop counting the tier that matters most.
 */
const panels = (html: string): number => (html.match(/class="alert-panel[" ]/g) ?? []).length;
const immediates = (html: string): number =>
  (html.match(/class="alert-panel alert-panel--immediate"/g) ?? []).length;
const labels = (html: string): string[] =>
  [...html.matchAll(/<p class="alert-label">(.*?)<\/p>/g)].map((m) => m[1]!);
/**
 * Stable block ids are injected AFTER the alert pass, so the emitted element is
 * `<aside data-block-id="..." class="alert-panel">`. Matching on the attribute
 * rather than on a literal opening tag keeps these assertions independent of
 * where the id lands.
 */
const panelOf = (html: string): string =>
  html.match(/<aside[^>]*class="alert-panel"[^>]*>[\s\S]*?<\/aside>/)![0];

/**
 * The laid-out BODY, without the stylesheet.
 *
 * @4 declares the emphatic variant, so its stylesheet legitimately carries one
 * rule @3 does not. The backward-compatibility guarantee is NOT "@4 equals @3";
 * it is that a standard declaring no variant is untouched, and that declaring
 * one changes no page content until a marker is actually present.
 */
const bodyOf = (html: string): string => html.slice(html.indexOf('<section'));

/** The structural form the book uses: run-in, then an urgent list. */
const STRUCTURAL = `# Fixture

## Chapter One — Heavy days

Some ordinary prose introducing the subject.

- Worth mentioning at your next appointment
- Also worth mentioning

**Tell somebody today**, rather than waiting for a good moment:

- You're **soaking through more than one pad every one to two hours**
- You feel **dizzy, faint or exhausted**

None of these mean something is seriously wrong. They mean it's worth somebody having a look.
`;

describe('OLD BEHAVIOUR — a standard with no run-in policy', () => {
  it('does not recognise a structural same-day run-in', () => {
    const html = render(STRUCTURAL, EDUCATIONAL_NONFICTION_TYPESET_V3);
    expect(panels(html)).toBe(0);
  });

  it('leaves the run-in as an ordinary paragraph, indistinguishable from prose', () => {
    const html = render(STRUCTURAL, EDUCATIONAL_NONFICTION_TYPESET_V3);
    expect(html).toMatch(/<p[^>]*><strong>Tell somebody today<\/strong>/);
  });
});

describe('NEW BEHAVIOUR — @4 opens a panel on the run-in', () => {
  const html = render(STRUCTURAL, EDUCATIONAL_NONFICTION_TYPESET_V4);

  it('renders exactly one panel', () => {
    expect(panels(html)).toBe(1);
  });

  it('uses the run-in as the panel label, without its trailing punctuation', () => {
    expect(labels(html)).toEqual(['Tell somebody today']);
  });

  it('keeps the rest of the run-in sentence as body text, without the connector', () => {
    expect(html).toContain('<p>rather than waiting for a good moment:</p>');
    expect(html).not.toContain('<p>, rather than');
  });

  it('absorbs the urgent list that directly follows', () => {
    const panel = panelOf(html);
    expect(panel).toContain('soaking through more than one pad');
    expect(panel).toContain('dizzy, faint or exhausted');
  });

  it('leaves the reassurance paragraph OUTSIDE the box', () => {
    const panel = panelOf(html);
    expect(panel).not.toContain('None of these mean something is seriously wrong');
    expect(html).toContain('None of these mean something is seriously wrong');
  });

  it('does not absorb the routine list that precedes it', () => {
    const panel = panelOf(html);
    expect(panel).not.toContain('Worth mentioning at your next appointment');
  });
});

describe('both authored forms of the marker resolve to one entry', () => {
  it('matches the colon-inside-bold form', () => {
    const md = `# F\n\n## Chapter One — X\n\n**Tell somebody today:** one breast going **red, swollen or hot**.\n`;
    const html = render(md, EDUCATIONAL_NONFICTION_TYPESET_V4);
    expect(panels(html)).toBe(1);
    expect(labels(html)).toEqual(['Tell somebody today']);
    expect(html).toContain('one breast going');
  });

  it('matches a bare run-in with no following list', () => {
    const md = `# F\n\n## Chapter One — X\n\n**Tell somebody today:**\n\n- Leg or bone pain that is **severe**\n`;
    const html = render(md, EDUCATIONAL_NONFICTION_TYPESET_V4);
    expect(panels(html)).toBe(1);
    const panel = panelOf(html);
    expect(panel).toContain('Leg or bone pain');
  });
});

/**
 * THE POINT OF THE WHOLE EXERCISE. Each of these is a real shape from rev-16.
 * If any of them starts producing a panel, the matcher has degraded into a
 * keyword highlighter and the book will box things the author did not mark.
 */
describe('NEGATIVE CONTROLS — this is a run-in matcher, not a keyword highlighter', () => {
  const noPanel = (md: string): void => {
    expect(panels(render(md, EDUCATIONAL_NONFICTION_TYPESET_V4))).toBe(0);
  };

  it('ignores the phrase mid-sentence in plain prose', () => {
    noPanel(
      `# F\n\n## Chapter One — X\n\nIf someone has asked you for that already — tell somebody today. That's the instruction.\n`,
    );
  });

  it('ignores the phrase in a bold run LATER in the paragraph', () => {
    noPanel(
      `# F\n\n## Chapter One — X\n\n**And if you have already sent something: you are not in trouble.** I want that in the plainest words I have. **Tell somebody today, and if you can't face saying it, write it down.**\n`,
    );
  });

  it('ignores the phrase inside a bullet whose own run-in is something else', () => {
    noPanel(
      `# F\n\n## Chapter One — X\n\n- **Any adult asking you to keep a secret about your body** from your parents — **tell somebody today**\n`,
    );
  });

  it('ignores an ordinary bold run-in unrelated to safety', () => {
    noPanel(
      `# F\n\n## Chapter One — X\n\n**Keep track of it yourself.** The string is there to help you.\n\n**Pick who, in advance.** Right now, before you need it, think of two adults.\n`,
    );
  });

  it('ignores a run-in that merely RESEMBLES the configured phrase', () => {
    noPanel(
      `# F\n\n## Chapter One — X\n\n**Tell somebody tomorrow** if it has not settled.\n\n**Tell somebody** about it when you can.\n\n**Do tell somebody today** if it gets worse.\n`,
    );
  });
});

describe('BACKWARD COMPATIBILITY', () => {
  it('a standard with no run-in policy renders content without the marker byte-identically', () => {
    const md = `# F\n\n## Chapter One — X\n\n**Keep track of it yourself.** The string is there to help you.\n\n- A bullet\n- Another bullet\n\nClosing prose.\n`;
    expect(bodyOf(render(md, EDUCATIONAL_NONFICTION_TYPESET_V4))).toBe(
      bodyOf(render(md, EDUCATIONAL_NONFICTION_TYPESET_V3)),
    );
  });

  it('@4 differs from @3 ONLY where a structural marker is present', () => {
    const v3 = render(STRUCTURAL, EDUCATIONAL_NONFICTION_TYPESET_V3);
    const v4 = render(STRUCTURAL, EDUCATIONAL_NONFICTION_TYPESET_V4);
    expect(v4).not.toBe(v3);
    // Same words on the page either way — the panel reframes, it never rewrites.
    // Punctuation-insensitive: @4 deliberately drops the connector comma after
    // the run-in, because the label is set as a label and a body opening with a
    // comma would be wrong. What must not change is the WORDS on the page.
    const words = (s: string): string =>
      s
        .replace(/<[^>]+>/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    expect(words(bodyOf(v4))).toBe(words(bodyOf(v3)));
  });

  it('leaves the heading trigger working', () => {
    const withHeading = { ...EDUCATIONAL_NONFICTION_TYPESET_V4 };
    const md = `# F\n\n## Chapter One — X\n\n### SEE A DOCTOR IF\n\n- It keeps happening\n`;
    const html = render(md, withHeading);
    expect(panels(html)).toBe(1);
    expect(labels(html)).toEqual(['SEE A DOCTOR IF']);
  });
});

/**
 * THE THIRD TIER — immediate, above same-day.
 *
 * The failure this guards against is not "the box is missing". It is the box
 * being IDENTICAL to same-day, which asserts that "tell somebody today" and
 * "get medical help immediately" are the same instruction. Two channels have to
 * survive, and neither may be colour: the rule weight and the drawn flag.
 */
describe('EMPHATIC VARIANT — routine < same-day < immediate', () => {
  const THREE_TIERS = `# Fixture

## Chapter One — Tiers

Ordinary prose that belongs to no tier.

- Routine bullet one
- Routine bullet two

**Tell somebody today**, rather than waiting for a good moment:

- A same-day symptom

**Do this now.** If you suddenly get very ill, take it out if it's still in, tell an adult straight away, and get medical help immediately. Not in the morning.
`;
  const html = render(THREE_TIERS, EDUCATIONAL_NONFICTION_TYPESET_V4);

  it('renders both panels', () => {
    expect(panels(html)).toBe(2);
  });

  it('marks exactly one of them as immediate', () => {
    expect(immediates(html)).toBe(1);
  });

  it('gives the immediate panel the DO THIS NOW label', () => {
    const panel = html.match(/<aside[^>]*alert-panel--immediate[^>]*>[\s\S]*?<\/aside>/)![0];
    expect(panel).toContain('Do this now');
    expect(panel).toContain('get medical help immediately');
  });

  it('carries the drawn flag on the immediate label, and only there', () => {
    const immediate = html.match(/<aside[^>]*alert-panel--immediate[^>]*>[\s\S]*?<\/aside>/)![0];
    expect(immediate).toContain('gl-flag');
    const sameDay = html.match(/<aside(?![^>]*--immediate)[^>]*class="alert-panel"[^>]*>[\s\S]*?<\/aside>/)![0];
    expect(sameDay).not.toContain('gl-flag');
  });

  it('does not promote the same-day panel to the heavier weight', () => {
    const sameDay = html.match(/<aside(?![^>]*--immediate)[^>]*class="alert-panel"[^>]*>[\s\S]*?<\/aside>/)![0];
    expect(sameDay).toContain('Tell somebody today');
    expect(sameDay).not.toContain('--immediate');
  });

  it('leaves routine content in no panel at all', () => {
    expect(html).toContain('Routine bullet one');
    const inAnyPanel = [...html.matchAll(/<aside[^>]*class="alert-panel[^"]*"[^>]*>[\s\S]*?<\/aside>/g)]
      .map((m) => m[0])
      .join('\n');
    expect(inAnyPanel).not.toContain('Routine bullet one');
    expect(inAnyPanel).not.toContain('Ordinary prose that belongs to no tier');
  });

  it('emits the heavier rule as a real stylesheet declaration', () => {
    expect(html).toContain('.alert-panel--immediate { border-width: 1.5pt; }');
  });

  it('the marker is structural here too — mid-paragraph does not fire', () => {
    const md = `# F\n\n## Chapter One — X\n\nYou should read this and then do this now, before it gets worse.\n`;
    expect(panels(render(md, EDUCATIONAL_NONFICTION_TYPESET_V4))).toBe(0);
  });
});

describe('EMPHATIC VARIANT — backward compatibility', () => {
  it('a standard that declares no emphatic variant emits no variant rule', () => {
    const md = `# F\n\n## Chapter One — X\n\nPlain prose.\n`;
    expect(render(md, EDUCATIONAL_NONFICTION_TYPESET_V3)).not.toContain('alert-panel--immediate');
  });

  it('and renders content with no marker identically to @3', () => {
    const md = `# F\n\n## Chapter One — X\n\n**Keep track of it yourself.** The string is there to help you.\n\n- A bullet\n\nClosing prose.\n`;
    expect(bodyOf(render(md, EDUCATIONAL_NONFICTION_TYPESET_V4))).toBe(
      bodyOf(render(md, EDUCATIONAL_NONFICTION_TYPESET_V3)),
    );
  });
});

describe('EMPHATIC VARIANT — the stylesheet delta is exactly one rule', () => {
  it('adds the variant rule and nothing else', () => {
    const md = `# F\n\n## Chapter One \u2014 X\n\nPlain prose.\n`;
    const head = (s: string): string => s.slice(0, s.indexOf('<section'));
    /**
     * Compared against @4 WITHOUT the variant, not against @3.
     *
     * @4 has since gained a table policy, so a @4-vs-@3 comparison conflates two
     * independent additions and fails for a reason that has nothing to do with
     * the emphatic variant. Holding everything else equal isolates the one delta
     * being claimed, and keeps doing so whatever @4 gains next.
     */
    const withoutVariant = {
      ...EDUCATIONAL_NONFICTION_TYPESET_V4,
      alertPanel: { ...EDUCATIONAL_NONFICTION_TYPESET_V4.alertPanel, emphatic: undefined },
    };
    const baseHead = head(render(md, withoutVariant));
    const v4head = head(render(md, EDUCATIONAL_NONFICTION_TYPESET_V4));
    // Strip the whole inserted block — its comment and its rule. What remains
    // must be the base stylesheet EXACTLY: no stray blank line, no reflowed
    // rules. An earlier cut of this change left a blank line in every standard
    // that declares no variant, and this assertion is what caught it.
    const stripped = v4head.replace(
      /\n\/\* IMMEDIATE[\s\S]*?\*\/\n\.alert-panel--immediate \{ border-width: 1\.5pt; \}/,
      '',
    );
    expect(stripped).toBe(baseHead);
    expect(baseHead).not.toContain('alert-panel--immediate');
    expect(head(render(md, EDUCATIONAL_NONFICTION_TYPESET_V3))).not.toContain('alert-panel--immediate');
  });
});
