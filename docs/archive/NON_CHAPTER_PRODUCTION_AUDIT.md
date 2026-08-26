# Non-Chapter Production Audit

Scope: everything between "Chapter 1 works" and "the New England book package is complete." Chapter content rendering is not the focus of this audit.

## Remaining Items

| Area | Current state | Missing pieces | Effort | Blocker level |
|---|---|---|---|---|
| Chapter 1 pipeline | Working: pagination, layout, render, print-prep, proof review. | Continue visual QA only. | Low | Not blocking non-chapter work |
| Front matter | Partially built. Active planner creates half title, title, copyright, disclaimer, contents, introduction, blanks, deterministic print-ready rows. | Visual polish and operator metadata review. | Medium | Medium |
| Introduction | Working. Recovered from manuscript Introduction/Preface/Foreword. | Operator-authored override UI later. | Low | Not blocking |
| Back matter | Partially built. Author/series/resources are metadata-driven and omitted if data is absent. | Glossary/index had no active path; now added to front/back-matter planner. Author/series/resources still require metadata. | Medium | High |
| Glossary | Previously missing in active path. | Recover glossary from manuscript heading and typeset as deterministic back matter. | Low | Fixed in current branch |
| Index | Previously only existed in legacy HTML renderer, not active assembly path. | Deterministic index from body entry titles and first page numbers. | Medium | Fixed in current branch |
| Author page | Supported only when `publishing.authorBio.verbatim` or `publishing.authorBio.facts` exists. | Need operator metadata. Never invent. | Low | Medium |
| Series page | Supported only when `publishing.series.name` exists. | Need operator metadata. | Low | Low |
| Resources page | Supported only when `publishing.additionalResources` exists. | Need operator metadata. | Low | Low |
| Back-cover copy | Text asset supported only when `publishing.bookDescription.hooks` exists. | Need cover/back-cover composition system to consume it. | Medium | High |
| Cover wrap | Basic typographic cover exists. | Needs validation for front cover art, back cover copy, spine width, barcode zone, bleed/safety, and KDP-ready cover artifact. | Medium-high | High |
| Spine validation | Spine width is computed from page count. | Cover request previously rendered the whole legacy book just to measure count; now uses planned spine page count directly. Need visual proof pass. | Low-medium | Fixed code path; visual review pending |
| Assembly | Active whole-page assembly merges book-ready rows and hard-blocks missing pages. | It was dropping `section`/`spineOrder` before sorting; fixed so front/back matter order is respected. | Low | Fixed in current branch |
| Prompt families for non-chapter pages | Not complete. | Cover/front/back illustrated prompts are separate from deterministic text pages and need a deliberate cover-art workflow. | Medium-high | High for premium cover |

## Implementation Order

1. Audit active non-chapter page rows and proof artifacts.
2. Implement missing active-path back matter: glossary and index.
3. Fix assembly to respect `section` and `spineOrder`.
4. Make cover rendering use planned page count instead of re-rendering the whole legacy book.
5. Validate title/front matter/glossary/index/back matter as print-ready rows.
6. Validate cover wrap dimensions, spine width, back-cover copy, and barcode/safety zones.
7. Produce the first complete New England proof package.
8. Review proof defects and lock the production path.

## Current Branch Fixes

- `recoverFrontMatterSections` now recognizes `Glossary`.
- `planFrontMatter` now creates deterministic `GLOSSARY` back-matter pages when the manuscript has a glossary section.
- `planFrontMatter` now creates deterministic `INDEX` back-matter pages from body entry titles and first page numbers.
- `assembleBook` now passes `section` and `spineOrder` into the spine resolver.
- `renderCoverPdf` now sizes the cover from planned page rows instead of calling the legacy full-book renderer.
- `/api/projects/:id/render-cover?format=json` now reports page count and cover/spine dimensions.
