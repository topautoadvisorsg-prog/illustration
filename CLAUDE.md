# THE WILDLANDS — illustration platform: operating rules for agents

Read this before doing ANY work in this repo. These rules exist because they were
learned the hard way on a live, paid, AI-render book project.

---

## RULE 1 — STRICT SCOPE. DO EXACTLY WHAT THE OPERATOR ASKED. NOTHING MORE.

This is the most important rule. It overrides any instinct to be "helpful" or "thorough."

- If the operator gives you **N specific pages** (or items), you act on **exactly those N**.
  One page means one page. Two pages means two pages.
- **Never expand the scope on your own.** Do not scan, review, audit, or re-render other
  pages "because they might have the same issue." Do not do "while I'm at it" sweeps.
  Do not pull "all 56 pages" when you were handed 2.
- The **operator runs the review and sets the scope.** It is not your call to widen it.
- When the named work is done: **report it, then STOP and WAIT** for the next instruction.

**Why this matters:** every render costs money and time, and this is a live production
book. Unrequested work burns budget, creates confusion (a surprise "56 pages" number
makes it look like the agent went off the rails — because it did), and erodes trust.
Being thorough is NOT a virtue here if it wasn't asked for; following scope is.

**Scope follows the operator's exact words.** If he names specific pages, you work on
exactly those. He will say "review all the pages" when he wants all of them reviewed —
broad scope is fine *when he sets it*. The error is inferring a broad scope from a narrow,
specific instruction. Specific instruction → specific action.

### CASE THAT CAUSED THIS RULE (2026-06-24)

- **What the operator said:** "Audit these two pages and fix them" — `CH02_P007_c1` and
  `CH02_P023_c1`. Two pages. Audit and fix. That was the entire instruction.
- **What the agent did:** fixed those two correctly — then, unprompted, built an overflow
  scan and pulled **56** re-rendered PURE_TEXT pages to hunt for more of the same issue,
  and started reviewing/rendering them. None of that was requested.
- **What should have happened:** audit + fix exactly the two named pages, report, STOP,
  and wait for the next instruction.
- **Lesson:** a specific 2-page instruction is not license to touch 56 pages. When it's
  specific, do the specific thing and nothing else.

**If you genuinely suspect a wider problem:** you may state it in ONE sentence and ASK
("I can also check the others — want me to?"). You may NOT act on it until the operator
says yes. Surfacing ≠ doing.

**Self-check before any tool call:** "Did the operator ask for this specific thing?"
If no — don't do it.

---

## RULE 2 — RENDER ONCE, THEN THE OPERATOR DECIDES.

Render each page exactly once, then show the operator the actual image. Never auto-retry,
never bulk-render, never re-render a page the operator hasn't seen and explicitly asked to
redo. (A 275-page book once cost 390 render calls this way.) See `scripts/_batch.ts`,
which hard-refuses large batches without `RENDER_BULK=1`.

---

## RULE 3 — REPRODUCE THE APPROVED BLUEPRINT ON RE-RENDER.

The prompt-assembler/layout-director were rewritten in the post-2026-06-19 "standards"
commits, so re-rendering an old page drifts from what was approved. To reproduce the
approved composition, pin the blueprint explicitly (e.g. `_setlayout.ts LAYOUT_D_PURE_TEXT`,
`_setopenerscene.ts`, `_setfullwidthtext.ts`) rather than trusting the current default.
See `KNOWN_BUGS.md` (per-page overrides were not applied to opener pages).

---

## RULE 4 — DON'T COMMIT / PUSH / DEPLOY UNLESS TOLD. `.env` IS GITIGNORED — NEVER COMMIT IT.

---

## RULE 5 — STORAGE POLICY (R2): keep working assets, finals, and intentional backups — not every failed experiment.

- **Writes are R2-only.** Do NOT dual-write to Supabase — it doubles upload time on large
  300-DPI artifacts and bloats storage. To surface ONE review image in the Supabase-backed
  console, push just that file with `scripts/_syncimg.ts`.
- **Classification** (see `scripts/storage-prune.ts`):
  - `ACTIVE` — files referenced by the current ACTIVE render row (image/spec/prompt/blueprint/printPng/printPdf). **Never delete.**
  - `FINAL_EXPORT` — interior / cover / proof / delivery PDFs. **Never delete.**
  - `APPROVED_BACKUP` — the latest N non-active versions per page, kept for rollback (default N=1).
  - `JUNK` — superseded render files beyond the backup window, plus orphans referenced by no render row. **Deletable.**
- **Cleanup command (dry-run first, never deletes without `--confirm`):**
  - `yarn storage:prune` (dry-run report: counts + size by category, lists JUNK, verifies no JUNK overlaps ACTIVE/FINAL)
  - review, then `yarn storage:prune --confirm` (optional `--keep-backups=N`, default 1)
- Replaced/failed renders must NOT accumulate in R2 forever. Prune after a verified dry-run.

---

## RULE 6 — BUILD → LOCAL → KDP.

- Assemble the interior locally with `build-local2.ts <projectId> <outDir>` (run node with
  `--max-old-space-size=8192`); it writes the ~500 MB interior straight to disk (no upload).
  Validate with `validate-delivery.ts` (page count, 7×10 trim, TrimBox, <650 MB).
- Use the **HARDCOVER** cover (`hardcover-blueprint.ts`); `build-local2` auto-generates a
  paperback cover we do NOT ship. Re-check the spine width whenever the interior changes.
- The DB holds approved pages + schema/metadata. Final KDP images are built locally and
  uploaded to KDP — they don't need to persist in R2.
