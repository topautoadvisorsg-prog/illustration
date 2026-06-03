# Operator Workflow Review

Date: 2026-06-03

## Business Model

The platform is a production line for turning a master manuscript into a finished, polished illustrated book. The operator should not feel like they are running scripts or chasing records in a database. They should feel like they are managing a publishing desk:

1. Confirm the manuscript map.
2. Approve page layouts and text-fit before paid image work.
3. Manage images as reusable publishing assets.
4. Review page-shaped proofs.
5. Export final book files only when the proof and assets are ready.

The commercial value is repeatability. Every book should leave behind usable assets, decisions, standards, and proofs that make the next book faster and cheaper.

## Current Operator Flow

- Project and manuscript restore now work across refresh.
- Breakdown creates 8 chapters and 129 page manifests for the current book.
- Page Plan shows layout choices, blockers, text-fit status, and layout approvals.
- Text-fit preview can be run before image spend.
- Image Proofing exposes selected-page generation, page image versions, approval/rejection, regeneration, upscale, and a project image library.
- The image library can search/filter generated assets and reuse one on the selected page.
- Render Preview can produce chapter/book/cover proofs and offers Open/Download fallback when the embedded PDF viewer is blank.

## Issues Found In Operator Review

- The old stage strip plus the detailed review cards felt redundant because they used similar labels without explaining their different jobs.
- "Review" buttons were ambiguous. They do not review in place; they ask the agent to audit that stage and report in chat.
- Breakdown had a layout approval button, which mixed two gates. Breakdown should confirm the book map; layout approval belongs to Page Plan.
- The image library was a good start, but it needs to become a first-class asset desk, not a detail inside page proofing forever.
- The render proof can still feel visually blank in the embedded iframe depending on browser PDF support, though Open/Download now makes the result recoverable.
- Word counts can show as pending when only manifest/page rows are loaded and the richer planning payload is absent.

## Fixes Applied

- Renamed stage review buttons to "Audit with Agent" so the operator knows the result is an agent verdict.
- Added a four-step checkpoint strip: Book map, Layout gate, Asset desk, Proof.
- Removed layout approval from the Breakdown card to reduce workflow confusion.
- Clarified Breakdown copy as chapter/page map review only.
- Clarified Page Plan as the spend gate for layout, text capacity, and prompt readiness.
- Clarified Image Proofing as the selected-page asset desk.
- Added project-level image library controls and reuse.
- Restricted image reuse to assets from the same project for now.
- Updated rendered-image CSS to contain art in the reserved slot without crop-fill or radial masking.

## Recommended Next Product Improvements

1. Make the board tabbed or stage-focused.
   Show one active workspace at a time: Breakdown, Page Plan, Assets, Proof. Keep the top progress strip persistent. This reduces scrolling and makes "what do I inspect now?" obvious.

2. Create a true Asset Library page.
   The current embedded library is useful, but commercial production needs a dedicated asset desk with batch review, tags, notes, quality status, layout compatibility, source prompt, usage history, and reuse targets.

3. Add first-class asset tables.
   Move from page-version rows only to `image_assets`, `image_asset_usages`, `image_asset_tags`, and `image_asset_reviews`. This enables reuse across pages, chapters, future books, and future projects without duplicating metadata.

4. Add proof-review annotations.
   Operators need to mark proof issues per page: text cramped, image wrong crop, contrast issue, replace art, typo, approve page. These should become actionable tasks.

5. Add a production dashboard.
   Show counts that matter commercially: pages planned, pages text-fit clean, pages with approved art, pages print-ready, estimated image spend remaining, proof status, export readiness.

6. Add automated UI audits.
   There is no Cypress setup in the repo today. Add Playwright or Cypress checks for the critical operator path: load project, run text-fit, load library, render chapter, verify fallback controls, and check no major workflow sections are empty.

7. Promote standards from each book.
   Good prompts, accepted layout choices, rejected image reasons, and print proof findings should feed the Publishing Intelligence Center automatically so the next title starts smarter.

## Operator Quality Bar

The operator should always be able to answer:

- What is the next gate?
- What is blocked?
- What will spend money?
- What has been approved?
- Where is this image stored?
- Can this image be reused?
- Does the page proof remain readable?
- What changed since the last proof?

If the UI does not answer those quickly, the workflow is not yet commercial-grade.
