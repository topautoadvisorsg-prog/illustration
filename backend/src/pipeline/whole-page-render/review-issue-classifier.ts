/**
 * Classifies whether an AI-review finding was invalidated by a newer reviewer
 * ruleset, or is a genuine defect that stands regardless of version.
 *
 * Lives in src/ (not scripts/) so it is importable and unit-testable. Getting
 * this wrong is expensive both ways: too narrow re-renders a clean page for
 * nothing; too broad promotes a broken page into a printed book. It has been
 * wrong twice already — see review-issue-classifier.test.ts.
 */
export function isInvalidatedIssue(issue: string): boolean {
  const m = issue.match(/^(.+?)\s*\(as printed[^)]*\)\s*->\s*(.+?)\s*\(from source\)/);

  // A finding that says text is PRESENT but absent from source is a stray
  // artifact ("L13", "E16") or a title the old rules mis-flagged. Only the
  // title case was invalidated in v2, and titles are words — never bare
  // alphanumeric noise. Anything that is not clearly a word stays a defect.
  if (/\[?(absent from source|not in source|no source word)\]?/i.test(issue)) {
    const printed = m?.[1]?.trim() ?? '';
    // Real words (letters, possibly hyphenated/possessive) could be a title.
    const looksLikeWord = /^[A-Za-z][A-Za-z'’-]*$/.test(printed.replace(/[.,;:!?]$/, ''));
    return looksLikeWord;
  }

  if (!m) return false;
  const printed = m[1]!.trim();
  const source = m[2]!.trim();

  // The ONLY safe invalidation: the two strings are identical once
  // typographic variants are normalized. That means the difference is purely
  // how a mark is drawn, not what the text says.
  const normalize = (s: string) =>
    s
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…/g, '...')
      .replace(/ﬁ/g, 'fi')
      .replace(/ﬂ/g, 'fl')
      // En/em dash between SPACES is typographic; a dash touching letters on
      // both sides is not — it fuses or splits words and changes the text.
      .replace(/\s[–—]\s/g, ' - ')
      .trim()
      .toLowerCase();

  if (normalize(printed) === normalize(source)) return true;

  // Word-boundary check. Split on WHITESPACE ONLY — never on dashes. A dash
  // touching letters on both sides is exactly the defect being hunted:
  // "on–the" is one token, "on the" is two, so the counts differ and it is
  // correctly kept as a defect. Splitting on dashes here would erase that
  // distinction and silently launder the bug (caught by regression test).
  const words = (s: string) => normalize(s).split(/\s+/).filter(Boolean);
  const pw = words(printed);
  const sw = words(source);
  if (pw.length !== sw.length) return false; // fused or split — real defect

  // Same words, differing only by trailing/leading punctuation marks that do
  // not change meaning (a comma drawn where a semicolon belongs still reads
  // as the same words). Kept narrow: only strips edge punctuation.
  const stripEdges = (s: string) => s.replace(/^[.,;:!?"'()\[\]]+|[.,;:!?"'()\[\]]+$/g, '');
  return pw.every((w, i) => stripEdges(w) === stripEdges(sw[i] ?? ''));
}
