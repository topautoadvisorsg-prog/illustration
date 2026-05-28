# THE WILDLANDS — Master Style Block (v1 Draft)

**Status:** DRAFT — pending stakeholder review (target: D7 sign-off before Spike 3 on D8).
**Brand:** `THE_WILDLANDS`
**Visual style:** `CINEMATIC_NATURALIST`
**Target model:** OpenAI `gpt-image-1`
**Source spec:** `THE_WILDLANDS_PUBLISHING_PLATFORM_BLUEPRINT_v2.8.md` — `visual_system` block

---

## Why This Document Exists

Every image in the book is generated through `gpt-image-1`. Without a locked, repeatable
prompt prefix, sequential generations drift — colors shift, composition changes, the
aesthetic loses cohesion. The Master Style Block is the single prompt fragment injected
into **every** image-generation call to anchor the visual identity.

Drift mitigations (per spec, layered):
1. **Master Style Block** (this file) — injected into every prompt
2. **Style reference images** — approved images from earlier chapters re-fed as anchors (Phase 2+)
3. **Negative prompt rules** — explicit list of what NOT to generate (in this file)
4. **Per-chapter visual QA** — human reviews each chapter as a set

---

## How It Is Used

Stage 2 (Scene & Page Planner) assembles each image prompt as:

```
{MASTER_STYLE_BLOCK}

SUBJECT: {page_manifest.illustration.subject}

ANNOTATIONS ON IMAGE: {page_manifest.illustration.annotations joined}
(Annotations are subtle hand-lettered field-notes near the subject, never replacing the illustration.)

LAYOUT: {layout_template_hint}
WARNINGS: {warning_elements or "none"}

{NEGATIVE_RULES}
```

Total assembled prompt must stay under 4000 characters (gpt-image-1 cap). The Master
Style Block below is ~1900 chars to leave room for subject + annotations.

---

## MASTER STYLE BLOCK — v1 (Verbatim)

```
A single illustration in the style of a 19th-century naturalist's expedition journal
— pen-and-ink drawing with warm watercolor wash, rendered on aged cream parchment paper
the color of #F5EDD6 with subtle fiber texture and warm amber-ochre patina at the edges.

The aesthetic is Cinematic Naturalist: precise scientific observation softened by
painterly, atmospheric warmth — like the field notebooks of John James Audubon, Ernest
Thompson Seton, or a 19th century Royal Geographical Society expedition artist. The
mood is contemplative, reverent, and grounded in the natural world. It feels collected,
hand-bound, kept in a leather satchel.

LINE WORK: confident, expressive pen-and-ink linework in deep sepia-brown (#2C1A0E)
and warm sepia (#6B4C2A). Lines have organic variation — sometimes precise and
diagnostic, sometimes loose and gestural. Hand-drawn, never mechanical, never traced,
never vector.

COLOR: muted, atmospheric watercolor wash applied sparingly. The dominant accents are
forest green (#3A5C3A), amber gold (#C8860A), ochre (#B87333), with rare touches of
muted red (#8B2020) reserved for danger/warning subjects only. Whites are the warm
parchment itself, never bright paper-white. Saturation is restrained — vintage, never
neon, never digital, never over-processed.

COMPOSITION: asymmetric and organic placement of the subject on the page. The subject
floats on the parchment with negative space breathing around it, never grid-locked,
never centered, never symmetrical. Edges of the illustration fade softly into the
parchment with no hard border — the wash dissolves naturally into the paper. Light is
warm, soft, and directional, as if from a high window in an autumn study.

DETAIL: anatomically accurate to field-guide standard — habitats, gill structure, bark
texture, leaf venation, track patterns, and proportional scale are rendered correctly.
Naturalist precision is the foundation; the painterly handling is the surface.

PAPER: aged cream parchment #F5EDD6, with subtle fiber, gentle fold creases, and warm
shadow patina at the edges. The paper itself is part of the image.
```

---

## NEGATIVE RULES — v1 (Appended to Every Prompt)

```
DO NOT include any of the following:
- Photography, photorealism, or photographic lighting.
- Modern digital illustration style, flat vector art, isometric, low-poly, anime, manga, cartoon, or comic-book linework.
- Bright saturated colors, neon, fluorescent, or hyper-real color grading.
- Hard borders, frames, rectangles, ovals, badges, banners, or any geometric containers around the subject.
- Symmetrical, grid-locked, or centered subject placement.
- Pure white backgrounds, plain paper, or screen-white. The background must be the warm parchment described above.
- Text blocks, headlines, paragraphs, captions, titles, or scientific names rendered IN the image. Annotations are short hand-lettered field notes only, two to five words, placed unobtrusively next to the subject.
- Watermarks, signatures, logos, page numbers, or stock-art tags.
- Multiple unrelated subjects unless the layout explicitly calls for vignettes.
- Anthropomorphized animals, cartoon expressions, or whimsical fantasy elements.
```

---

## Reasoning Notes (for stakeholder review)

1. **Why pen-and-ink + watercolor wash, not pure pen-and-ink?**
   The spec defines `CINEMATIC_NATURALIST` (Brand 1) as pen-and-ink with warm watercolor
   wash. Pure pen-and-ink is reserved for Brand 3 (`CLASSIC_INK`). The Brand 1 wash is
   what gives the book its "expedition journal" warmth on the parchment.

2. **Why hex codes in the prompt?**
   gpt-image-1 respects color descriptors better than abstract palette names. Including
   the exact palette codes from `project_config.color_palette` keeps the generated
   images aligned with the typography and layout color system.

3. **Why call out "John James Audubon, Ernest Thompson Seton"?**
   These are real, well-trained reference points. gpt-image-1 has strong representations
   of both. Generic prompts ("vintage naturalist") yield generic outputs.

4. **Why the explicit ban on text blocks?**
   gpt-image-1 will happily render scientific names, captions, and headings as in-image
   text unless told not to. All typography in the book is overlaid by the layout engine,
   not generated by the image model.

5. **Why "Annotations are short hand-lettered field notes only"?**
   The spec calls for annotations like "false gills — blunt, forking" near the subject.
   We want these as part of the illustration's hand-drawn feel, NOT as typeset text.
   Limiting to 2–5 words per annotation keeps the model honest.

6. **Why the muted red only for danger?**
   Per `color_palette.muted_red_warning: #8B2020`. Reserving the red for toxic/deadly
   subjects gives the warning pages immediate visual signal across the book.

---

## Open Questions for Stakeholder

- [ ] **Confirm reference artist list.** Audubon + Seton are safe; happy to swap if the brand voice prefers different references (e.g. Ernst Haeckel, Beatrix Potter for slightly different mood).
- [ ] **Confirm "warm watercolor wash" intensity.** Spike 3 (D8) will show 20 generations — if wash is too heavy or too thin, adjust here.
- [ ] **Confirm subject placement rule.** "Asymmetric, never grid-locked" is per spec but Spike 3 will show whether gpt-image-1 actually honors this.
- [ ] **Confirm parchment texture description.** May need to dial up/down based on how heavy the fiber texture comes through.

---

## Versioning

- **v1** (this file) — initial draft from spec
- **v1.X** — adjustments after Spike 3 visual review (D8)
- **v2** — locked once Spike 3 passes and first chapter is approved in production

Each version is stored as a separate file: `THE_WILDLANDS_v1.md`, `THE_WILDLANDS_v1.1.md`, etc.
The project config's `image_generation.master_style_block_version` field selects the
active version. Older versions are never deleted — re-running an older book uses its
locked version for consistency with previously approved images.
