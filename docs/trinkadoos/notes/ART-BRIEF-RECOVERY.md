# Art brief recovery — The Trinkadoos, First Wave

**Date:** 2026-09-04 · **Role:** pagination & illustration
**Status:** **BLOCKER CLEARED — the complete Layout & Illustration Brief was found, not reconstructed.**

---

## 1. What was found

| | |
| --- | --- |
| File | `01-ART-BRIEF/TRINKADOOS_LAYOUT_AND_ILLUSTRATION_BRIEF.md` |
| Title inside | *THE TRINKADOOS — Layout & Illustration Brief — First Wave* |
| Compiled | 2026-08-31 — **the same compile date as the manuscript** |
| Bytes | 84,059 |
| SHA-256 | `b204e9e1b43e3dbb19cc50d9f842af3cbf43433d044b5d2a58e4c3a40e3f457c` |
| Contents | All ten books · 16 units each (p. 3 opener · 14 spreads · p. 32 closer) · **160 ART blocks**, each paired with the text that sits on the page |
| Permissions | set read-only (`444`), same convention as the baseline |

It is the real companion document the manuscript's front matter points to, and it carries a
format spec, a LOAD-BEARING ART section, and per-book spotlight/emotional-core lines.

## 2. Where it was

Not in Downloads, Documents, Desktop or OneDrive — the earlier search was correct.

It was in the **Claude desktop app's HTTP cache**,
`AppData/Roaming/Claude/Cache/Cache_Data/f_0002f4`, written **2026-09-03 15:24**, in the same
minute as the cache entries for the manuscript (`f_0002f3`, 51,995 bytes) and the bible
supplement (`f_0002f2`, 29,380 bytes) — both byte-identical to the baseline copies.

So all three documents were opened together. Two were saved to `Downloads/`; **the brief was
opened and never saved.** That is the whole story of how it went missing.

The same cache appears at a second path,
`AppData/Local/Packages/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude/Cache/Cache_Data/`. It is
**not a second copy** — it is the packaged-app redirect of the same store, with identical entry
sizes and timestamps. One cache, one copy.

A full sweep of the machine — filename search across the user profile, and content search for
`Zinumi` and `Layout & Art Brief` across Downloads, Documents, Desktop, OneDrive, the Claude
session transcripts and app data — found **no other copy and no other revision** of this document.

> **Durability warning.** A browser-style cache entry can be evicted at any time, and this one has
> no backup anywhere on the machine. The recovered copy in this folder is now the only durable
> one. Keep it, and if a canonical copy exists at source, re-download it and compare hashes.

## 3. Proof it is the right document

Not asserted — measured. Scripted comparison against the read-only baseline manuscript:

| Check | Result |
| --- | --- |
| ART blocks in brief vs. image cues in manuscript | **160 vs. 160** |
| Book/page-unit sequence identical | **yes** |
| Each condensed cue is an exact **prefix** of the corresponding full ART block | **160 / 160** |
| Mismatches | **0** |
| Story text in the brief vs. the signed-off baseline, per unit | **160 / 160 identical** |

Every one of the 160 condensed cues in the QA Reading Edition is the opening substring of the
matching ART block in this file. That is only possible if this document is the source those cues
were condensed from. Combined with the shared 2026-08-31 compile date, this is conclusive.

The text check matters just as much: **the brief has not drifted from the manuscript.** Its TEXT
blocks are the signed-off prose, unit for unit, so a paginator can set type from this file
without re-collating against the baseline.

## 4. The loss was four times worse than the QA record could see

The QA finding was *"27 of 160 cues truncated — 17% of the art direction."* That was the right
call on the evidence available, and it understated the damage.

| | |
| --- | --- |
| Art direction in the full brief | **36,966 characters** |
| Carried by the condensed cues | 7,677 characters |
| **Absent from the condensed cues** | **29,289 characters — 79.2%** |
| Of that, inside the 27 ellipsis-truncated cues | 4,022 characters |
| **Of that, lost silently from the 133 cues that looked complete** | **25,267 characters** |

The condensation rule was *first sentence, capped at about 90 characters*. The ellipsis only
appeared when the cap landed mid-sentence. **The 27 visible truncations were the symptom; 86% of
the missing art direction was in cues that showed no ellipsis at all** — which is exactly why the
QA read called the other 26 "unprovable from this file alone" and told you to find the document
rather than patch it. That instruction was correct and it has now paid off.

Book 8, Spread 3 is the clean example. Condensed cue:

> `Warm, cluttered, cheerful hillside village`

No ellipsis. Looks complete. The real brief:

> Warm, cluttered, cheerful hillside village. Everyone out of doors mid-argument, gesturing at
> empty hooks and open drawers. **In the far background beyond the bridge, ordinary fog lying low
> across the fields — atmosphere, not foreshadowing. No character looks at it. It should be no
> more remarkable than the weather.** Zinumi hovering behind them doing all the gestures at once,
> badly. Purely comic — no glow change, no reaction to anything. Nobody is frightened. Everybody
> is extremely busy being certain.

## 5. Every flagged item, checked against the recovered brief

| Item | Status |
| --- | --- |
| **Book 8 Spread 3 — mandatory fog plant** | **Present, and stronger than the requirement.** Fog beyond the bridge, low across the fields, explicitly *"atmosphere, not foreshadowing"*, *"No character looks at it"* |
| Book 6 Spread 8 — repeat composition | Present in full: repeat the exact three failures from Spread 4, staged the same way; *"should look almost identical to one the reader has already seen"* |
| Book 9 Spread 6 — repeat composition | Present in full: repeat Spread 5's composition exactly, twice; *"same picture as the puddle in the opener, at a hundred times the scale"* |
| Dimensional-storage reveal (Book 1 Spread 7) | Present in full: interior reads *"impossibly deep and softly lit, not as a hole"* |
| Multi-power climax stagings | Present in full. The QA read counted three; there are in fact **four** truncated multi-power stagings — Book 1 S12, Book 2 S12, Book 3 S11, Book 5 S12 — and all four are complete in the brief |
| Book 10 closer staging | Present in full |
| Book 4 Spread 10 — *"dark band"*, never *"shadow"* | Present and obeyed; also instructs not to show the source yet |
| Book 7 Spread 2 — wall clue goes unread | Present and explicit |
| **N-02 (Book 7 clapping rhythm, optional art note)** | **Already handled** — the opener brief stages *"Three sets of hands together; Sivi's already apart and moving on"*, so the wrong moment is readable. No action needed |

## 6. Canon sweep over all 160 ART blocks

Scripted, then read. All clean:

- **Zinumi never speaks** — zero speech bubbles, word balloons or lettering anywhere.
- **Outfits are physically handled** — no fading, no materialising. Book 1 Spread 8 states the
  rule outright: *"they are physically dressing themselves, mid-motion, clothes half on — NOT a
  magical materialization."*
- **Four individual packs** — no shared or paired packs described.
- **Palette** — no off-palette power assignments; no child is ever given another's colour.
- **Provisional names** — "Rootlight" and "Pim" appear nowhere.
- **Places stay unnamed** — the park, the realms and the Pack Chamber are never given a proper name.
- **Unresolved mythology stays unresolved** — no ART block explains the Book 3 mark, the Book 9
  wall of symbols, or the Book 10 carved line. Book 10's closer is explicit: *"Nothing glows,
  nothing activates, Zinumi has no reaction."*

## 7. One real defect in the recovered brief

Its preamble says load-bearing briefs are *"marked **LOAD-BEARING** below."* **They are not.** The
marker appears nowhere in the 160 ART blocks — the five load-bearing beats exist only as a list in
the front section, which is the easiest kind of instruction for a busy illustrator to page past.

Not fixed in the recovered original, deliberately: it is now a read-only source of record and was
left byte-exact. **It is fixed in the per-book pagination files**, where each affected spread
carries an inline `LOAD-BEARING` flag and a restatement of the requirement on the page itself.

## 8. What is now delivered

`03-PAGINATION/` — **ten standalone pagination files, one per published title**, not one volume:

```
BOOK-01-THE-LANTERN-TREE-WENT-DARK.md
BOOK-02-THE-BABY-DRAGON-OF-CLOUDSTONE.md
BOOK-03-THE-FOREST-THAT-LOST-ITS-COLORS.md
BOOK-04-THE-MOON-FOX-WHO-LOST-HIS-WAY.md
BOOK-05-THE-VALLEY-OF-GIANT-FLOWERS.md
BOOK-06-THE-BRIDGE-THAT-FORGOT-HOW-TO-BUILD-ITSELF.md
BOOK-07-THE-FIREFLY-FESTIVAL-THAT-LOST-ITS-SPARK.md
BOOK-08-THE-CREATURE-WHO-DIDNT-WANT-TO-BE-SEEN.md
BOOK-09-THE-DOOR-BENEATH-THE-GLOWING-WATERFALL.md
BOOK-10-THE-CITY-BENEATH-THE-GIANT-LEAF.md
```

Each file carries the format spec, the canon rules restated in full, any load-bearing beats for
that book, then all 16 units in order with **TEXT** and **ART** copied verbatim from the recovered
brief. 160 units, 160 ART blocks, every unit accounted for.

Nothing was invented, condensed or paraphrased. **No manuscript prose was edited, and no
truncated line was guessed at** — the truncations are moot now that the source exists.

## 9. What still needs a human

1. **Confirm this is the current revision.** It is provably the source of the manuscript's cues
   and shares its compile date. It is not provable from this machine that no newer revision exists
   elsewhere.
2. **Save a durable copy off this machine.** The original lives in an evictable cache.
3. **The brief's own framing:** *"These briefs are a starting point, not a specification. They are
   expected to be challenged, modified, and improved by whoever does the pagination."* Treat the
   ten files as the working documents; the recovered brief stays read-only as the source of record.
4. Unchanged from the QA handoff: `factual_claims` and `qa_complete` are pending **by decision**
   (platform debt, not manuscript debt) and do not gate art or pagination.
