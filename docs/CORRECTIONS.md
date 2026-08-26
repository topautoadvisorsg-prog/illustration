# Corrections

**One book needs something different. Change the book, not the platform.**

```
book-specific change  ->  book-local correction   (this document)
systemic defect       ->  shared platform change
manuscript            ->  frozen, always
```

Before this layer existed, correcting one stray period meant editing a frozen
manuscript, branching a shared renderer on a book title, or shipping the defect.
All three are wrong, and the third is what usually happened.

---

## How do I correct one typo?

Find the block, then write the correction against it.

```bash
tsx scripts/qa/corrections.ts blocks --manuscript book.md --section chapter-1-openers-body-and-lists
```

```
    e43f3d0a  p            This paragraph carries a deliberate defect for the correction
```

```bash
tsx scripts/qa/corrections.ts add --corrections corrections.json \
    --type text --id fix-doubled-period --anchor e43f3d0a \
    --expect "5 p.m.. and" --replace "5 p.m. and" \
    --reason "Typo: a sentence period after an abbreviation that already ends in one."
```

```bash
tsx scripts/qa/corrections.ts report --manuscript book.md --corrections corrections.json
```

```
  [APPLIED        ] fix-doubled-period  (text)
      why    : Typo: a sentence period after an abbreviation that already ends in one.
      result : Replaced in "Chapter 1: Openers, Body and Lists".
      before : … the gate closes at 5 p.m.. and that doubled period is here on pu
      after  : … the gate closes at 5 p.m. and that doubled period is here on pu
```

**`--expect` is a residue check, not decoration.** If the manuscript has been
revised and that text is no longer there, the build stops with
`CORRECTION NO LONGER MATCHES SOURCE` rather than replacing whatever now sits at
that anchor. That is how an old patch would otherwise corrupt a new edition.

**The anchor survives the fix.** Block ids are computed from alphanumerics only,
so `5 p.m..` and `5 p.m.` have the same identity. The correction stays resolvable
on the next build instead of becoming a mystery.

---

## How do I change author metadata?

```bash
tsx scripts/qa/corrections.ts add --corrections corrections.json \
    --type metadata --id author-legal-name --field authorName \
    --value "The Fixture Standards Board (Synthetic Press)" \
    --reason "The imprint must appear with the author on every output."
```

One change, flowing to every output that displays it. Cover, title page and EPUB
must not carry independent copies of an author name. Where a displayed form
*intentionally* differs, say so with a separate display correction rather than
letting the two drift apart silently.

Fields: `title`, `subtitle`, `authorName`, `edition`.

---

## How do I change only a running head?

Without touching a word of the manuscript:

```bash
tsx scripts/qa/corrections.ts add --corrections corrections.json \
    --type runningHead --id appendix-short-running-head \
    --section appendix-a-reference-values --display "Appendix A" \
    --reason "The full title does not fit the folio line at this trim."
```

`tocDisplay` works the same way when the contents entry should read differently
from the heading. Both are keyed by section slug, both are explicit, and both are
reported on every build.

---

## How do I keep one heading with two lines?

That is a layout correction, and it compiles to exactly the same
`LayoutOverride` the existing override system already uses. This is a second way
to *write* one, not a second way to *apply* one.

```bash
tsx scripts/qa/corrections.ts add --corrections corrections.json \
    --type layout --id keep-lead-in-with-list --anchor 6b1915c5 --keep-with-next \
    --reason "The lead-in sentence was orphaned above a page break from its list."
```

The property set is closed: `spaceBeforeEm`, `spaceAfterEm`, `keepWithNext`,
`keepTogether`, `breakBefore`, `breakAfter`, `variant`, `note`. An arbitrary CSS
field would turn the escape hatch into a second, unversioned layout system
competing with the standard.

---

## The correction types

| Type | For | Anchored by |
|---|---|---|
| `text` | one punctuation or wording fix | block id, with an `expect` residue check |
| `metadata` | title, subtitle, author, edition | the field name |
| `headingDisplay` | how one heading prints; strip a drawn mark | block id |
| `runningHead` | the folio line for one section | section slug |
| `tocDisplay` | a contents entry that differs on purpose | section slug |
| `layout` | spacing and page breaking | block id |
| `illustration` | a plate anchored to content | block id |
| `blockPresentation` | an approved variant on a table or callout | block id |

**Illustrations are anchored to blocks, never to page numbers.** A page-anchored
plate survives only until something upstream repaginates, and then it lands on
the wrong page in silence. A structural anchor moves with its content.

---

## Where corrections apply

```
canonical source -> parse -> RESOLVE -> APPLY -> typeset -> paginate -> QA -> artifact
```

Before typesetting, never to a finished PDF. Approved plate *stamping* stays
post-pagination, because that path draws into space the paginator left; that is a
different job from correcting content.

---

## Nothing is ever silently dropped

| Anchor resolves | Result |
|---|---|
| exactly once | applied |
| zero times | **UNMATCHED** — build blocked |
| more than once | **AMBIGUOUS** — build blocked |
| expected text absent | **EXPECT_MISMATCH** — build blocked |
| unknown type or property | **rejected by the schema** |

A build is not READY while any of those stands. A correction someone deliberately
made must never become a no-op nobody was told about — that is worse than having
no correction layer, because the build reported success and the defect shipped.

`AMBIGUOUS` counts *occurrences*, not lines. An expectation matching twice in one
paragraph is refused rather than applied to whichever comes first.

`superseded` retires a correction without deleting it, so the history of a
decision survives being reversed.

---

## When should I modify shared renderer code?

Only on evidence. Keep it book-local when one title wants one different
presentation choice. Escalate to a shared platform change when:

- the parser or renderer behaviour is **wrong for more than one book**;
- the layout standard is **objectively incorrect**, not merely unsuited to this title;
- the **same workaround keeps being written** for book after book;
- or the defect **cannot safely be expressed** as a book-local correction.

The test is not "is this annoying to express as a correction". It is "would every
book want this". A book name inside a renderer branch is always the wrong answer.

---

## Commands

```bash
tsx scripts/qa/corrections.ts blocks   --manuscript book.md [--section SLUG] [--kind p|callout|table]
tsx scripts/qa/corrections.ts add      --corrections c.json --type TYPE --id ID --reason "..."
tsx scripts/qa/corrections.ts validate --manuscript book.md --corrections c.json
tsx scripts/qa/corrections.ts report   --manuscript book.md --corrections c.json [--json]
```

`validate` and `report` exit `2` when anything is unresolved, so a build script
stops rather than continuing past a correction that did not apply.

A worked example carrying all eight types lives in
`backend/src/__tests__/fixtures/fixture-book/corrections.json`.
