# The Wildlands — Operator Manual

How to take a finished manuscript to a published KDP book using the **Operator
Production Console** — solo, no terminal. One book at a time, top to bottom.

- Console: `https://frontend-production-f65d.up.railway.app`
- You'll need: the access password, the manuscript as Markdown, and a KDP account.

**The golden rules**
- **Preview is free; rendering spends money.** Only the **Render & Review** step
  (page renders + cover artwork) costs anything. Everything else is free.
- **Render once, then decide.** Render a page once, look at the actual image,
  then Approve or Reject. Don't bulk-render or auto-retry.
- A **✓** on a sidebar step means it's done. Work top to bottom.

---

## Step-by-step

**Log in** with the access password.

**1 · Project** — Create a new book (title, subtitle, author, trim) or open an
existing one. Each book is its own isolated project; creating a new one never
touches another book's pages or images.

**2 · Manuscript** — Paste or drop the Markdown manuscript. Keep Glossary, Index,
and Sources as top-level sections.

**3 · Book Setup** — Confirm title / subtitle / author / trim. (Visual style is
fixed by the Wildlands Standard — you don't set fonts/colors.)

**4 · Breakdown** *(free)* — Splits the manuscript into chapters + entries. Review
the chapter list looks right.

**5 · Paginate** *(free)* — Flows the text onto pages and shows a **fit blueprint**
per page (red = text, blue = illustration, orange = ornament) with a
FITS / UNDERFILLED / OVERFLOW chip. Confirm pages fit before you spend anything.

**6 · Build Front/Back Matter** *(free)* — Generates title, copyright, contents
(from real page numbers), glossary, index, sources, and about pages.

**7 · Render & Review** — The review hub. **This is the only step that spends.**
- **Cover** — *Generate cover* (paid) creates the full wrap (back · spine · front);
  the spine is sized to the current page count. You'll see three previews: the
  **print front cover (7×10)**, the **Kindle front cover (portrait)**, and
  **back + spine**. Toggle *Show guides* for trim/safe (green) + spine-fold (orange) overlays.
- **Interior pages** — for each page: **Preview** (free — shows the exact text the
  AI will print), **Render** (paid — re-click only to retry a FAILED page), then
  **Approve for book** or **Reject**. *Approve for book does everything in one
  click* — it approves, print-preps (stamps page numbers/badges + runs preflight),
  and adds the page to the book, so the page is immediately print-ready. A "needs
  print-prep" tag only shows if that step didn't finish — click Approve again.
  **Reject** to render a fresh version.
- **Kindle eBook — preview & export** *(free)* — Click **Preview Kindle edition**.
  Read the build report (chapters / entries / word count / cover status), click
  through the structure tree (Front matter / Contents / Back matter) and read the
  actual reflowable text. Per-entry **hero-illustration slots** are marked as a
  future addition (v1 Kindle is text + cover). When it looks right, **Export
  Kindle EPUB** downloads the `.epub`.

**8 · Build Book** — Assembles the print-ready **interior PDF** + **cover PDF**
(300 DPI). It **blocks** if any page isn't book-ready, or if the cover is out of
sync with the interior page count (see Gotchas). On success you get both files +
an in-page preview. *Paperback uses the same interior PDF with a paperback cover.*

---

## Editions — one manuscript, three outputs

All editions come from the **same approved content** — no re-rendering between them.

| Edition | What you upload to KDP | Where it comes from |
|---|---|---|
| **Hardcover** | Interior PDF + hardcover full-wrap cover | Step 8 · Build Book |
| **Paperback** | The **same** interior PDF + paperback wrap | Step 8 (different cover) |
| **Kindle eBook** | The `.epub` | Step 7 · Render & Review → Export |

---

## Validate before you upload (always)

- **Kindle (.epub):** open it in **Amazon Kindle Previewer** — check the cover,
  the chapter navigation, and that the text flows. (We also run EPUBCheck internally.)
- **Print (interior + cover PDFs):** in KDP, run the **KDP Previewer** after upload
  and eyeball every page before approving.

## Upload to KDP

1. Create the title in KDP (or add a new edition to an existing title).
2. **Print:** trim 7×10, bleed Yes, white paper; upload the interior PDF + the wrap cover.
3. **Kindle:** add a Kindle eBook edition to the same title; upload the `.epub` + cover.
4. Run the previewer, eyeball, **Approve**.

Detailed print/KDP build specifics: see `PUBLISHING_TO_KDP.md`.

---

## Gotchas

- **Cover sync gate:** the cover spine is baked for a specific page count. If the
  interior page count changes after you made the cover, Build Book blocks with
  "Cover is out of date." Fix: regenerate the cover in **Step 7 · Render & Review**.
- **Spend only happens in Step 7** (page renders + cover). Steps 4–6 and the Kindle
  preview/export are free.
- **Don't delete a real book project** — project deletion currently orphans its
  image files (safe project deletion + the permanent Image Library aren't built yet).
- **New book?** Just go to **Step 1 · Project** and create one. It's fully isolated.

## Advanced (rarely needed)

The main console is the whole operator path. A small advanced panel is reachable
at **`?legacy=1`** (append to the console URL): it holds a no-spend **Pipeline
Check** (a status verdict + next-action report). You won't need it for normal work.
