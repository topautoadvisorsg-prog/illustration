# THE FIXTURE FIELD GUIDE

### A Synthetic Book for Exercising the Publishing Engine

## About This Fixture

This book is not for sale and describes nothing real. It exists so the
publishing engine can be tested against a manuscript this repository owns,
rather than against a commercial manuscript that lives in an operator's
Downloads folder and changes without warning.

Every structure below is here on purpose. If you remove one, a test that depends
on it will fail, and that failure is the point: this file is the contract.

## How to Read This

Each chapter exercises a different dangerous surface of the engine. The prose is
deliberately dull. Nothing here should read as though a person wanted to write
it, because interesting prose invites edits, and edits to a fixture are how a
test baseline quietly stops meaning anything.

# PART ONE — STRUCTURE

## Chapter 1: Openers, Body and Lists

A chapter opener has to survive being the first thing on a page: the heading
sits in a painted zone, the first paragraph follows it, and the running head for
this page must carry the chapter title rather than the book title.

This is a second paragraph, present so the engine has to make a real decision
about paragraph spacing rather than a trivial one. Body text needs at least a
few lines before anything interesting happens to it, or the pagination never has
to think.

### A Section Heading Inside a Chapter

Sections divide a chapter without starting a new page. This one exists so the
running-head logic has a heading it must NOT promote.

This paragraph carries a deliberate defect for the correction layer to fix: the gate closes at 5 p.m.. and that doubled period is here on purpose.

The things a bulleted list has to survive:

- A short item.
- An item long enough to wrap in the measure, which is where list spacing bugs show themselves rather than on the short ones.
- A third item, so the list has a middle as well as two ends.

And the things a numbered list has to survive:

1. Numbers that align.
2. An item long enough to wrap in the measure so the hanging indent is exercised rather than merely declared.
3. A final item.

> **Read This Before You Continue**
> A labelled callout: the first source line is entirely bold, so the engine
> renders it as a label rather than as body. Callouts are the block most likely
> to break across a page, which is exactly why one lives here.

That paragraph after the callout matters too. Spacing below a callout is a
separate rule from spacing above it, and only a following paragraph proves it.

## Chapter 2: Tables, Plates and Preformatted Text

Tables are the block that most often silently loses content, so this chapter
carries two: one that fits the measure comfortably, and one that does not.

A narrow table, which should set inside the text block:

| Stage | What it does | Fails when |
|---|---|---|
| Parse | Reads headings and blocks | A heading is malformed |
| Typeset | Lays pages out | A block cannot be broken |
| Assemble | Writes the PDF | A font is not embedded |

A wide table, which must trigger the wide-table fallback rather than running off
the measure or being silently truncated:

| Stage | Input | Output | Owner | Typical duration | Failure mode | Recovery | Notes |
|---|---|---|---|---|---|---|---|
| Ingestion | Markdown | Outline | Parser | Under a second | Malformed heading | Fix the source | Deterministic |
| Layout | Outline | Paged HTML | Typesetter | Seconds | Unbreakable block | Change the layout standard | Chromium |
| Assembly | Paged HTML | PDF | Assembler | Seconds | Missing font | Vendor the face | Must embed |
| Covers | Interior PDF | Cover PDF | Compositor | Seconds | Unverified geometry | Read the calculator | Fails closed |

A plate, placed in the flow, so the engine has to reserve space for an image and
caption rather than only for text:

![A synthetic test plate, black and white.](fixture-plate)

Preformatted text, which must be set in the vendored monospace face and must not
fall back to a system font:

```
  parse -> typeset -> paginate -> assemble
    |        |          |           |
    +--------+----------+-----------+
             deterministic
```

This chapter ends here, deliberately short, so the last page carries visible
trailing whitespace and the engine has to decide whether that is an orphan.

# PART TWO — REFERENCE

## Chapter 3: A Chapter That Forces a Parity Blank

A book printed as a physical object needs chapters to open on a recto. When the
previous chapter ends on a recto, the engine must insert a blank verso rather
than starting this one on the back of a page.

That blank page is not a defect and must not be removed by a cleanup pass. It is
the single most commonly "fixed" correct behaviour in book production, so a test
asserts it exists.

The rest of this chapter is filler whose only job is to occupy enough lines that
pagination has somewhere to put a page break.

Paper takes ink differently depending on how it was made, which is why the spine
of a printed book is a function of its page count and its paper stock rather
than of its word count. None of that matters to this fixture except as a way to
fill a page honestly.

# BACK MATTER

## Appendix A: Reference Values

An appendix has to keep its own heading style, appear in the contents, and carry
a running head that says Appendix rather than Chapter.

| Symbol | Meaning | Unit |
|---|---|---|
| w | Trim width | inches |
| h | Trim height | inches |
| s | Spine width | inches |

### → All Figures Here Are Synthetic

That heading above carries a drawn mark. A layout standard that sets
`headingDrawnMarks: 'strip'` must remove the arrow from the running head and the
contents entry while leaving it in the body text, and one that leaves the policy
unset must draw it everywhere. Both behaviours are tested.

## Sources

Sources are their own section, not an appendix, and must not be numbered as a
chapter.

1. The Fixture Standards Board. *Nothing Real, Volume One.* Synthetic Press, 2026.
2. The Fixture Standards Board. *Nothing Real, Volume Two.* Synthetic Press, 2026.
3. A third entry, so the list has a middle.
