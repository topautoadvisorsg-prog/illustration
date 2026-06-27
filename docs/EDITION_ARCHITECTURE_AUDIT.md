# Edition Architecture Audit — One Book → Many Editions

**Audit only (no build).** Question: does the platform support *one manuscript, many
editions* (Color / B&W / Vintage / Kids × Hardcover / Paperback / Kindle), or does adding
an edition force duplicating the whole pipeline? Target model: **Book → Edition → Style DNA**,
where the shared prompt is identical and only the Style DNA module swaps.

---

## Verdict
**Mostly achievable, and the hardest part is already done** — the prompt pipeline already
separates *subject* from *style*. But three gaps would currently push you toward "six
projects" instead of "one book, six editions." None require a rebuild; they're additive.

---

## What's already shared / correct (no duplication)
Everything upstream of rendering is project-level and naturally shared across editions:
- **Manuscript, breakdown, pagination (`pages`), entries, manifests (per-page subjects +
  layouts), the hero shot list, `config.publishing` (metadata, keywords, ISBNs per format),
  and the structural review history.**
- The render spec already carries the per-page **subject** (`spec.illustrationDNA.subject`)
  **separately** from the **style** (`spec.illustrationDNA.masterStyleBlock`) — see
  `whole-page-render/assemble-page-prompt.ts` (emits `ILLUSTRATION DNA — subject` and
  `ILLUSTRATION DNA — master style` as distinct blocks).
- The hero prompt system is already `PREAMBLE (style) + MODIFIER + SUBJECT + NEGATIVES`
  (`scripts/heroes-data.ts`) — style is a separable preamble.

**So the "swap Style DNA, keep everything else" seam is real.** The shared prompt
(subject, composition, behavior, environment, camera, lighting, emotion, placement) is
already distinct from the style block.

---

## Gaps that would force duplication (fix BEFORE building B&W)

### Gap A — Style DNA is a global singleton, not an edition-selectable module
`publishing-standard/standard.ts` defines ONE `ILLUSTRATION_DNA` constant; `assembleIllustrationDna()`
returns it brand-agnostically; `getMasterStyleBlock()` hands that single block to every render.
There is **no way to pick a DNA per edition** — changing it changes *everything*.
**Fix:** a small **Style DNA registry** keyed by id (`cinematic-naturalist-color` = current,
`bw-naturalist`, `vintage-ink`, `kids`…). The edition references a `styleDnaId`; the master
style block is resolved from it. Pure addition — the color DNA stays byte-identical.

### Gap B — there is no first-class `Edition` entity; edition assets are project singletons
- `whole_page_renders` is keyed by `pageId` with `version`/`active`/`approvedForBook` — but
  **no edition dimension**. It models *iterations of one style*, not *parallel styles*.
- Cover, paper, trim, export live on the project `config` as single values.
- Heroes are stored at `heroes/kindle/…` + one `mapping.json` — **no edition dimension**.

Without an Edition entity, the only way to get a B&W version today is to **clone the project**
— which duplicates the manuscript/pagination/entries/shot list and immediately risks
divergence (fix a typo in Color, B&W goes stale) + double review. **That is exactly the
"six products" trap.**
**Fix:** an **`editions`** table (one row per edition) that OWNS the edition-specific assets
and references a Style DNA; renders + heroes + covers get an `editionId`; shared content
stays at the project level, untouched.

### Gap C — color language has leaked INTO the shared layer
The "shared" prompt isn't fully style-neutral yet, so a B&W swap would send contradictory
instructions:
- `assemble-page-prompt.ts` continuation rule hardcodes *"keep the exact same **Cinematic
  Naturalist style, palette**"* — a color-style name baked into a shared instruction.
- Hero shot-list **bodies** embed color as if it were subject: "blood-red eye" (#24),
  "antlers backlit **gold**" (#13), "**orange-and-yellow** shelves" (#77), "**rust-red**
  leaves" (#74), "**flame-red** foliage" (#58), "fading **blue** layers" (#92), and many
  "golden hour" cues.
**Fix:** move color OUT of the shared prompt and INTO the Style DNA. The shared body should
describe **subject + light direction + tone/contrast** (style-neutral: "low warm backlight",
"the eye catching the light"); the DNA decides whether that renders as ruby-red or a dark
tonal accent. This is the single most important cleanup for clean multi-style editions.

---

## Shared vs Edition-specific (the asset map)
| Asset | Scope | Notes |
|---|---|---|
| Manuscript, breakdown, pagination, entries, manifests | **Shared** | project-level today ✅ |
| Shared prompt (subject/composition/behavior/env/camera/light/emotion/placement) | **Shared** | needs color removed (Gap C) |
| Hero shot list | **Shared** | one list, all editions |
| Metadata, keywords, publishing, review history | **Shared** | project-level ✅ |
| **Style DNA** | **Edition** | the only thing that defines Color vs B&W |
| Rendered interior pages + hero images | **Edition** | re-rendered per Style DNA (image spend) |
| Cover art + **spine width** | **Edition** | spine depends on edition paper/page count |
| Paper type, trim size | **Edition** | overrides; default from project |
| EPUB formatting / print formatting | **Edition** | per format |
| Export package | **Edition** | per edition |

---

## B&W edition: regenerate vs inherit
**INHERIT unchanged from the Color project (zero rework):** manuscript · breakdown ·
pagination · entries · manifests/layouts · hero shot list · the shared prompt bodies ·
composition/behavior/camera/placement decisions · metadata/keywords/publishing · structural
review history.

**REGENERATE (edition-specific):**
- **Illustrations** — interior page renders + hero images, re-rendered with the **B&W Style
  DNA** (image spend; same subjects/prompts, only the DNA block changes).
- **Cover** — B&W cover art + recomputed **spine** (note: B&W typically prints on **white/cream
  B&W paper** = a *different* paper-thickness multiplier than Color Premium, so the spine
  differs even at the same 275-page count).
- **EPUB** rebuild (B&W images) and **print files** (B&W interior).
- **Export package.**

**Net:** a new edition = "attach a Style DNA + render its assets," not "rebuild the project."

---

## Recommended architecture: Book → Edition → Style DNA
- **Book (project):** owns all shared content (manuscript → entries → shot list → subjects →
  metadata). One source of truth.
- **Edition:** child row selecting `{ styleDnaId, format, paperType, trim, coverArt }` and
  owning its rendered assets + export. Color-Hardcover, Color-Paperback, Color-Kindle today
  are all editions sharing one project; B&W-* are more editions on the **same** project.
- **Style DNA:** a named, modular block in a registry. Final render prompt =
  `shared prompt (subject…placement) + edition.styleDNA`. New look = new DNA module only.

Operator mental model becomes **One Book → Multiple Editions**, never six projects.

---

## Plan order (before any B&W build)
1. **Gap C first (cheap, no schema):** lift color out of the shared prompt + continuation
   rule into the Color Style DNA. Re-verify Color output is unchanged.
2. **Style DNA registry (Gap A):** extract the current block as `cinematic-naturalist-color`;
   add `bw-naturalist`. Selectable by id.
3. **`editions` entity (Gap B):** add the table + `editionId` on renders/heroes/cover;
   migrate the existing Color assets to a default "Color" edition (backfill, no data loss).
4. Wire Step 7 so editions sit side-by-side in one review surface (same philosophy as the
   cover preview already does for HC/Kindle).
5. *Then* B&W = create the edition, point it at `bw-naturalist`, render its assets.

**Today's hardcover/paperback/Kindle (Color) already work; this audit is the foundation so
B&W and any future style are an edition swap, not a duplicate pipeline.**
