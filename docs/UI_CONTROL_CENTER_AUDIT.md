# Page Generation Control Center — UI Audit & Plan

Audit only. No implementation until reviewed. Goal: turn the long vertical scroll
into a per-page, tabbed Control Center that follows the operator's actual thought
process (text → layout → instructions → image → final page).

---

## 1. What sections currently exist (top to bottom, single scroll in App.js)

The interface is **one ~5,900-line vertical page**. Major sections, in render order:

1. Production dashboard (totals)
2. Current stage result banner
3. Project Intake + Activity Log
4. Chat with the Agent
5. Operator guidance (stage label + advice)
6. **1. Manuscript Breakdown**
7. **2. Page Plan Review** (+ per-page zone-preview cards)
8. **4. Image Review** ← contains the 7-tab Page Generation Inspector I built
9. **5. Book Parts + Export Assembly**
10. **3. Render Proof Review**
11. Standards Ledger + Knowledge System (intelligence)
12. **3. Manifest Output**
13. **1. Project Setup**
14. Operator Preview
15. Active Project
16. 16 Layout Templates (library)

Note: the numbered steps (1–5) are **not even in order on the page** (Manuscript=1,
Plan=2, then Image=4, Export=5, then Proof=3). That alone makes the pipeline hard to
follow.

## 2. What information is shown
- Per-page (inside Image Review → Inspector, 7 tabs): manuscript body, subject, word
  count, layout + reasoning, zones + blueprint, capacity/fit, image plan, exact prompt
  (copyable), image versions, final-page PDF.
- Elsewhere (scattered): plan table, zone-preview cards, text-fit summary, layout
  approval gate, version list, proof thumbnails, layout library, config editor.

## 3. What information is hidden / hard to find
- **Exact prompt, blueprint, zones** live only inside the Inspector, which is buried in
  section 8 of a 16-section scroll — the operator must scroll past setup, breakdown,
  plan, chat, dashboards to reach it.
- **Style DNA** is only visible inside the config editor (separate) — not shown at the
  point of image generation.
- **Overflow / text-fit** is split across three places: the zone-preview card (§7), the
  text-fit summary panel, and the Inspector Typography tab.

## 4. What information is duplicated
- **Layout + reasoning:** shown in the Plan Review table (§7) AND the Inspector Layout tab.
- **Zones:** the zone-preview card (§7) AND the Inspector Layout zone map.
- **Manuscript body:** Manuscript Breakdown (§6) / Manifest Output (§12) AND Inspector
  Manuscript tab.
- **Image versions/status:** Image Review version list AND Inspector Image Result tab.
- **Selected-page summary** repeats layout/status that the Inspector header also shows.

## 5. What information is missing (per your operator workflow)
- A **single prominent per-page Control Center** — it exists (Inspector) but is buried,
  not the primary surface.
- **Style DNA** at the generation step (Image Generation tab).
- **Supporting subjects** as an explicit field (now in the lean prompt, not surfaced as
  its own UI element).
- **Blueprint legend** (RED/BLUE/ORANGE meaning) shown next to the blueprint.

## 6. What should be grouped together
Your 5-tab grouping is correct and consolidates my current 7 tabs:
- Typography (capacity/overflow) → folds into **MANUSCRIPT**.
- Image Plan + Prompt → merge into **IMAGE GENERATION**.

---

## Gap analysis (my current 7-tab Inspector → your 5-tab Control Center)

| Your tab | Source today | Action |
|---|---|---|
| **MANUSCRIPT** (text, allocation, overflow) | Inspector Manuscript + Typography tabs | **Merge** the two |
| **LAYOUT** (layout, reasoning, blueprint, zones) | Inspector Layout tab | Keep; add RED/BLUE/ORANGE legend |
| **IMAGE GENERATION** (hero + supporting subjects, Style DNA, blueprint instr, exact prompt, copy) | Inspector Image Plan + Prompt tabs | **Merge**; **add Style DNA** + explicit supporting subjects |
| **IMAGE RESULT** (image, versions, model/status, active) | Inspector Image Result tab | Keep as-is |
| **FINAL PAGE** (rendered page, PDF, export) | Inspector Final Page tab | Keep as-is |

**Good news:** the read-only `inspector` endpoint already returns every field these 5
tabs need (manuscript, layout+zones, capacity/fit, subject, model, images, blueprint,
render). The work is **frontend reorganization**, not new backend.

---

## Proposed tab structure (the Control Center)

```
PAGE GENERATION CONTROL CENTER   [page picker]   [chapter-approval chip]

  MANUSCRIPT | LAYOUT | IMAGE GENERATION | IMAGE RESULT | FINAL PAGE

MANUSCRIPT        → page text · word count · text allocation · overflow/continuation
LAYOUT            → selected layout · reasoning ("why") · blueprint preview (RED/BLUE/
                    ORANGE legend) · text-safe / image / title zones · capacity
IMAGE GENERATION  → hero subject · supporting subjects · Style DNA · blueprint
                    instructions · EXACT final prompt · [Copy prompt]
IMAGE RESULT      → generated image · versions · model · status · active
FINAL PAGE        → final rendered page (PDF preview, large) · export view
```

Rules honored: every stage that changes the final page is a tab; every AI prompt is
visible (Image Generation); the agent/blueprint instructions are visible; nothing
requires guessing.

---

## Build plan (after you approve)

**Phase 1 — Consolidate to 5 tabs**
- Merge Inspector's Typography → MANUSCRIPT and Image Plan + Prompt → IMAGE GENERATION.
- Add **Style DNA** + **supporting subjects** to IMAGE GENERATION (both already in the
  inspector payload / derivable).
- Add the RED/BLUE/ORANGE legend beside the blueprint.

**Phase 2 — Elevate & de-duplicate**
- Make the Control Center the **primary per-page surface** (top of the page workspace,
  or its own prominent panel), not buried inside "4. Image Review."
- Remove the now-duplicated scatter: fold the Plan Review table's per-page detail, the
  zone-preview card, and the version list into the Control Center (keep one source).

**Phase 3 — Tame the surrounding scroll (optional, later)**
- Group the remaining global sections (setup, library, intelligence, dashboards) behind
  their own top-level tabs/accordions so the page isn't a 16-section wall.

**No backend work** for Phases 1–2 (the inspector endpoint already supplies the data).
Frontend-only; no image spend.

---

## Deliverable status
1. UI audit ✅ (above)
2. Gap analysis ✅ (above)
3. Proposed tab structure ✅ (above)
4. Build plan ✅ (above)

Awaiting review before implementation.
