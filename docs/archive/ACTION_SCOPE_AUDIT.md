# Operator Action Scope Audit

Every operator action must answer before click:

- What scope will this run against?
- Will it cost API money or significant compute?
- What result should appear after it finishes?
- Is it safe to repeat?

## Scope Table

| Action / button copy | Scope | Backend route / function | Result shown after completion | Repeat safe? | Cost / risk | Confirmation |
|---|---|---|---|---|---|---|
| New Project | Project-wide | `POST /api/projects` / `createProject` | Selected project workspace is created. | Yes | No paid cost | No |
| Save Project Setup | Project-wide | `PATCH /api/projects/:id/config` / `saveProjectConfig` | "Project setup saved: FORMAT." | Yes | No paid cost | No |
| Delete Project | Project-wide | `DELETE /api/projects/:id` / `deleteProjectById` | Project disappears from list. | No | Data loss | Yes |
| Check Backend | Diagnostic only | `GET /health` / `refreshHealth` | Backend health status updates. | Yes | No paid cost | No |
| Choose File | UI-only | `uploadManuscriptFile` | Manuscript file name and local text are loaded. | Yes | No paid cost | No |
| Upload Manuscript | Project-wide | `POST /api/projects/:id/manuscript` / `uploadManuscript` | Manuscript intake stats and storage status. | Yes, but review outputs after replacing | Can invalidate review assumptions | Yes when breakdown/page plan exists |
| Start Breakdown | Book-wide | `POST /api/projects/:id/manifests` / `generateManifests` | Chapter map and page-entry chips. | Currently loads existing if already present | No paid cost | No |
| Compare Standards for Chapter N | Chapter-wide diagnostic | `POST /api/projects/:id/chapters/:chapterNumber/format-calibration` / `runFormatCalibration` | "Format calibration complete for Chapter N: FORMAT recommended." | Yes | No paid cost | No |
| Generate Page Plan | Book-wide | `POST /api/projects/:id/plan` / `planPages` | "Page plan generated for X entries." | Yes | No paid cost | No |
| Run Text-Fit for Book | Book-wide | `POST /api/projects/:id/text-fit-preview` / `runTextFitPreview` | "Text-Fit checked X pages: Y overflow, Z tight." | Yes | No paid cost | No |
| Approve Layout for Chapter N | Chapter-wide | `POST /api/projects/:id/chapters/:chapter/layout-approval` / `approveChapterLayout` | "Layout approved for Chapter N. Image generation unlocked for X pages." | Yes | Unlocks paid image work | No |
| Audit Current Stage | Diagnostic only | `POST /api/projects/:id/review` / `reviewStage` | Agent verdict appears in chat. | Yes | Possible agent/API usage depending backend | No |
| Audit with Agent | Diagnostic only | `POST /api/projects/:id/review` / `reviewStage` | Stage review appears in chat. | Yes | Possible agent/API usage depending backend | No |
| Generate Image for Selected Page | Page/entry-specific | `POST /api/pages/:id/generate-image` / `generateSelectedPageImage` | "Generated image for PAGE_KEY, version N." | Yes, creates versions | Paid OpenAI image call | Yes |
| Regenerate Selected Page Image | Page/entry-specific | `POST /api/pages/:id/regenerate` / `regenerateSelectedPageImage` | "Regenerated image for PAGE_KEY, version N." | Yes, creates versions | Paid OpenAI image call | Yes |
| Upscale Approved Image | Image-specific | `POST /api/pages/:id/upscale` / `upscaleSelectedPageImage` | "Upscaled approved image for PAGE_KEY: passed/failed." | Yes | Paid Replicate/API usage | Yes |
| Approve Image vN | Image-specific | `POST /api/pages/:id/images/:version/approve` / `approveImageVersion` | "Approved image for PAGE_KEY, version N." | Yes | No paid cost | No |
| Reject Image vN | Image-specific | `POST /api/pages/:id/images/:version/reject` / `rejectImageVersion` | "Rejected image for PAGE_KEY, version N." | Yes | No paid cost | No |
| Load Images for Selected Page | Page/entry-specific | `GET /api/pages/:id/images` / `loadPageImages` | Selected-page image versions appear. | Yes | No paid cost | No |
| Load Project Image Library | Project-wide | `GET /api/projects/:id/image-library` / `loadImageLibrary` | "Loaded project image library: X assets." | Yes | No paid cost | No |
| Reuse Image on Selected Page | Image-specific to page-specific | `POST /api/pages/:id/images/reuse` / `reuseImageAsset` | Reused asset becomes a new selected-page version. | Yes | No paid generation cost | No |
| Render Selected Page Proof | Page/entry-specific | `POST /api/projects/:id/pages/:pageKey/render` / `renderPagePreview` | Focused PDF proof preview. | Yes | Compute only | No |
| Render Chapter N Proof | Chapter-wide | `POST /api/projects/:id/chapters/:chapter/render` / `renderChapterPreview` | "Rendered Chapter N proof: X pages." | Yes | Compute only | No |
| Check Chapter N Readiness | Chapter-wide diagnostic | `GET /api/projects/:id/chapters/:chapter/operator-intelligence` / `loadChapterIntelligence` | Chapter readiness findings. | Yes | No paid cost | No |
| Render Full Book PDF Proof | Book-wide | `POST /api/projects/:id/render-book` / `renderBookPreview` | Full-book PDF proof preview. | Yes | Slow/heavy compute | Yes |
| Render Cover | Book-wide | `POST /api/projects/:id/render-cover` / `renderCoverPreview` | Cover PDF preview. | Yes | Compute only | No |
| Open PDF | UI-only | Browser blob link | Opens the current preview. | Yes | No paid cost | No |
| Download Current Preview PDF | UI-only | Browser blob link | Downloads current preview PDF. | Yes | No paid cost | No |
| Save Export Report | Book-wide diagnostic | `POST /api/projects/:id/render-book?format=json` / `renderBookReport` | Export/preflight report message. | Yes | Compute only | No |
| Ask Agent What To Do / Chat with Agent | Diagnostic only | `POST /api/projects/:id/chat` / `sendChat` | Agent response in chat. | Yes | Possible agent/API usage depending backend | No |

## Copy Rule

Button text should include scope when the action is not obvious:

- Use "Selected Page" for page/image actions.
- Use "Chapter N" for chapter proof, readiness, and layout approval.
- Use "Book" or "Full Book" for book-wide actions.
- Use "Project" for asset library, configuration, and destructive project operations.
- Keep paid actions confirmable until cost visibility is shown inline.

## Proof Scope Rule

The current PDF preview must show its scope before the operator reviews it:

- `page`: useful focused proof, but it does not complete the chapter proof stage.
- `chapter`: completes proof review for the selected chapter.
- `book`: satisfies proof review at book scope.
- `cover`: cover-only preview; it does not complete interior proof review.

## Deferred Batch Actions

Future batch image generation must require confirmation and should show count, estimated cost, and whether it creates new versions or only fills missing images.
