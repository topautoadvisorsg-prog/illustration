/**
 * Front Matter v1 — recover manuscript front-matter sections.
 *
 * The breakdown parser keeps ONLY `# CHAPTER N` H1s and silently drops every
 * other heading (documented: BREAKDOWN_MISSING_PAGES.md §7). Real manuscripts
 * put front matter under EITHER level — the New England manuscript uses
 * `## INTRODUCTION` / `## DISCLAIMER` (H2) beneath a title H1 — so recovery
 * scans the PRE-FIRST-CHAPTER region for recognized headings at H1 or H2.
 *
 * Recovery priority (operator-locked): Introduction → Preface → Foreword.
 * The author's own text is NEVER silently replaced by templates or AI.
 *
 * GENERIC: heading recognition is a platform map, not book-specific. Pure
 * function — no I/O.
 */

export type RecoveredSectionKind =
  | 'INTRODUCTION'
  | 'PREFACE'
  | 'FOREWORD'
  | 'DEDICATION'
  | 'DISCLAIMER'
  | 'GLOSSARY';

export interface RecoveredSection {
  kind: RecoveredSectionKind;
  /** The heading exactly as the author wrote it. */
  headingText: string;
  /** Section markdown WITHOUT the heading line, trimmed. */
  markdown: string;
  /** 1-based line of the heading in the manuscript (operator audit). */
  line: number;
}

/** Recognized titles → section kind. Case-insensitive, start-of-title match. */
const RECOGNIZED: Array<{ kind: RecoveredSectionKind; pattern: RegExp }> = [
  { kind: 'INTRODUCTION', pattern: /^introduction\b/i },
  { kind: 'PREFACE', pattern: /^preface\b/i },
  { kind: 'FOREWORD', pattern: /^foreword\b/i },
  { kind: 'DEDICATION', pattern: /^dedication\b/i },
  { kind: 'DISCLAIMER', pattern: /^disclaimer\b/i },
  { kind: 'GLOSSARY', pattern: /^glossary\b/i },
];

interface Heading {
  level: number; // 1 or 2
  title: string;
  line: number; // 1-based
  lineIdx: number; // 0-based index in split lines
}

function collectHeadings(markdown: string): Heading[] {
  const lines = markdown.split('\n');
  const out: Heading[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(/^(#{1,2})\s+(.+?)\s*$/);
    if (m) out.push({ level: m[1]!.length, title: (m[2] ?? '').trim(), line: i + 1, lineIdx: i });
  }
  return out;
}

function isChapterTitle(title: string): boolean {
  return /^chapter\s+\d+\b/i.test(title);
}

/**
 * Scan for recognized front-matter sections. A recognized heading's section
 * runs to the next heading of the SAME or HIGHER level (so an H2 section
 * under a title H1 ends at the next H2 or any H1). Sections may sit before
 * the first chapter or after the last one.
 */
export function recoverFrontMatterSections(markdown: string): RecoveredSection[] {
  const lines = markdown.split('\n');
  const headings = collectHeadings(markdown);
  const sections: RecoveredSection[] = [];

  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    if (isChapterTitle(h.title)) continue;
    const match = RECOGNIZED.find((r) => r.pattern.test(h.title));
    if (!match) continue;
    // Section ends at the next heading with level ≤ this one.
    let endIdx = lines.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j]!.level <= h.level) {
        endIdx = headings[j]!.lineIdx;
        break;
      }
    }
    const body = lines
      .slice(h.lineIdx + 1, endIdx)
      .join('\n')
      // Manuscript section separators ("---") are layout, not content.
      .replace(/^\s*-{3,}\s*$/gm, '')
      .trim();
    if (!body) continue; // empty section conveys nothing
    sections.push({ kind: match.kind, headingText: h.title, markdown: body, line: h.line });
  }
  return sections;
}

/**
 * Pick the introduction text per the operator-locked priority:
 *   manuscript Introduction → Preface → Foreword → null (caller falls back to
 *   operator-supplied replacement, then AI — never silently).
 */
export function pickIntroductionSection(sections: RecoveredSection[]): RecoveredSection | null {
  for (const kind of ['INTRODUCTION', 'PREFACE', 'FOREWORD'] as const) {
    const found = sections.find((s) => s.kind === kind);
    if (found) return found;
  }
  return null;
}
