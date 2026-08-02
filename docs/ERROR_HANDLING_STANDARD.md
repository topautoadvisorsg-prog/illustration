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

## 3. What the operator sees vs. what's logged

- **Operator sees:** the plain-English `message`, the highlighted field (if
  any), and the recovery button (if any) — never the code prominently, never
  a schema path, never raw JSON. The frontend does show the code in small
  muted text next to the error banner, purely so it's reportable to support.
- **Logs get:** every translated error is logged as a structured
  `translated_validation_error` event (`backend/src/server.ts`,
  `logTranslatedError`) with the code, request path/method, project id (when
  present in the route params), status code, and running app version. This is
  the "which error, how often, which step" telemetry — check these logs
  before assuming a confusing validation message is a one-off; if the same
  code shows up constantly, that's a UX problem to fix upstream (progressive
  validation, better manuscript guidance, etc.), not something to just keep
  translating politely forever.

## 4. Recovery over failure

Every `UserFacingError` should ask "what does the operator do next?" before
it's written. If the answer is a specific screen, attach:
```ts
action: { type: 'navigate', target: '<step-key>', label: 'Button text' }
```
The frontend's sticky error banner renders this generically for any error,
anywhere in the app — you don't need new frontend code to wire up a new
recovery button, just attach the action server-side.

## 5. Files

- `backend/src/lib/user-facing-error.ts` — the `UserFacingError` class. The
  only sanctioned way to produce a user-facing error.
- `backend/src/lib/error-codes.ts` — the code registry.
- `backend/src/lib/validation-messages.ts` — Zod issue → field label + plain
  English message + code, shared by both the Fastify-schema-validation path
  and the raw-`ZodError` safety net.
- `backend/src/server.ts` — the single `app.setErrorHandler()` that all of
  the above flows through, plus the telemetry log call.
- `frontend/src/ProductionConsole.js` — `api()` attaches `fields` / `action`
  / `errorCode` from any non-OK response onto the thrown `Error`; the sticky
  banner and `LabeledInput` consume them generically. A new backend error
  with a code + action needs zero new frontend code to render correctly.
