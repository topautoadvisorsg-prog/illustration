# Shared — Types & Contracts

Zod schemas and TypeScript types shared between backend and (future) frontend.

**Status:** Phase 0 — placeholder. Real schemas added in Phase 1 alongside DB tables.

---

## What's Here

```
src/
  index.ts          Barrel export
  manifests/        Page / chapter / book manifest schemas (Phase 1.5)
  api/              API request/response schemas (Phase 1+)
  config/           Project config JSON schema (Phase 1)
```

---

## Why This Exists

- **Single source of truth** for data contracts. Backend Zod-validates inputs/outputs against these. Frontend consumes the same types.
- **Compile-time safety + runtime validation** — Zod gives both.
- **No drift.** When a schema changes, every consumer breaks loudly until updated.

---

## How To Use

```ts
// In backend
import { PageManifestSchema, type PageManifest } from '@wildlands/shared';

const manifest = PageManifestSchema.parse(jsonFromClaude);
```

---

## What Can Go Wrong

- **Adding fields without bumping versions** — if a manifest schema changes and old manifests exist on disk, they'll fail validation. Always write a migration path.
- **TS path resolution issues** — make sure `tsconfig.json` paths and the `@wildlands/shared` package alias both work.
