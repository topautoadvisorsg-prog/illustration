# Spike Fixtures

Synthetic test data for Phase 0 spikes. Used when real manuscript chapters are
not yet available, or when a controlled, repeatable input is needed.

These files are **disposable** — they will be replaced by real manuscript-derived
fixtures as soon as stakeholder-provided chapters arrive.

## Current Fixtures

| File | Purpose | Source |
|---|---|---|
| `chanterelle.md` | One-entry "manuscript" excerpt | Hand-authored — mirrors expected real manuscript schema |
| `chanterelle.manifest.json` | The page manifest the real Stage 1.5 *would* emit for this entry | Hand-authored from the spec's example |

## Manuscript Schema Assumed

The synthetic Chanterelle entry is written in the structure I believe the real manuscript
will follow, based on the v2.8 blueprint's `page_plan_json_structure` example:

```markdown
## CHANTERELLE *Cantharellus spp.* | EDIBLE

> Intro paragraph (italic in book).

### WHAT IT IS
Body paragraph.

### HOW TO IDENTIFY
- Cap: ...
- Stem: ...
- Gills: ...

### WHERE & WHEN
Body paragraph.

### LOOK-ALIKE WARNING — Jack-o-lantern (*Omphalotus illudens*)
Body paragraph.

### EAT?
Body paragraph.
```

If the real chapters use a different convention, the parser (Stage 1 + 1.5) will be
adjusted and these fixtures regenerated.
