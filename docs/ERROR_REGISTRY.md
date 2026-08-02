# Error Registry

**Generated — do not hand-edit.** Source of truth: `backend/src/lib/error-registry.ts`.
Regenerate with `backend/scripts/generate-error-registry-doc.ts` after changing the registry.

Total codes: 13.

### WL-2000 — Invalid Manuscript Structure

| | |
|---|---|
| **Step** | `breakdown` |
| **Severity** | structural |
| **Friendly message** | The manuscript could not be converted into a valid book structure. Check the chapter and entry formatting and try again. |
| **Technical cause** | buildDeterministicManifestResult (generate-manifests.ts) hit a ManifestGenerationResultSchema validation failure that wasn't the specific empty-chapter case — a safety-net fallback. |
| **Recovery** | Return to Manuscript, re-check the required structure card, and re-upload. |

### WL-2001 — No Chapters Detected

| | |
|---|---|
| **Step** | `manuscript` |
| **Severity** | structural |
| **Friendly message** | This manuscript doesn't contain any chapters. Mark each chapter with a top-level "# Chapter Title" heading before running Breakdown. |
| **Technical cause** | assertUsableManuscriptOutline (parse-manuscript-outline.ts): outline.chapters.length === 0. Runs both on manuscript upload and on Breakdown. |
| **Recovery** | Return to Manuscript and add at least one "# Chapter Title" heading. |

### WL-2002 — No Entries Detected

| | |
|---|---|
| **Step** | `manuscript` |
| **Severity** | structural |
| **Friendly message** | This manuscript doesn't contain any entries. Mark each entry with a "### Entry Title" heading inside its chapter before running Breakdown. |
| **Technical cause** | assertUsableManuscriptOutline (parse-manuscript-outline.ts): outline.totalEntries === 0. Runs both on manuscript upload and on Breakdown. |
| **Recovery** | Return to Manuscript and add at least one "### Entry Title" heading inside a chapter. |

### WL-2003 — Empty Chapter

| | |
|---|---|
| **Step** | `breakdown` |
| **Severity** | structural |
| **Friendly message** | Chapter <N> ("<title>") doesn't contain any entries. Each chapter needs at least one "### Entry Title" heading before Breakdown can continue. |
| **Technical cause** | buildDeterministicManifestResult (generate-manifests.ts): a specific chapter's entries array is empty, caught from ManifestGenerationResultSchema's per-chapter min(1) on entries. |
| **Recovery** | Return to Manuscript and add at least one "### Entry Title" heading to the named chapter. |

### WL-3000 — Manuscript Format Problem (Unclassified)

| | |
|---|---|
| **Step** | `manuscript` |
| **Severity** | structural |
| **Friendly message** | The uploaded manuscript could not be read. |
| **Technical cause** | Reserved fallback for a manuscript-format problem that does not match UnsupportedManuscriptError's known reasons — not currently thrown anywhere; kept for future use. |
| **Recovery** | Re-check the file and re-upload; if this keeps happening, mint a specific code for the actual cause. |

### WL-3002 — No Manuscript On File

| | |
|---|---|
| **Step** | `breakdown` |
| **Severity** | structural |
| **Friendly message** | No manuscript on file. Upload one before running Breakdown. / Stored manuscript file is missing. Re-upload the manuscript. |
| **Technical cause** | POST /api/projects/:id/manifests: project.manuscriptPath is null, or the stored file 404s (ENOENT) when read from storage. |
| **Recovery** | Go to Manuscript and upload (or re-upload) the manuscript. |

### WL-1000 — Field Invalid (Unmapped)

| | |
|---|---|
| **Step** | `project` |
| **Severity** | validation |
| **Friendly message** | <Field> is invalid. |
| **Technical cause** | A Zod schema validation issue on a field with no specific entry in FIELD_ERROR_CODES (validation-messages.ts) — the fallback label/code path. |
| **Recovery** | Fix the highlighted field. If this shows up often for the same field, mint it a real code. |

### WL-1001 — Missing Title

| | |
|---|---|
| **Step** | `project` |
| **Severity** | validation |
| **Friendly message** | Title is required. |
| **Technical cause** | ProjectConfigSchema.title failed Zod min(1) on Create Project or Book Setup save. |
| **Recovery** | Enter a book title. |

### WL-1002 — Missing Author

| | |
|---|---|
| **Step** | `project` |
| **Severity** | validation |
| **Friendly message** | Author / pen name is required. |
| **Technical cause** | ProjectConfigSchema.authorName failed Zod min(1) on Create Project or Book Setup save. |
| **Recovery** | Enter an author name. |

### WL-1003 — Invalid Volume

| | |
|---|---|
| **Step** | `setup` |
| **Severity** | validation |
| **Friendly message** | Volume must be a positive number. |
| **Technical cause** | ProjectConfigSchema.volume failed Zod int().positive() — should be unreachable from the UI since the form always coerces to >=1, but reachable via direct API calls. |
| **Recovery** | Set Volume to a whole number of 1 or more. |

### WL-1004 — Invalid Subtitle

| | |
|---|---|
| **Step** | `project` |
| **Severity** | validation |
| **Friendly message** | Subtitle is invalid. |
| **Technical cause** | ProjectConfigSchema.subtitle failed Zod validation (subtitle is optional, so this is rare — usually a type mismatch from a direct API call). |
| **Recovery** | Fix or clear the Subtitle field. |

### WL-3001 — Unsupported Manuscript Format

| | |
|---|---|
| **Step** | `manuscript` |
| **Severity** | validation |
| **Friendly message** | e.g. "Uploaded text file is empty." / "No selectable text found in the PDF (it may be scanned images)." |
| **Technical cause** | UnsupportedManuscriptError thrown in extract-manuscript.ts (empty file, DOCX/PDF missing bytes, or no extractable text) and translated at the upload route's catch site. |
| **Recovery** | Upload a non-empty .md/.markdown/.txt/.docx/.pdf with real, selectable text. |

### WL-9000 — Unclassified Validation Error

| | |
|---|---|
| **Step** | `any` |
| **Severity** | system |
| **Friendly message** | The request was invalid. / Please fix the highlighted fields. |
| **Technical cause** | A raw ZodError reached the global error handler without going through a specific UserFacingError path — the safety net for validation failures we haven't seen before. |
| **Recovery** | No specific recovery — if this code appears in telemetry, find the throw site and give it a real code. |
