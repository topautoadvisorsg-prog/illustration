# SPEC — Subject + Badge Metadata v1  (Standard → v1.1)

**Status:** draft — awaiting operator sign-off. No code until approved.
**Bumps:** Wild Lands Publishing Standard v1.0 → **v1.1** (badge taxonomy).
**Touches:** manifest schema (shared) · a deterministic extractor · a cleanup
pass · the whole-page prompt · print-prep (badge stamping, lands in move #2) ·
front matter (a SOURCES page). Additive. Legacy untouched.

---

## 0. Core rule (the whole point)

> **The image subject stays clean. Warnings, hazards, source confidence, and
> region markers live in badge metadata — never in the subject text.**

```
WRONG   "Destroying Angel ☠️ DEADLY (Amanita bisporigera)"

RIGHT   {
          "cleanSubject": "Destroying Angel mushroom (Amanita bisporigera)",
          "hazard":  "DEADLY",
          "region":  "FOREST",
          "source":  "SCIENTIFIC_LITERATURE"
        }
```

The model draws the organism. The renderer stamps the badges. They never mix.

---

## 1. Why this is cheap (the key discovery)

Every PAGE body already begins with a structured header the manuscript author
wrote. Verified across all 8 chapters:

```
*Ursus americanus* | ⚠️ ⚠️
*Cicuta maculata* | ☠️
*Morchella* spp. | ⚠️
   **EDIBLE** *(spring only — false morel look-alike critical)* `[EXPERT REVIEW REQUIRED]`
```

So the **clean binomial AND the hazard/edibility markers are already present, in
structured form, in every body.** The breakdown extractor simply didn't parse
this line — it grabbed the decorated title or fell back to habitat nouns. The
fix is a **deterministic parser, zero AI cost, no re-running breakdown, no data
loss.**

---

## 2. Manifest schema additions (shared `PageManifestSchema`)

Additive, all optional so every existing row stays valid:

```ts
cleanSubject:    string;     // illustration subject ONLY — no warnings, no tags
hazard:          HazardBadge;          // default 'NONE'
region:          RegionBadge;          // default 'GENERAL'
sourceConfidence: SourceBadge;         // default 'GENERAL_REFERENCE'
badgeSet:        Badge[];    // resolved ordered list the renderer stamps
```

- `imageSubject` (legacy) is **left untouched** — the legacy pipeline keeps
  reading it. The whole-page pipeline switches to `cleanSubject`.
- `badgeSet` is derived from region + hazard + source but stored explicitly so
  print-prep stamps a fixed, ordered set without re-deriving.

---

## 3. Badge taxonomy (Standard v1.1 — LOCKED on approval)

### 3.1 Region badges (8)
`FOREST · MOUNTAIN · RIVER · WETLAND · COASTAL · ALPINE · FIELD · GENERAL`
(FOREST + MOUNTAIN already locked in v1.0; this promotes the rest.)

### 3.2 Hazard / usage badges (9)
`DEADLY · TOXIC · VENOMOUS · AGGRESSIVE · CAUTION · EDIBLE · MEDICINAL ·
EXPERT_REVIEW · NONE`

> Note: this family is really a **usage classification** — it carries both
> dangers (DEADLY/TOXIC/VENOMOUS/AGGRESSIVE/CAUTION) and benefits
> (EDIBLE/MEDICINAL). `NONE` = no special classification (no badge stamped).

### 3.3 Source / confidence badges (6)
`SCIENTIFIC_LITERATURE · FIELD_GUIDE · TRADITIONAL_USE · HISTORICAL_SOURCE ·
EXPERT_REVIEW_REQUIRED · GENERAL_REFERENCE`

> `EXPERT_REVIEW` (hazard: "get this identified before you eat it") and
> `EXPERT_REVIEW_REQUIRED` (source: "this claim needs expert verification") are
> intentionally distinct. Flagged so they don't get merged later.

---

## 4. Deterministic extractor

Pure function `extractBadgeMetadata(manifest)` → `{ cleanSubject, hazard,
region, sourceConfidence, badgeSet }`. No AI, no network.

### 4.1 cleanSubject
1. Read the **common name** from `entryTitle`, stripped of: leading `N.`
   numbering, emoji (⚠️ ☠️ etc.), and editorial tags (DEADLY, TOXIC, PRIORITY
   ENTRY, BURNS, PHOTOTOXIC, CONTACT IRRITANT, HALLUCINOGENIC, Hazard N —).
2. Read the **binomial** from the body's first line: `*Genus species*` or
   `*Genus* spp.`
3. Compose: `"{CommonName} ({Binomial})"`. If no binomial, use the cleaned
   common name alone. If the entry is a concept/process page (no organism),
   `cleanSubject` falls back to the page's habitat/terrain descriptor (this is
   where habitat nouns ARE correct — for scenery pages, not species pages).

### 4.2 hazard  (from title tags + body header markers)
| Marker found | hazard |
|---|---|
| ☠️ / "DEADLY" | DEADLY |
| "TOXIC" / "POISONOUS" | TOXIC |
| venomous-snake/spider context (rattlesnake, copperhead) | VENOMOUS |
| large-mammal-aggression context (moose, bear, charging) | AGGRESSIVE |
| ⚠️ / "BURNS" / "PHOTOTOXIC" / "IRRITANT" / "CAUTION" | CAUTION |
| "EDIBLE" | EDIBLE |
| "MEDICINAL" | MEDICINAL |
| "EXPERT REVIEW REQUIRED" / "look-alike critical" | EXPERT_REVIEW |
| none | NONE |

When multiple apply, take the most severe (DEADLY > VENOMOUS > TOXIC >
AGGRESSIVE > CAUTION > EXPERT_REVIEW > EDIBLE > MEDICINAL > NONE). A page may
also carry a secondary usage badge (e.g. EDIBLE + EXPERT_REVIEW); `badgeSet`
allows up to two from this family when they aren't contradictory.

### 4.3 region  (habitat inference — the fallback that was wrong for subject is RIGHT here)
Map `contentType` + body habitat nouns → region: boreal/hardwood/spruce →
FOREST; ridgeline/summit/granite → MOUNTAIN; river/stream/crossing → RIVER;
marsh/bog/wetland → WETLAND; coast/shore/tidal → COASTAL; above-treeline/alpine
tundra → ALPINE; meadow/open field → FIELD; otherwise GENERAL.

### 4.4 sourceConfidence
- `[EXPERT REVIEW REQUIRED]` marker → `EXPERT_REVIEW_REQUIRED`
- medicinal/folk-use content → `TRADITIONAL_USE`
- default → `GENERAL_REFERENCE` (the book-level sourcing; the front-matter
  SOURCES page carries the full citation list)
- Operator can override per page.

### 4.5 badgeSet
Ordered for stamping: `[region, hazard(if ≠ NONE), source]`. Stable order so the
same badge always lands in the same corner.

---

## 5. Cleanup pass (fix the flagged ~25, no AI cost)

Run `extractBadgeMetadata` over all 129 manifests, write the new fields. Then a
verification report asserts the known offenders resolved:

| Page | Was | Must become |
|---|---|---|
| CH01_P008 Moose | "boulder field" | cleanSubject "Moose (Alces alces)", hazard AGGRESSIVE, region FOREST |
| CH02_P023 Yellow Jacket | "mountain range and open meadow" | "Yellow Jacket (Vespula spp.)", hazard VENOMOUS/CAUTION |
| CH05_P008 Morel | "flowing river and boreal forest" | "Morel (Morchella spp.)", hazard EDIBLE + EXPERT_REVIEW |
| CH05_P009 Honey Mushroom | "mountain range and open meadow" | "Honey Mushroom (Armillaria spp.)", EDIBLE + CAUTION |
| CH05_P016 False Morel | "northern hardwood forest" | "False Morel (Gyromitra spp.)", hazard TOXIC |
| CH05_P012 Destroying Angel | "...☠️ DEADLY..." in subject | "Destroying Angel mushroom (Amanita bisporigera)", hazard DEADLY |
| (all Tier B, 15 pages) | tags in subject | tags moved to hazard field |

Idempotent: re-running overwrites the derived fields, never the body or legacy
`imageSubject`.

---

## 6. Standard v1.1 — badge visual style (PROPOSED, confirm in §11)

### 6.1 Style per family
- **Region** — circular ring + icon + small-caps label (the v1.0 style, kept).
- **Hazard** — a distinct shape (shield/diamond) so it never reads as a region
  badge. Icon-forward.
- **Source** — a small wax-seal / stamp, monochrome sepia, subtle.

### 6.2 Proposed colors (warm-ink palette, no neon)
| Badge | Ring/fill |
|---|---|
| FOREST | `#3F5A43` (locked) |
| MOUNTAIN | `#A47A3C` (locked) |
| RIVER | `#3E5C6E` slate-blue |
| WETLAND | `#5C6B43` reed |
| COASTAL | `#6E7A78` sea-grey |
| ALPINE | `#8A8472` pale stone |
| FIELD | `#9A7B3C` meadow gold |
| GENERAL | `#6B5A40` neutral sepia |
| DEADLY | `#3A2018` oxblood-black + skull |
| TOXIC | `#8A5A1E` warning amber |
| VENOMOUS | `#5A2A1E` oxblood |
| AGGRESSIVE | `#7A3E1E` burnt orange |
| CAUTION | `#A47A3C` ochre |
| EDIBLE | `#3F5A43` green + check |
| MEDICINAL | `#5C6B43` sage + cross |
| EXPERT_REVIEW | `#4A4A40` slate |
| (source badges) | monochrome `#543C24` ink seal |

All within the Standard's warm sepia world — no screen-bright reds.

### 6.3 Placement (LOCKED layout)
- **Region** → bottom-left corner.
- **Hazard** → bottom-right corner.
- **Source** → bottom-right, just inside the hazard (or beneath it).
- A reserved **badge safe-zone**: ~0.9in square in each bottom corner, inside
  the trim safe area, that the image model must keep visually quiet.

---

## 7. Prompt changes (whole-page render)

1. Image model receives **`cleanSubject`** as the subject — never the decorated
   title.
2. Hazard / region / source are passed as **context only** ("this page concerns
   a DEADLY forest mushroom") so the art can match the mood — but:
3. Hard constraint, explicit: **"Do NOT draw any badges, labels, warning
   symbols, icons, page numbers, or text. Keep both bottom corners visually
   quiet — reserved for stamped badges."**

This extends the Standard's existing "no model-drawn folios" rule to badges.

---

## 8. Print-prep changes (badge + folio stamping — lands in move #2)

Print-prep (the deterministic renderer) gains a stamping step:
- Read `badgeSet` + `page_label` (folio) from the page row.
- Composite the badge assets + folio onto the generated image at the LOCKED
  positions, identical every page.
- Badge assets are pre-rendered SVG/PNG (one per badge value), so they are
  pixel-identical book-wide — searchable, reusable, machine-readable.

v1 of THIS spec delivers the metadata + extractor + Standard v1.1 + the prompt
change. The actual stamping is implemented in move #2 (print-prep), which now
has a defined badge contract to build against.

---

## 9. Front matter — SOURCES / DISCLAIMER page

Add a front-matter page type `SOURCES` (extends the Front Matter SPEC):
- Lists where the information came from (the book-level citations).
- States plainly: **"Information is sourced from referenced literature and
  field guides, not personally field-tested. Hazard and source badges are
  quick-reference indicators, not medical, legal, or survival guarantees.
  Verify before relying on any entry."**
- The per-page `source` badge references back to this page; the per-page
  `hazard` badge references the badge legend printed here.

So the front matter gains a badge legend + sources + disclaimer — one page that
makes every per-page badge meaningful and legally careful.

---

## 10. Tests

- Editorial tags (☠️/⚠️/DEADLY/TOXIC/PRIORITY ENTRY/…) are **absent** from every
  `cleanSubject`.
- Hazard markers are **preserved** in the `hazard` field (nothing lost).
- The 5 wrong-subject pages (Moose, Yellow Jacket, Morel, Honey, False Morel)
  resolve to the correct organism + binomial.
- Source badges assigned (default GENERAL_REFERENCE; EXPERT_REVIEW_REQUIRED when
  marker present).
- `badgeSet` ordering is stable (region, hazard, source).
- Region inference covers all 8 values without crashing on concept pages.
- No warning text leaks into any subject across all 129 pages (full-corpus
  assertion).
- Extractor is pure + deterministic (same input → same output, no network).

---

## 11. Open questions for operator (answer before I code)

1. **EXPERT_REVIEW vs EXPERT_REVIEW_REQUIRED** — keep both (hazard vs source) as
   distinct, or collapse to one? (I recommend keep — they mean different things.)

2. **Two usage badges allowed?** A morel is both `EDIBLE` and `EXPERT_REVIEW`
   (deadly look-alike). OK to stamp two hazard-family badges when non-
   contradictory, or force exactly one (most severe)?

3. **Badge colors/icons (§6)** — use my proposed warm-ink palette as the v1.1
   lock, or do you want to tune specific colors/icons first?

4. **Region default** — concept/process pages with no clear habitat: default to
   `GENERAL`, or omit the region badge entirely on those pages?

5. **Source per page** — most pages default to `GENERAL_REFERENCE`. Do you want
   me to infer `TRADITIONAL_USE` for medicinal/folk entries automatically, or
   leave everything `GENERAL_REFERENCE` until you set sources explicitly?
```
