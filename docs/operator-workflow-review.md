# Operator Workflow Review

Date: 2026-06-02

## Product Model

The platform should feel like an AI publishing agent doing the production work while the human operator reviews, approves, rejects, edits, or requests changes.

Operator-visible workflow:

1. Upload manuscript.
2. Confirm upload.
3. Agent breaks manuscript into chapters/pages.
4. Operator reviews the chapter/page breakdown.
5. Agent creates the page plan and selects layouts.
6. Operator reviews page plan, layout choices, and text-fit risk.
7. Agent generates image prompts.
8. Operator reviews prompts in an advanced/prompt details panel when needed.
9. Operator triggers paid image generation intentionally.
10. Operator reviews, approves, rejects, or regenerates images.
11. Operator triggers upscale when an image is approved.
12. Operator opens a large page/chapter/book PDF preview.
13. Operator exports/saves final output.

## What Works Now

- Backend health and render checks are deployed and working.
- Manuscript upload accepts Markdown/plain text and stores a parsed outline summary.
- Deterministic manuscript parsing already finds chapters, entries, word counts, and warnings before any LLM call.
- Claude-backed manifest generation creates book/chapter/page manifests and page rows.
- Page planning chooses layouts, creates image-only prompts, tracks blockers/warnings, capacity, typography, and prompt hashes.
- Text-fit preview exists as a backend route.
- Image generation, review, approval, rejection, regeneration, and upscale routes exist.
- Chapter PDF render and full book PDF render routes exist.
- Chromium/Paged.js render is available through the backend Docker deployment.
- Publishing Intelligence Center exists as a first-class visible system.

## What Is Broken Or Disconnected

- The UI does not clearly expose the backend's full workflow in review order.
- The manuscript breakdown exists in manifest content, but the UI does not show a readable chapter-to-page tree.
- The page plan view shows internal text-zone details by default, making it feel technical instead of operator-friendly.
- Text-fit preview exists in the backend but is not exposed as a primary operator action.
- Image generation/review/upscale backend routes exist but are not exposed in the normal UI.
- Chapter/book render backend routes exist but are not exposed as large preview controls.
- Agent contracts exist in the backend, but there is no clear agent roster or operator-facing "what this agent does" view.
- The command panel is useful, but it currently behaves like a command shortcut box rather than a clear AI publishing agent workspace.
- The layout prompt library is too prominent for normal operation and should be treated as Advanced configuration.

## Missing UI Controls

- Start Breakdown / Generate Manifests.
- Review Breakdown.
- Generate Page Plan.
- Run Text-Fit Preview.
- Review Page Plan.
- Generate Image for selected page.
- Load page images.
- Approve image.
- Reject image with note.
- Regenerate image with operator instruction.
- Upscale approved image.
- Render chapter preview.
- Render full book preview.
- Download rendered PDF.
- Toggle Advanced details for raw prompts, layout percentages, internal prompt metadata, paths, hashes, and model notes.

## Backend Functions Not Exposed In UI

- `POST /api/projects/:id/text-fit-preview`
- `POST /api/pages/:pageId/generate-image`
- `GET /api/pages/:pageId/images`
- `POST /api/pages/:pageId/images/:version/approve`
- `POST /api/pages/:pageId/images/:version/reject`
- `POST /api/pages/:pageId/images/:version/set-active`
- `POST /api/pages/:pageId/regenerate`
- `POST /api/pages/:pageId/upscale`
- `POST /api/projects/:id/chapters/:chapterNumber/render`
- `POST /api/projects/:id/render-book`

## Hide Or Move To Advanced

Normal operator view should not show raw prompt engineering unless requested.

Move these behind Advanced:

- Raw prompt text.
- Prompt hashes.
- Layout percentages and internal layout instruction prose.
- Image slot rules.
- Placeholder lists.
- File paths.
- Schema-like identifiers.
- Technical model notes.
- Capacity internals beyond simple fit status.

Normal view should show:

- Chapter/page title.
- Page purpose.
- Selected layout name.
- Word count.
- Fit/readiness status.
- Image status.
- Approval status.
- Preview button.
- Regenerate/edit/request-change controls.

## Over-Engineered Or Premature

- The full layout prompt library is necessary for setup, but it dominates the UI too early.
- Publishing Intelligence is valuable, but the main pipeline workflow should appear before knowledge capture during day-to-day operation.
- Internal prompt metadata belongs to reviewers/developers, not the default operator path.
- EPUB work is not exposed yet; do not fake it in the UI until a backend endpoint exists.

## Recommended Build Order

1. Make the operator workflow visible in order: upload, breakdown, plan, text-fit, prompts, images, preview, export.
2. Add chapter breakdown review from existing manifest content.
3. Add page plan review with normal and Advanced modes.
4. Add text-fit preview button and summary.
5. Add per-page image actions: generate, load images, approve, reject/regenerate, upscale.
6. Add large PDF preview for chapter and full book render.
7. Add agent roster/command context so the operator understands which agent is doing which job.
8. Move the layout prompt library and raw technical data behind Advanced.
9. Keep EPUB export marked as "backend not exposed yet" until an endpoint exists.
10. Update README/testing notes and verify build/tests.

## Immediate Implementation Scope

Implement the shortest clean path to operator usability:

- Add an Advanced toggle.
- Add an agent/status panel with stage actions.
- Add breakdown review from manifests.
- Add page-plan cards with operator-friendly summaries.
- Add text-fit preview.
- Add image review/action controls wired to existing backend routes.
- Add chapter/book PDF preview controls.
- Keep paid image generation behind explicit confirmation.
