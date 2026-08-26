# Entry-Centric Content Architecture + One-Hero-Illustration-Per-Entry — SPEC

**Status:** Proposed (design only). Awaiting operator approval. **Post-proof + spend-gated.**
**Touches frozen render architecture and requires image spend → NOT to be implemented
until the printed proof is back AND the operator explicitly authorizes a hero-render batch.**

---

## 0. Platform principle — this is for ANY ebook, not one book

This is **platform architecture**, not a Wildlands feature. It must work for any book,
brand, series, or genre: a field guide (subjects = species), a cookbook (entries =
recipes), a travel guide (entries = destinations), a biography (entries = chapters/people),
a textbook (entries = concepts). NOTHING book-, brand-, or series-specific is hardcoded —
entry **types**, hero **styles**, the **count**, and the metadata fields are all *data*
configured per book (the platform already follows this for publishing metadata). Every
figure and example below for "The Wildlands: New England" is an **example instance**, not
the design. The reusable rule is generic: **one hero illustration per entry**, where an
"entry" is whatever the book's unit of subject is.

## 1. Vision

Today artwork is tied to a **page**. Shift the long-term model so content is tied to an
**entry** — a reusable, format-agnostic content asset. Each entry owns one **hero
illustration** (clean art, no baked text) plus its title, scientific name, canonical body,
alt text, and metadata. Every output format is then a *projection* of the same entries:

```
MANUSCRIPT
   └── ENTRY  { title · scientificName · bodyText · heroIllustration · altText · metadata }
          ├──► Print export      (designed page layouts — UNCHANGED, frozen)
          ├──► Kindle export      (reflowable EPUB; one hero at entry start)
          ├──► Website
          ├──► Flashcards
          └──► Future products (app, educational kits)
```

**One hero illustration per entry** (operator rule): when an entry spans multiple Kindle
screens (font-size dependent), the illustration appears ONCE at the entry start; the rest
is clean reflowable text. Example:

```
BLACK BEAR
[Hero illustration]
Ursus americanus
Body text…
```

### Why
- **Lower image count:** ~120 hero illustrations for New England vs 275 page renders (see §3).
- **Better reading:** readers expect art when a subject begins, not repeated per screen.
- **Cleaner accessibility:** one meaningful alt text per entry; body stays selectable/resizable.
- **Reuse:** the same "Black Bear" hero serves Kindle, web, marketing, flashcards, future apps.

---

## 2. Current state (verified against the code/DB)

What already exists — the gap is smaller than it looks:
- **Entries already exist as a grouping.** `pages.entryKey` groups an opener + its
  continuations; `manifests` (kind=PAGE) carry `entryTitle` and the **canonical
  `bodyMarkdown`** (full entry body, pre-pagination — `generate-manifests.ts`). The Kindle
  exporter already regroups pages → entries on `entryKey`.
- **Scientific name + metadata** are derivable today: `extractBinomial`, plus
  region/hazard/source on the manifest (Standard v1.1).
- **An artwork-only render mode already exists.** `assemble-page-prompt.ts`
  `rendersCriticalText=false` branch renders "the artwork layer … Do not render readable
  text." A clean hero generator reuses this seam (text OFF) — low novelty.
- **A dormant clean-art generator** (`stage-3-generation/generate-image.ts`) also exists.

What does NOT exist:
- **Zero clean illustration-only assets** (legacy `images` table empty for the live
  project). Every image is a baked full-page render with text fused into pixels — unusable
  as a hero (cropping would drag in text fragments and inconsistent layouts).
  **→ Hero illustrations must be generated fresh = image spend.**
- **No first-class `entry` record or entry→asset link.** Entries are an emergent grouping,
  not a stored, queryable asset with a stable id and a hero pointer.

---

## 3. Hero count = number of entries (worked example: New England)

**The hero count equals the number of distinct entries (subjects) in the book — NOT the
page count.** One subject = one entry = one hero, however many pages/screens its text
spans. So the figure is data-driven per book: a 60-subject book → ~60 heroes; a 300-subject
book → ~300.

*Example instance — New England:* ~127 content entries across chapters 1–8 (ch1 zones 11,
ch2 animals 24, ch3 plants 26, ch4 trees 13, ch5 fungi 16, ch6 terrain 18, ch7 survival ~8,
ch8 bushcraft ~11); minus 8 chapter openers → **~119 entries get a hero**, vs 275 page
renders — well under half. (Different brands will report a completely different number.)

---

## 4. Target data model (additive — does not disturb print)

Introduce the entry as a first-class, format-agnostic asset. Two additive tables (or a
materialized view + one table); nothing existing is migrated destructively.

```
entries
  id              uuid pk
  project_id      uuid
  entry_key       text          -- stable, = existing pages.entryKey
  chapter_number  int
  title           text          -- from manifest entryTitle
  subtitle        text null     -- generic secondary line (e.g. scientific name in a field
                                --   guide, cuisine in a cookbook); data, not a fixed field
  body_markdown   text          -- canonical pre-pagination body (manifest bodyMarkdown)
  entry_type      text          -- DATA-DRIVEN per book/brand, NOT a hardcoded enum. Field
                                --   guide: SPECIES|PLANT|FUNGI|TREE|ZONE; cookbook: RECIPE;
                                --   travel: DESTINATION; etc. Drives hero-style selection (§5).
  attributes      jsonb         -- generic per-book metadata bag (e.g. region/hazard/source
                                --   for a guide; cuisine/difficulty for a cookbook). Avoids
                                --   guide-specific columns leaking into the platform schema.
  hero_asset_id   uuid null  →  entry_assets.id
  ...timestamps

entry_assets            -- reusable media tied to an ENTRY, not a page
  id              uuid pk
  entry_id        uuid → entries.id
  kind            text          -- HERO_ILLUSTRATION (v1); future: THUMBNAIL, DIAGRAM
  image_path      text          -- clean art, NO baked text (R2/storage key)
  width_px        int
  height_px       int
  alt_text        text          -- entry title (+ scientific name)
  prompt          text          -- generation audit trail
  prompt_sha256   text
  model           text
  status          text          -- QUEUED | RENDERED | APPROVED | REJECTED
  active          boolean        -- the ONE hero used by exports
  ...timestamps
```

- `entries` can be **derived/backfilled** from existing `pages` + `manifests` with zero
  new content (read-only synthesis). This is safe to build under the freeze.
- `entry_assets` is where the (post-proof, spend-gated) hero illustrations land.
- **Print is unaffected:** the print pipeline keeps reading `pages` + `whole_page_renders`.
  Entries are an additive projection layer alongside it, not a replacement.

---

## 5. Hero illustration generation (spend-gated, render-once)

- Reuse the **artwork-only** render path (text OFF) with the entry's subject and the book's
  configured Master Style — produces clean, textless, full-bleed-capable illustration art.
- **Hero style is config, not code:** a per-book/brand map of `entry_type → hero style`
  (e.g. guide ZONE → landscape, SPECIES → subject portrait; cookbook RECIPE → plated dish).
  The platform reads this map; it hardcodes no genre's taxonomy.
- **RENDER ONCE** per entry ([[wildlands_render_once_rule]]): generate one hero, operator
  reviews the actual image, approves or asks for a redo. NO bulk/auto-retry. A hard batch
  cap as in `_batch.ts`.
- Aspect: a portrait/landscape hero sized for reuse (e.g. ~1600px long edge for Kindle/web;
  keep the source at full render res in storage for print/marketing reuse).
- Store in `entry_assets` with full prompt audit trail; one `active` hero per entry.
- **Cost:** ~120 single-image renders, one-time. Reusable across every format forever.

---

## 6. Format exporters as projections

- **Print (FROZEN, unchanged):** keeps the current designed page layouts. NOT migrated as
  part of this. Long-term it *could* read heroes from entries, but not now.
- **Kindle (extend the v1 exporter):** when an entry has an `active` hero, emit
  `<img src=… alt="<entry title> (<scientific name>)"/>` once at the entry start, then the
  body. When absent → text-only (today's behavior). This is the only change to shipping
  Kindle code and is purely additive (the v1 exporter already left this hook).
- **Website / Flashcards / Future:** read `entries` + `entry_assets` directly. Out of scope
  to build here; the data model makes them straightforward later.

---

## 6.5 Frontend / UI integration — one manuscript, many editions

The operator console today is print-oriented (8 steps: Setup → … → Render & Review →
Build Book; `edition` + `trim` live in Step 3). The model is already **one project, many
editions** — the project config carries `editions` (PREMIUM + KINDLE_EPUB today; add
PAPERBACK). Mirror what KDP itself does after a print upload ("also make a Kindle / a
paperback?"). The integration is **additive** — it does not rebuild or replace the print
steps.

**New step — "Build & Export · Editions"** (extends/follows Step 8). One card per edition,
all driven from the same approved source content:

- **Hardcover 7×10** — built ✓ (interior PDF + hardcover wrap). *(today)*
- **Paperback 7×10** — toggle: same interior, paperback cover (`build-local2` already emits
  it). One click, **no spend** — freeze-safe. *(near-term)*
- **Kindle EPUB** — opens the Kindle panel below.

**Kindle panel:**
- **Build report** (from `GET …/export/kindle-epub/preview`): chapters, entries, words,
  cover status — so the operator sees what's included before exporting.
- **A switch: "Text-only" ⇄ "With hero illustrations."** Text-only is shipping v1 today
  (real reflowable text + cover, no spend). "With heroes" reveals the hero review:
- **Hero illustration review grid** (one card per entry): each card shows that entry's
  hero — a **full, textless illustration** (different prompt path from print: the
  artwork-only render seam, no baked typography). Per card: **Render** (render-once) ·
  **Approve** · **Redo**. The operator *sees the actual rendered image and decides* — never
  bulk/auto. **Post-proof + per-batch spend approval.**
- **Export Kindle EPUB** button → `POST …/export/kindle-epub` → downloads the `.epub`
  (embeds approved heroes when the switch is on; text-only otherwise).

**Why the Kindle prompts differ:** print bakes typography into the page; Kindle heroes are
the *illustration only* (no text), so the body can stay real selectable reflowable text.
The UI labels this clearly so the operator knows Kindle art = clean full illustrations.

**Freeze/scope:** the **paperback toggle and the text-only Kindle export + report** are
freeze-safe and buildable now (no spend, no render/print changes). The **hero review grid +
generation** is post-proof and spend-gated (it creates new art). The console's existing
print steps are untouched.

## 7. Accessibility / alt-text rules (carried from Kindle v1)

- Hero illustration: `alt` = entry `title` + optional `subtitle` (≤140 chars). Generic
  across genres — field guide: `alt="Black Bear (Ursus americanus)"` or
  `alt="The Northern Boreal Zone"`; cookbook: `alt="Beef Bourguignon"`.
- Body stays real selectable text. No decorative art in the reflow (only the hero).

---

## 8. Phasing

| Phase | Work | Freeze/spend |
|---|---|---|
| A | `entries` table + read-only backfill from pages/manifests; entry-type classifier; `GET /entries` | **Freeze-safe, no spend** — can build now if desired |
| B | `entry_assets` schema + hero generator (artwork-only seam) + review/approve route, render-once | **Post-proof + per-batch spend approval** |
| C | Generate ~120 heroes (operator-reviewed, render-once) | **Image spend** |
| D | Kindle exporter: embed active hero per entry (+ alt) | Additive; after C |
| E | Website / flashcards projections | Later, separate |

**Estimate (engineering, excl. render wall-clock + review):** Phase A ~1–1.5 days;
Phase B ~1.5–2 days; Phase D ~0.5 day. Phase C is operator-paced review of ~120 renders.

---

## 9. Hard constraints

- **Print pipeline untouched** (frozen): no print-page, cover, or render changes.
- **No hero spend** until the printed proof is back and the operator authorizes a batch.
- **Render-once** for every hero; operator approves each.
- Additive only — existing `pages`/`whole_page_renders`/manifests are not migrated away.

---

## 10. Open decisions for operator

1. **Entry-type → hero-style config (per book/brand, data-driven):** for the Wildlands
   field-guide instance, confirm zones → landscape, species/plant/fungi/tree → subject, and
   how survival/bushcraft "topic" entries are illustrated (subject vs scene). This map is
   config the platform reads — other genres define their own.
2. **Hero aspect ratio / count cap** per the ~120 figure (vs your 70–100 estimate — actual
   is ~120 for New England).
3. **Build Phase A now (freeze-safe, no spend)** to lay the entry data model while the proof
   is out, or hold everything until after proof?
4. Reuse the dormant `generate-image.ts` clean-art path, or the whole-page artwork-only seam?
   (Recommend the artwork-only seam — same Master Style, already wired.)
5. **UI rollout (§6.5):** build the freeze-safe edition UI now — a Paperback toggle + a
   Kindle "Export EPUB" button and build-report panel (no spend) — or hold the whole
   editions step until the hero-review grid (post-proof) can ship with it as one piece?
