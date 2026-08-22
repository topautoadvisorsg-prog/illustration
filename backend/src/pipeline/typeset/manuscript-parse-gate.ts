/**
 * MANUSCRIPT PARSE GATE — does the parser see everything the manuscript says?
 *
 * ─── THE HOLE THIS FILLS ───────────────────────────────────────────────────
 * Every structural defect this platform has hit on a typeset book has failed
 * the same way: SILENTLY, and downstream of anything that could notice.
 *
 *   DIRT RICH          8 of 24 sections dropped — The Practical Bits, six
 *                      appendices, the glossary — because bare H1s were read as
 *                      the title block. Reported success.
 *   7 NATIONAL PARKS   0 of 12 chapters recognised, the composite-narrator
 *                      disclosure and both author notes dropped, 177 non-blank
 *                      lines gone. Reported success.
 *   NO ONE TOLD ME     a flag glyph deleted at ingestion, so the most urgent
 *                      category in the index looked like every other one.
 *                      Reported success.
 *
 * None of these could be caught downstream, and that is structural rather than
 * bad luck. The every-section invariant compares the render against the PARSE,
 * and text-fidelity QA compares the PDF against the PARSE — so anything lost
 * BEFORE or DURING the parse is missing from both sides of every later
 * comparison, and every later comparison passes.
 *
 * The only place to catch it is here, against the manuscript's own bytes.
 *
 * ─── THE RULE THIS GATE LIVES BY ───────────────────────────────────────────
 * A check may only FAIL on evidence. "I could not tell" is a WARN.
 *
 * That rule is not decoration: this gate's predecessor blocked a book at the
 * printer and a book already on sale, both times because a check demanded
 * something the book had no reason to have. A gate that fails shipped books is
 * one the operator learns to ignore.
 *
 * So every FAIL here is a COUNT COMPARISON against the source — lines in versus
 * lines out, chapter headings in versus chapters out, marks in versus marks
 * kept. Nothing is inferred, and a manuscript shape this file has never seen
 * produces zeroes on both sides and passes.
 */
import { sanitizeManuscript, strippedPictographs } from '../stage-1-ingestion/sanitize-manuscript.js';
import { detectHeadingConvention, parseTypesetSections, type HeadingConvention } from './typeset-book.js';

export interface ManuscriptParseFinding {
  id: string;
  label: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'NA';
  detail: string;
  fix?: string;
}

export interface ManuscriptParseAudit {
  convention: HeadingConvention;
  /** Headings counted in the source, by level. */
  source: { h1: number; h2: number; h3: number; nonBlankLines: number; tableRows: number };
  /** What the parser produced. */
  parsed: {
    sections: number;
    chapters: number;
    /** Non-blank lines retained across every section body plus every title. */
    retainedLines: number;
    tableRows: number;
  };
  /**
   * Non-blank source lines dropped AFTER structure began.
   *
   * The title block before the first structural marker is dropped ON PURPOSE —
   * the title page is generated matter, so typesetting the manuscript's own
   * would set it twice. Counting those as loss would make the gate cry wolf on
   * every book, so the measurement starts where the deliberate drop ends.
   */
  droppedAfterStructure: number;
  findings: ManuscriptParseFinding[];
  ok: boolean;
}

/** A heading that declares a chapter under any convention this parser reads. */
const CHAPTER_HEADING = [
  /^#\s+chapter\s+\d+/i, // marked
  /^##\s+chapter\s+\d+\s*[:.–—-]\s*\S/i, // self-numbered
  /^#\s+\d+\s*[:.–—-]\s*\S/, // numbered-h1
];

const isBlank = (l: string): boolean => l.trim() === '';
const isTableRow = (l: string): boolean => /^\s*\|/.test(l);

/**
 * Audit the parse of one manuscript. Deterministic, read-only, free.
 *
 * `markdown` is the CANONICAL source — before sanitization. That matters: the
 * pictograph check exists precisely because sanitization is where marks are
 * lost, and handing this the already-sanitized copy would compare it against
 * itself and always pass.
 */
export function auditManuscriptParse(markdown: string): ManuscriptParseAudit {
  const findings: ManuscriptParseFinding[] = [];
  const srcLines = markdown.split('\n');

  const source = {
    h1: srcLines.filter((l) => /^#\s+\S/.test(l)).length,
    h2: srcLines.filter((l) => /^##\s+\S/.test(l)).length,
    h3: srcLines.filter((l) => /^###\s+\S/.test(l)).length,
    nonBlankLines: srcLines.filter((l) => !isBlank(l)).length,
    tableRows: srcLines.filter(isTableRow).length,
  };

  // Everything downstream reads the sanitized working copy, so the parse must be
  // measured on that and not on the raw upload.
  const working = sanitizeManuscript(markdown);
  const workingLines = working.split('\n');
  const convention = detectHeadingConvention(working);
  const sections = parseTypesetSections(working);

  const bodyLines = sections.flatMap((s) => s.bodyLines);
  const parsed = {
    sections: sections.length,
    chapters: sections.filter((s) => s.kind === 'chapter').length,
    // A section's own heading survives as its title, so it counts as retained.
    retainedLines: bodyLines.filter((l) => !isBlank(l)).length + sections.length,
    tableRows: bodyLines.filter(isTableRow).length,
  };

  /**
   * Where the deliberate title-block drop ends: the first line that is a
   * structural marker or a chapter heading. Everything from there on is content
   * the parser is supposed to keep.
   */
  const firstStructural = workingLines.findIndex(
    (l) =>
      /^#\s+(front\s+matter|back\s+matter)\s*$/i.test(l.trim()) ||
      CHAPTER_HEADING.some((re) => re.test(l.trim())),
  );
  const afterStructure = firstStructural < 0 ? [] : workingLines.slice(firstStructural);
  const expectedAfterStructure = afterStructure.filter((l) => !isBlank(l)).length;
  /**
   * Lines the parser CONSUMES rather than retains, and which therefore must not
   * be counted as loss.
   *
   * Section titles survive as `section.title`, so they are already accounted
   * for. These are the structural markers that carry no title of their own:
   * `# FRONT MATTER`, `# BACK MATTER`, and — in the marked convention — the
   * `# Chapter N` line, whose title comes from the H2 beneath it. Missing the
   * chapter marker made the gate report one dropped line for every chapter in
   * every book using the original convention, which is every Wildlands volume.
   */
  const markerLines = afterStructure.filter((l) => {
    const v = l.trim();
    return /^#\s+(front\s+matter|back\s+matter)$/i.test(v) || /^#\s+chapter\s+\d+/i.test(v);
  }).length;
  const droppedAfterStructure = Math.max(
    0,
    expectedAfterStructure - markerLines - parsed.retainedLines,
  );

  // ── 1. Nothing is dropped once structure has started ──────────────────────
  if (firstStructural < 0) {
    findings.push({
      id: 'parse.structure',
      label: 'Manuscript structure',
      status: 'WARN',
      detail:
        'No chapter or matter marker found, so the deliberate title-block drop has no end point and line retention cannot be measured.',
      fix: 'Confirm by eye that the parsed sections cover the whole manuscript.',
    });
  } else if (droppedAfterStructure > 0) {
    findings.push({
      id: 'parse.retention',
      label: 'Line retention',
      status: 'FAIL',
      detail: `${droppedAfterStructure} non-blank source lines are not in any parsed section. Expected ${expectedAfterStructure - markerLines} after the title block, retained ${parsed.retainedLines}.`,
      fix: 'The parser does not recognise part of this manuscript\'s structure. Do not build: the missing text will be absent from the PDF and every later check compares the render against the same truncated parse.',
    });
  } else {
    findings.push({
      id: 'parse.retention',
      label: 'Line retention',
      status: 'PASS',
      detail: `All ${parsed.retainedLines} non-blank lines after the title block are in a parsed section.`,
    });
  }

  // ── 2. Chapters the manuscript declares are chapters the parser found ─────
  const declaredChapters = workingLines.filter((l) =>
    CHAPTER_HEADING.some((re) => re.test(l.trim())),
  ).length;
  if (declaredChapters === 0) {
    findings.push({
      id: 'parse.chapters',
      label: 'Chapter recognition',
      status: 'NA',
      detail: 'This manuscript declares no numbered chapter headings, so there is nothing to recognise.',
    });
  } else if (parsed.chapters < declaredChapters) {
    findings.push({
      id: 'parse.chapters',
      label: 'Chapter recognition',
      status: 'FAIL',
      detail: `${declaredChapters} chapter headings in the source, ${parsed.chapters} recognised (convention: ${convention}).`,
      fix: 'Chapters read as ordinary sections lose the chapter opener, the numbering and the running heads, and each subheading takes a forced page break.',
    });
  } else {
    findings.push({
      id: 'parse.chapters',
      label: 'Chapter recognition',
      status: 'PASS',
      detail: `${parsed.chapters} of ${declaredChapters} chapters recognised (convention: ${convention}).`,
    });
  }

  // ── 3. Every authored table row reaches the renderer ──────────────────────
  if (source.tableRows === 0) {
    findings.push({
      id: 'parse.tables',
      label: 'Table rows',
      status: 'PASS',
      detail: 'No tables in this manuscript.',
    });
  } else if (parsed.tableRows < source.tableRows) {
    findings.push({
      id: 'parse.tables',
      label: 'Table rows',
      status: 'FAIL',
      detail: `${source.tableRows} pipe rows in the source, ${parsed.tableRows} reached a section body.`,
      fix: 'Rows lost between the source and the parse are reference content the reader will not get.',
    });
  } else {
    findings.push({
      id: 'parse.tables',
      label: 'Table rows',
      status: 'PASS',
      detail: `All ${source.tableRows} pipe rows reached the renderer.`,
    });
  }

  // ── 4. No pictograph carrying meaning is deleted at ingestion ─────────────
  const stripped = strippedPictographs(markdown);
  if (stripped.length === 0) {
    findings.push({
      id: 'parse.markers',
      label: 'Semantic markers',
      status: 'PASS',
      detail: 'No pictograph is removed by ingestion.',
    });
  } else {
    const listed = stripped.map((s) => `${s.codePoint} x${s.count}`).join(', ');
    findings.push({
      id: 'parse.markers',
      label: 'Semantic markers',
      status: 'WARN',
      detail: `Ingestion removes ${stripped.reduce((n, s) => n + s.count, 0)} pictograph(s): ${listed}.`,
      fix: 'Confirm each is decorative. If any marks meaning — a warning, a flag, a tick/cross contrast — add it to SEMANTIC_PICTOGRAPHS in sanitize-manuscript.ts and give it a drawn glyph, or it is gone from the stored working copy and no later check can see the loss.',
    });
  }

  const ok = !findings.some((f) => f.status === 'FAIL');
  return { convention, source, parsed, droppedAfterStructure, findings, ok };
}
