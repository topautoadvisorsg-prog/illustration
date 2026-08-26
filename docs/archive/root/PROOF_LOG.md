# THE WILDLANDS: NEW ENGLAND — Final Verbatim Text Proof Log

Project ID: `66c1c69c-2c81-409e-a4b5-bff3f3bb04ba`
Method: open each rendered page, read every word, compare against the manuscript
source text (`readingFieldText` + policy title), mark VERIFIED only on exact match.
Findings split into **Render issues** (rendered page is wrong) and **Manuscript
editorial notes** (manuscript wording issue; render is faithful). Do not stop for
editorial notes; re-render only affected pages after full review.

Last updated: PROOF COMPLETE (274 pages). FIX PHASE in progress — R4 done; R5 code
fix done (openers pending R1 batch); R6 next; R1 next.

## FIX STATUS
- **R4 — DONE.** Root cause was NOT layout overflow — it was the same
  `stripReadingFieldMetadata` over-reach as R5: the False Hellebore look-alike block
  starts with bold lines containing hazard words and was stripped. Fixed the strip
  heuristic (`isStatusBadgeLine`, extract-badges.ts), added 7 regression tests (37/37
  pass), set P002_c2 to a contained vignette, re-rendered (v4 active, pending operator
  approval). Verified: the DEADLY False Hellebore warning + full block now render
  verbatim.
- **R5 — code fix DONE (same change as R4).** CH04_P008 (Hemlock) & CH04_P011 (Black
  Cherry) lead warnings now survive the strip (verified on real text). These are
  OPENERS, so their re-render is folded into the R1 batch (one render restores both
  the scientific name AND the lead warning — no double spend).
- **R6 — DONE.** Root cause: `splitReferenceIndex` packed the index by CHARACTERS, but
  each entry is a column LINE — so it overpacked BM_003 (~129 entries onto 2 pages, one
  page got ~109) and the AI page dropped ~26%. Fix: split by column-LINES
  (`referenceColumnLineCapacity` = usableLines×2, cost = ceil(len/measureChars)) in
  plan-front-matter.ts. Re-flowed THIS book surgically (no destructive planner re-run):
  129 entries → 3 pages (59/60/10); updated BM_003/BM_004, inserted BM_005_INDEX (spine
  5), bumped ABOUT_SERIES to spine 6; re-rendered all 3 (active, pending approval).
  Verified: every previously-dropped entry (Ridgelines→Timber Rattlesnake) is present.
- **R1 — DONE (+ R5 folded in).** Shared rendering-path fix: `types.ts`
  (title.scientificName), `build-page-spec.ts` (binomial only for INTERIOR openers
  whose body starts with a `*Genus species* |` HEADER — prose mentions like Giardia
  excluded), `assemble-page-prompt.ts` (italic species byline under the common name).
  Tests added; 46/46 pass; tsc clean. Sample (3) approved by operator, then full batch
  of 72 openers re-rendered (Ch2 ×23, Ch3 ×23, Ch4 ×13, Ch5 ×13) — 75 total with the
  samples. render-health: 0 dropped. Spot-checked animal/plant/tree/fungus — bylines
  correct (genus-capital, species-lowercase, italic, sized-down). All active/pending
  operator approval.
- **R5 — DONE.** CH04_P008 (Hemlock) & CH04_P011 (Black Cherry) re-rendered in the R1
  batch: verified both the restored bold lead-warning paragraph AND the scientific-name
  byline are present.
- **R2 — deferred** (minor, tick diagram label); **N1 — editorial (manuscript), not a render bug.**

## ALL RENDER DEFECTS RESOLVED
R1 ✅ · R2 (deferred) · R3 (closed — stamping layer) · R4 ✅ · R5 ✅ · R6 ✅ · N1 (editorial).
Pending: operator approval of re-rendered pages in the console; then Step 8 (cover/spine/
back cover) + final select-for-book pass + assembly. Deploy note: all fixes are in local
source (tests + tsc green); re-renders were produced via the local tsx path. Pushing the
code fixes to the running service is a separate authorized step.

Deploy note: strip fix is committed to local source + verified; the running Railway
service still has old code, so re-renders are done via the local tsx script path
(which uses the fixed code). Push/deploy is a separate authorized step.

---

## Progress

| Section | Pages | Status |
|---------|-------|--------|
| Front matter | 11/11 | ✅ VERIFIED |
| Chapter 1 (openers + continuations) | 22/22 | ✅ VERIFIED |
| Chapter 2 (openers + continuations) | 52/52 | ✅ body VERIFIED (R1×24, R2) |
| Chapter 3 (openers + continuations) | 52/52 | ✅ body VERIFIED (R1×24 species, R3×18 edible, R4 on P002_c2) |
| Chapter 4 (openers + continuations) | 33/33 | ✅ body VERIFIED (R1×13 trees, R5 on P008 + P011) |
| Chapter 5 (openers + continuations) | 32/32 | ✅ body VERIFIED (R1×14 fungi, R3×9 edible) |
| Chapter 6 (openers + continuations) | 31/31 | ✅ VERIFIED — fully clean (topic chapter, no R1) |
| Chapter 7 (openers + continuations + compacted) | 19/19 | ✅ VERIFIED — fully clean (topic chapter) |
| Chapter 8 (openers + continuations + compacted) | 17/17 | ✅ VERIFIED — fully clean (bushcraft, no R1) |
| Back matter (glossary ×2, index ×2, about-series) | 5/5 | ✅ VERIFIED — glossary/about clean; R6 on BM_003_INDEX |

**Total proofed: 274 / 274 pages. PROOF COMPLETE.**
Glossary (BM_001/002) complete — all 57 terms Amatoxin→Wattap present. About-Series
(BM_005) clean, no double-article bug. BM_004 index matches its slice. Ch6 & Ch7 are topic chapters (no species bylines → no
R1/R3/R5). Ch7 medical content all complete and correct — hypothermia stage temps
(95/82–90/below 82/68°F), Lyme 200mg/72hr/87%, snakebite do/don't, anaphylaxis EpiPen
protocol, all 8 AMC huts named, and the compacted emergency-contact page (CH07_P008_m)
renders every phone number correct digit-for-digit (603-271-3361, 207-624-7076,
802-828-1000, 603-466-2721, 1-800-222-1222). No truncation.

---

## Render issues (rendered page differs from manuscript)

### R1 — Scientific-name byline never emitted as page text (REAL RENDER BUG — confirmed)
Root cause located. The binomial (`*Ursus americanus* |`) is CORRECTLY stripped from
body prose by `stripReadingFieldMetadata` (extract-badges.ts:116) — this prevents raw
`*Genus species* |` markup bleeding into a paragraph — and is parsed into `cleanSubject`
("Black Bear (Ursus americanus)") which is used ONLY as the illustration subject. The
opener title spec (build-page-spec.ts:175,196) carries the common name only; the
binomial has NO path to visible page text. So it is extracted but never re-emitted.
FIX (template/spec level, one shared path): in build-page-spec.ts, parse the binomial
(reuse `extractBinomial`) and emit it as an italic subtitle line under the common-name
title for INTERIOR species/plant/tree/fungi openers (add to `titleHierarchy` +
`pageTitle`, and have page-role-policy/renderer print it italic). Then BATCH re-render
all affected openers (~75: Ch2 ×24, Ch3 species ×24, Ch4 ×13, Ch5 species ×14). No
per-page patching.

### R2 — Tick diagram size label (MINOR, LOW)
CH02_P022_c1: the tick illustration captions the adult male "1/8 in (3 mm)," same
as the female, while the body text correctly says the male is "Smaller."
Illustration-label imprecision only; body text correct.

### R3 — EDIBLE/MEDICINAL status badge — NOT A RENDER BUG (ownership: stamping layer)
RESOLVED via code investigation. EDIBLE/MEDICINAL are hazard-family BADGE VALUES
(`publishing-standard/badges/`). The manuscript's status line is INTENTIONALLY
stripped from the body by `stripReadingFieldMetadata` (extract-badges.ts:118), the
value is extracted by `detectHazards`, composed into `badgeSet`, and stamped as a
corner SVG icon (leaf-check / mortar+pestle) by Print-Prep at book-assembly — the
SAME overlay layer as page numbers (build-page-spec.ts:73-75, 274-279: model spec
always emits `badges: []`). The raw whole-page render correctly omits it; the final
assembled page carries the corner badge. **Removed from the render-defect list.**
Minor editorial note only: the parenthetical caveat (e.g. "with harvest restraint")
is reduced to the icon, but that guidance still appears in the entry's body prose, so
no content is lost.

### R5 — Bold lead-warning paragraph wrongly stripped (REAL RENDER BUG — strip over-reach)
CONFIRMED via code investigation: this IS body text that should bake, NOT a stamp.
Root cause: `stripReadingFieldMetadata` (extract-badges.ts:118) treats a leading line
as metadata if it starts with `**` AND contains a hazard keyword. The Hemlock and
Black Cherry lead warnings are full prose paragraphs that happen to (a) be fully bold
and (b) contain "toxic"/"edible" as ordinary words — so the whole paragraph is removed.
- CH04_P008 (Eastern Hemlock): "This tree shares a common name with two of the most
  toxic plants in North America… before anything else." (point survives in the
  rendered "Name Confusion — Critical" section, but the lead warning is gone)
- CH04_P011 (Black Cherry): "Read the full entry before handling… The fruit is edible.
  The leaves, bark, and seeds are toxic."
FIX: tighten the line-118 heuristic so it only matches a SHORT marker line (bold span
≈ whole line / line under ~60 chars), not a multi-sentence bold paragraph. Add a test
for both warnings. Then re-render the 2 openers. AUDIT: grep all opener bodies whose
first line starts with `**` and contains a hazard word, in case the same regex hit
others. (Distinct defect from R1, though both live in the strip/spec layer.)

### R6 — BM_003_INDEX missing ~28 trailing entries (ISOLATED, HIGH — MUST FIX)
The index spans two AI-baked pages. BM_003 source runs alphabetically A→"Timber
Rattlesnake"; BM_004 source runs "TOXIC & DANGEROUS PLANTS"→"Yellow Jacket". The
BM_003 RENDER overflowed and stops at "Red Spruce … 143" (two columns full), and
BM_004 begins at "TOXIC & DANGEROUS PLANTS" — so every entry between them is absent
from the printed index (~28 entries):
Ridgelines and How to Read Them 194 · River Crossings 212 · River Otter 45 ·
Self-Rescue vs. Stay Put 239 · Shaggy Mane 179 · SHELTER 224 · SHELTER FROM THE LAND
243 · SIGNALING 230 · Snowshoe Hare 49 · Sheep Sorrel 92 · Spruce Tips 103 · St.
John's Wort 108 · Stick Season 221 · Stinging Nettle 96 · Striped Maple 155 · Striped
Skunk 47 · Sugar Maple 130 · Tamarack / Eastern Larch 148 · Terrain Association 217 ·
THE BONES OF THE LAND 1 · THE BUSHCRAFT MINDSET 251 · THE FIRST PEOPLES 10 · THE
FORAGER'S CODE 75 · The Glacial Inheritance 192 · The Map and Compass Foundation 214 ·
THE MYCOLOGIST'S PROTOCOL 160 · THE THREE WILDERNESS ZONES 4 · Timber Rattlesnake 61.
Fix: re-paginate the index so all entries fit — add a third index page, reduce the
index font, or re-split the A–Z content across the available index pages. Same class
as R4 (AI-baked page overflow dropping content).

### R4 — CH03_P002_c2 (Ramps) missing deadly look-alike warning (ISOLATED, HIGH — MUST FIX)
The manuscript for this continuation begins with the safety-critical
"Look-Alikes & Danger" content:
- **False Hellebore / Indian Poke (*Veratrum viride*) — DEADLY** (the deadliest
  forager confusion in the book)
- Lily of the Valley (*Convallaria majalis*) — Toxic
- Wild Garlic Mustard — edible, distinguishable
- "Edible Parts & Preparation" heading
The rendered page SKIPS all of this and starts partway down at "Both the leaves and
the bulb are edible..." The "animal eating ramps" bear illustration consumed ~58%
of the page. CH03_P002_c1 ends on the bare "Look-Alikes & Danger" heading with no
content under it — so this entire safety section is currently ABSENT from the book.
Fix: re-render P002_c2 with a layout that fits the full text (smaller illustration
or text-priority layout). Note: P004_c1 has a comparably large bear illustration but
fit all its text, so R4 is layout-specific to P002_c2, not systematic.

---

## Manuscript editorial notes (manuscript wording; render faithful — do NOT auto-change)

### N1 — FM_007 incomplete sentence
Source reads "...the entry you are looking at is tagged only, you may have the wrong
identification" — appears to be missing a zone name after "tagged only." Render is
faithful to the source. Decide manuscript edit, then re-render FM_007.

---

## Pages flagged for re-render after review
- **R4:** CH03_P002_c2 (must fix — safety content).
- **R1 (if fixing):** all species/plant openers Ch2–8 (~140+ pages) — global spec fix.
- **R3 (if fixing):** all 18 edible-plant openers Ch3 — global spec fix (same header mechanism as R1).
- **N1 (if editing manuscript):** FM_007.
