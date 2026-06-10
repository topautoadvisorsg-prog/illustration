/**
 * Front Matter v1 — recover manuscript front-matter sections.
 *
 * The breakdown parser keeps ONLY `# CHAPTER N` H1s and silently drops every
 * other H1 (documented: BREAKDOWN_MISSING_PAGES.md §7). The New England
 * manuscript's Introduction vanished this way. This module re-reads the raw
 * manuscript and recovers recognized front-matter sections so the author's
 * own text is NEVER silently replaced by templates or AI.
 *
 * Recovery priority (operator-locked): Introduction → Preface → Foreword.
 * All matching sections are returned; the planner picks per priority.
 *
 * GENERIC: heading recognition is a platform map, not book-specific. Pure
 * function — no I/O.
 */

export type RecoveredSectionKind = 'INTRODUCTION' | 'PREFACE' | 'FOREWORD' | 'DEDICATION';

export interface RecoveredSection {
  kind: RecoveredSectionKind;
  /** The heading exactly as the author wrote it. */
  headingText: string;
  /** Section markdown WITHOUT the heading line, trimmed. */
  markdown: string;
  /** 1-based line of the heading in the manuscript (operator audit). */
  line: number;
}

/** Recognized H1 titles → section kind. Case-insensitive, exact word match. */
const RECOGNIZED: Array<{ kind: RecoveredSectionKind; pattern: RegExp }> = [
  { kind: 'INTRODUCTION', pattern: /^introduction\b/i },
  { kind: 'PREFACE', pattern: /^preface\b/i },
  { kind: 'FOREWORD', pattern: /^foreword\b/i },
  { kind: 'DEDICATION', pattern: /^dedication\b/i },
];

interface H1 {
  title: string;
  line: number;
  /** Index of the heading line in the split-lines array. */
  lineIdx: number;
}

function collectH1s(markdown: string): H1[] {
  const lines = markdown.split('\n');
  const out: H1[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) out.push({ title: (m[1] ?? '').trim(), line: i + 1, lineIdx: i });
  }
  return out;
}

function isChapterTitle(title: string): boolean {
  return /^chapter\s+\d+\b/i.test(title);
}

/**
 * Scan the manuscript for recognized front-matter H1 sections. Sections may
 * appear before the first chapter OR after the last one (e.g. a trailing
 * dedication) — content between a recognized H1 and the next H1 belongs to it.
 */
export function recoverFrontMatterSections(markdown: string): RecoveredSection[] {
  const lines = markdown.split('\n');
  const h1s = collectH1s(markdown);
  const sections: RecoveredSection[] = [];

  for (let i = 0; i < h1s.length; i++) {
    const h = h1s[i]!;
    if (isChapterTitle(h.title)) continue;
    const match = RECOGNIZED.find((r) => r.pattern.test(h.title));
    if (!match) continue;
    const endIdx = i + 1 < h1s.length ? h1s[i + 1]!.lineIdx : lines.length;
    const body = lines
      .slice(h.lineIdx + 1, endIdx)
      .join('\n')
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
