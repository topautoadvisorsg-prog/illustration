# STANDARD — Error Handling

**Status:** locked, in production. Every module (illustrations, QA, publishing,
exports, AI review, rendering, and anything built after this doc) uses this
layer for user-facing errors — no module implements its own.

**Why:** before this existed, a validation failure could reach the operator as
a raw Zod schema path (`body/config/authorName`) or a dumped JSON issues
array. That's not just ugly — every new route was a new opportunity to leak
the same class of bug. One centralized layer means fixing the wording, the
styling, or the field-highlighting behavior once fixes it everywhere, forever.

---

## 1. The rule

**Nothing you write should ever call `reply.code(4xx).send({ message: "..." })`
by hand for a condition an operator caused (bad input, missing prerequisite,
wrong format).** Throw a `UserFacingError` instead and let the global error
handler in `backend/src/server.ts` format the response.

The only errors that should still be hand-written 404/409 replies are ones
with genuinely no better recovery story than "the id was wrong" (e.g. "Project
not found" from a stale link) — there's no field to highlight and no action to
offer. Everything else — a missing prerequisite, invalid structure, bad
format, blocked operation — goes through `UserFacingError`.

## 2. How to add a new error

1. **Pick or mint a code** in `backend/src/lib/error-codes.ts`. Codes are
   grouped by family (`WL-1xxx` field validation, `WL-2xxx` manuscript
   structure, `WL-3xxx` manuscript format, `WL-9xxx` unclassified fallback —
   add a new family if what you're building doesn't fit). **A code's meaning
   never changes once assigned** — retire it and mint a new one rather than
   repurposing it. Message wording is free to change any time.
2. **Throw it**, not return it:
   ```ts
   throw new UserFacingError('Plain sentence the operator will actually read.', {
     code: 'Short Title',                       // -> JSON `error` field
     errorCode: ERROR_CODES.YOUR_NEW_CODE,       // -> JSON `errorCode` field
     statusCode: 400,
     action: { type: 'navigate', target: 'manuscript', label: 'Return to Manuscript' }, // optional
   });
   ```
3. **Add a recovery action whenever one exists.** If there's an obvious next
   screen or button that fixes the problem, say so — see §4. If there truly
   isn't one, omit `action` rather than inventing a vague one.
4. **Never write field labels, English phrasing, or Zod-issue formatting
   inline in a route.** That belongs in `validation-messages.ts` (for schema
   validation) or the message string you pass to `UserFacingError` (for a
   specific known failure). If you're tempted to write a switch statement
   translating error types to English inside a route file, that logic
   belongs in `validation-messages.ts` instead.

Zod schema validation (`schema: { body: SomeSchema }`) needs none of the
above — the global handler already recognizes Fastify + `fastify-type-provider-zod`
validation failures and runs every issue through the same field-label +
message-formatting logic in `validation-messages.ts`, attaching a code
automatically via `codeForFieldPath`.

## 3. What the operator sees vs. what's logged vs. what's queryable

- **Operator sees:** the plain-English `message`, the highlighted field (if
  any), and the recovery button (if any) — never the code prominently, never
  a schema path, never raw JSON. The frontend does show the code in small
  muted text next to the error banner, purely so it's reportable to support.
- **Logs get:** every translated error is logged as a structured
  `translated_validation_error` event (`backend/src/lib/error-handler.ts`)
  with the code, request path/method, project id (when present in the route
  params), status code, running app version, and a `correlationId` unique to
  that occurrence.
- **The database gets** the same event, persisted to `error_events`
  (`backend/src/db/repositories/error-events.repo.ts`) — this is what backs
  the diagnostics page (§6), not just ephemeral logs. When the operator
  clicks a recovery action, the frontend posts a `recovery_events` row
  tagged `clicked` with that same `correlationId`; the very next action's
  outcome (success or not) posts `succeeded` if it worked. This is a simple
  "did the next thing work" heuristic, not a full session trace — good
  enough to catch a recovery button that isn't actually helping.

Check `GET /api/diagnostics/errors` (or the diagnostics page, §6) before
assuming a confusing validation message is a one-off; if the same code shows
up constantly, that's a UX problem to fix upstream (progressive validation,
better manuscript guidance, etc.), not something to just keep translating
politely forever.

## 4. Recovery over failure

Every `UserFacingError` should ask "what does the operator do next?" before
it's written. If the answer is a specific screen, attach the standardized
action shape:
```ts
action: {
  type: 'navigate',
  target: '<step-key>',     // required — destination
  label: 'Button text',     // required — what the button says
  explanation: '...',       // optional — only when the top-level `message`
                             // doesn't already make the next step obvious
  docLink: 'https://...',   // optional — reserved for when operator docs
                             // have a public home; unused today
}
```
In practice most of our messages are already written to double as their own
explanation ("Chapter 1 doesn't contain any entries... before Breakdown can
continue" is both the *what* and the *why*), so `explanation` stays empty
most of the time — don't restate the message, only add it when the action
needs its own justification distinct from the error message.

The frontend's sticky error banner renders all of this generically for any
error, anywhere in the app — you don't need new frontend code to wire up a
new recovery button, explanation, or doc link, just attach it server-side.

## 6. Error registry, tests, and the diagnostics page

- **Error registry** (`backend/src/lib/error-registry.ts`) — every code's
  title, friendly message, technical cause, recovery description, workflow
  step, and severity, in one place. `backend/scripts/generate-error-registry-doc.ts`
  generates `docs/ERROR_REGISTRY.md` from it — edit the registry, re-run the
  script, never hand-edit that doc.
- **Regression tests** (`backend/src/lib/__tests__/error-handling.test.ts`) —
  run against a minimal Fastify instance (no live DB): every registry entry
  has all required fields, every `ERROR_CODES` value has a registry entry, a
  thrown `UserFacingError` produces the right status/body/correlationId,
  Fastify schema validation never leaks a schema path or the raw Zod issue
  shape, an uncaught `ZodError` gets the same treatment, and a truly generic
  uncaught error never puts a `.stack` in the response body. Run with
  `yarn workspace @wildlands/backend test`.
- **Diagnostics page** (`frontend/src/DiagnosticsPanel.js`, reached via
  `?diagnostics=1`) — an internal-only read of `GET /api/diagnostics/errors`
  and `GET /api/diagnostics/renders`: total errors, top codes, top paths
  (a proxy for "which step," since the backend doesn't know the frontend's
  step key), recovery click/success rate, render failures, and approximate
  render/approval times. On-demand, not a scheduled/emailed report — there's
  no notification infrastructure in this app to schedule one against.

## 7. Files

- `backend/src/lib/user-facing-error.ts` — the `UserFacingError` class. The
  only sanctioned way to produce a user-facing error.
- `backend/src/lib/error-codes.ts` — the code registry's stable identifiers.
- `backend/src/lib/error-registry.ts` — the full metadata behind each code.
- `backend/src/lib/validation-messages.ts` — Zod issue → field label + plain
  English message + code, shared by both the Fastify-schema-validation path
  and the raw-`ZodError` safety net.
- `backend/src/lib/error-handler.ts` — `registerErrorHandler(app, sink)`, the
  actual `app.setErrorHandler()` wiring; extracted from `server.ts` so it's
  testable without a live DB. `sink` is how telemetry persistence plugs in.
- `backend/src/db/repositories/error-events.repo.ts` — persists translated
  errors + recovery click/succeeded events; computes the frequency/recovery
  aggregate report.
- `backend/src/db/repositories/render-diagnostics.repo.ts` — render
  count/failure/timing aggregates for the diagnostics page.
- `backend/src/api/diagnostics.routes.ts` — the two `GET` aggregate
  endpoints plus `POST /api/diagnostics/recovery-event`.
- `backend/src/server.ts` — calls `registerErrorHandler`, wiring its sink to
  `recordErrorEvent`.
- `frontend/src/ProductionConsole.js` — `api()` attaches `fields` / `action`
  / `errorCode` / `correlationId` from any non-OK response onto the thrown
  `Error`; the sticky banner and `LabeledInput` consume them generically. A
  new backend error with a code + action needs zero new frontend code to
  render correctly. The recovery button posts the click/succeeded events.
