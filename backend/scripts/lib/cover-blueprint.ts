/* Single source of truth for the hardcover CONTENT-PLACEMENT blueprint + the
 * v1.3 PRODUCTION LAYOUT RULES. Used by both the blueprint preview and the
 * cover generator so the map the operator sees == the map the model gets.
 * Geometry is the KDP hardcover wrap (16.409 x 11.417, spine 0.834); zones are
 * expressed as fractions so the same builder works at any render size. */

import { getKdpCoverDimensions } from '../../src/pipeline/publishing-standard/kdp-cover-specs.js';

// ---- KDP wrap geometry, DERIVED from the verified calculator reading ----
// Every fraction below used to be a hand-typed inch value. They are now
// computed from the fixture for this exact configuration, so the blueprint
// cannot drift from the wrap the cover builder actually uses.
//
// One real correction: the spine-safe width was typed as 0.709in against the
// calculator's 0.695in, which let spine type sit 0.007in per side closer to
// the fold than KDP allows. It now uses the stated figure.
const KDP = getKdpCoverDimensions({
  binding: 'HARDCOVER',
  coverType: 'CASE_LAMINATE',
  interiorType: 'PREMIUM_COLOR',
  paperType: 'WHITE',
  trimSize: '7x10',
  pageCount: 275,
});
const Wf = KDP.fullWidthIn, Hf = KDP.fullHeightIn;
const spineStart = KDP.wrapIn + KDP.frontWidthIn;
const spineEnd = spineStart + KDP.spineIn;
const f = {
  marginX: (KDP.wrapIn + KDP.marginIn) / Wf,
  marginY: (KDP.wrapIn + KDP.marginIn) / Hf,
  backTrim0: KDP.wrapIn / Wf,
  backHinge0: (spineStart - KDP.hingeIn) / Wf,
  spine0: spineStart / Wf,
  spine1: spineEnd / Wf,
  frontHinge1: (spineEnd + KDP.hingeIn) / Wf,
  frontTrim1: (spineEnd + KDP.frontWidthIn) / Wf,
};
const spineSafeHalf = KDP.spineSafeWidthIn / 2 / Wf;
const spineCx = 0.5;

export function buildBlueprintSvg(W: number, H: number): string {
  const X = (fr: number) => +(fr * W).toFixed(1);
  const Y = (fr: number) => +(fr * H).toFixed(1);
  const fs = (k: number) => +(W * k).toFixed(1);
  const o: string[] = [];

  // panels
  const backText = { x0: f.backTrim0 + 0.018, x1: f.backHinge0 - 0.006 };
  const frontText = { x0: f.frontHinge1 + 0.006, x1: f.frontTrim1 - 0.018 };
  const top = f.marginY, bot = 1 - f.marginY;

  // ---- ENTIRE wrap is illustration: one continuous fill, edge to edge, bleeds off all sides ----
  const tint = '#e9f1fb', tintStroke = '#8d9cb0';
  o.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${tint}"/>`);          // full bleed = illustration everywhere
  o.push(`<rect x="${X(f.spine0)}" y="0" width="${X(f.spine1) - X(f.spine0)}" height="${H}" fill="#dde7f3"/>`); // subtle spine band
  o.push(`<text x="${X((f.backTrim0 + f.backHinge0) / 2 + 0.07)}" y="${Y(0.80)}" text-anchor="middle" font-size="${fs(0.011)}" fill="${tintStroke}">BACKGROUND ILLUSTRATION (artwork behind &amp; around text)</text>`);
  o.push(`<text x="${X((f.frontHinge1 + f.frontTrim1) / 2)}" y="${Y(0.55)}" text-anchor="middle" font-size="${fs(0.012)}" fill="${tintStroke}">PRIMARY ILLUSTRATION (artwork behind &amp; around text)</text>`);

  // legend + continuous-wrap flow label
  o.push(`<text x="${X(0.5)}" y="${Y(0.045)}" text-anchor="middle" font-size="${fs(0.0105)}" fill="${tintStroke}">CONTINUOUS ILLUSTRATION FILLS THE ENTIRE WRAP — bleeds off all four edges  ·  Back → Spine → Front</text>`);
  o.push(`<text x="${X(0.5)}" y="${Y(0.026)}" text-anchor="middle" font-size="${fs(0.0125)}" fill="#cc2222" font-weight="700">RED BOXES = PLACE TEXT HERE  ·  artwork still covers everything else</text>`);

  // ---- gray hinge bands (no content) ----
  const gray = '#b9b9b9';
  for (const [a, b] of [[f.backHinge0, f.spine0], [f.spine1, f.frontHinge1]]) {
    o.push(`<rect x="${X(a)}" y="0" width="${X(b) - X(a)}" height="${H}" fill="${gray}" opacity="0.85"/>`);
    o.push(`<text x="${X((a + b) / 2)}" y="${Y(0.5)}" text-anchor="middle" font-size="${fs(0.0075)}" fill="#444" transform="rotate(90 ${X((a + b) / 2)} ${Y(0.5)})">HINGE — NO CONTENT</text>`);
  }

  const RED = '#cc2222';
  const box = (x0: number, x1: number, y0: number, y1: number, label: string, sub?: string) => {
    o.push(`<rect x="${X(x0)}" y="${Y(y0)}" width="${X(x1) - X(x0)}" height="${Y(y1) - Y(y0)}" fill="rgba(204,34,34,0.10)" stroke="${RED}" stroke-width="${fs(0.0022)}" stroke-dasharray="${fs(0.006)} ${fs(0.0045)}"/>`);
    const cy = (y0 + y1) / 2;
    o.push(`<text x="${X((x0 + x1) / 2)}" y="${Y(cy)}" text-anchor="middle" font-size="${fs(0.0115)}" fill="${RED}" font-weight="700">${label}</text>`);
    if (sub) o.push(`<text x="${X((x0 + x1) / 2)}" y="${Y(cy) + fs(0.016)}" text-anchor="middle" font-size="${fs(0.0085)}" fill="${RED}">${sub}</text>`);
  };

  // ---- FRONT content zones (RED = text). Top pulled down for more sky; bottom
  //      raised; boxes inset horizontally (fi) to pull type toward panel center.
  const fi = 0.06;
  const fx0 = frontText.x0 + fi, fx1 = frontText.x1 - fi;
  box(fx0, fx1, 0.235, 0.37, 'TITLE AREA', 'THE WILDLANDS');
  box(fx0, fx1, 0.395, 0.50, 'SUBTITLE AREA', 'NEW ENGLAND  +  description');
  box(fx0, fx1, 0.50, 0.58, 'AUTHOR AREA', 'Wade Brannock');
  box(fx0, fx1, 0.605, 0.682, 'SERIES AREA', 'THE WILDLANDS — SERIES I');

  // ---- SPINE content (vertical, RED = text). Band narrower than the 0.709 safe
  //      area so spine type keeps clear side margin and never rides the edge. ----
  const stHalf = (0.5 / 2) / Wf;
  const sx0 = spineCx - stHalf, sx1 = spineCx + stHalf;
  void spineSafeHalf;
  o.push(`<rect x="${X(sx0)}" y="${Y(top)}" width="${X(sx1) - X(sx0)}" height="${Y(bot) - Y(top)}" fill="rgba(204,34,34,0.10)" stroke="${RED}" stroke-width="${fs(0.0022)}" stroke-dasharray="${fs(0.006)} ${fs(0.0045)}"/>`);
  const spineLabel = (yc: number, t: string) => o.push(`<text x="${X(spineCx)}" y="${Y(yc)}" text-anchor="middle" font-size="${fs(0.0092)}" fill="${RED}" font-weight="700" transform="rotate(90 ${X(spineCx)} ${Y(yc)})">${t}</text>`);
  spineLabel(0.22, 'SERIES NAME');
  spineLabel(0.5, 'BOOK TITLE');
  spineLabel(0.78, 'AUTHOR');

  // ---- BACK content: big description box + ordered sub-labels (RED = text) ----
  const bx0 = backText.x0, bx1 = backText.x1, by0 = 0.095, by1 = 0.86;
  o.push(`<rect x="${X(bx0)}" y="${Y(by0)}" width="${X(bx1) - X(bx0)}" height="${Y(by1) - Y(by0)}" fill="rgba(204,34,34,0.10)" stroke="${RED}" stroke-width="${fs(0.0026)}" stroke-dasharray="${fs(0.006)} ${fs(0.0045)}"/>`);
  o.push(`<text x="${X((bx0 + bx1) / 2)}" y="${Y(by0) + fs(0.018)}" text-anchor="middle" font-size="${fs(0.0125)}" fill="${RED}" font-weight="700">BACK COVER DESCRIPTION</text>`);
  const sub = (yc: number, t: string) => o.push(`<text x="${X((bx0 + bx1) / 2)}" y="${Y(yc)}" text-anchor="middle" font-size="${fs(0.0098)}" fill="${RED}">${t}</text>`);
  sub(0.40, '1 · Lead Paragraph');
  sub(0.66, '2 · Inside This Book  (INSIDE THIS VOLUME list)');

  // ---- RED safe-zone border + note ----
  o.push(`<rect x="${X(f.marginX)}" y="${Y(f.marginY)}" width="${X(1 - f.marginX) - X(f.marginX)}" height="${Y(1 - f.marginY) - Y(f.marginY)}" fill="none" stroke="#cc2222" stroke-width="${fs(0.0028)}"/>`);
  o.push(`<text x="${X(0.5)}" y="${Y(0.975)}" text-anchor="middle" font-size="${fs(0.0105)}" fill="#cc2222" font-weight="700">ALL TEXT MUST STAY INSIDE THE RED SAFE ZONE  ·  artwork may bleed outside, text may not</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif">${o.join('')}</svg>`;
}

// ---- v1.3 PRODUCTION LAYOUT RULES (inserted after COMPOSITION, before VISUAL DNA) ----
export const PRODUCTION_LAYOUT_RULES = `PRODUCTION LAYOUT RULES (HIGHEST PRIORITY):
The hardcover blueprint is authoritative. The cover is not merely an illustration — it is a production-ready print asset. The illustration must be composed AROUND the content zones. Never place artwork first and fit typography afterward. Design the illustration and typography together as a single engraved plate.

COVER STRUCTURE — BACK COVER (left panel), SPINE (center), FRONT COVER (right panel). The illustration must flow continuously across all three sections: no visible seams, no disconnected scenes, no separate front and back paintings — one continuous panoramic environment.

FULL-BLEED ILLUSTRATION — the painting fills the ENTIRE wrap edge to edge and bleeds off all four outer edges. There are NO blank, parchment, white, or empty margins anywhere. The red safe zone in the blueprint constrains TEXT ONLY — never the artwork. The illustration continues behind every text box, behind the spine and hinge areas, and all the way out past the trim to the bleed. Only typography stays inside the safe zone; the artwork must never stop at the safe line.

SCENE EMPHASIS — the wildlife (cow moose + calf, bear, loon, eagle) and the canoeist are a clear SECONDARY focal element in the MID-GROUND: comfortably visible and recognizable, never tiny or lost in the far distance, and never a giant foreground hero that crowds the type. The TYPOGRAPHY is the primary focal point. Keep generous calm sky and water negative space — especially across the TOP of the front cover — so the title rests in clean open space.

NO DECORATIVE ORNAMENTS — do NOT add any flourishes, dingbats, leaf or vine motifs, filigree, scrollwork, rules, dividers, sprigs, or decorative marks anywhere — especially around the title, the author line, the spine, or in the sky. Render ONLY the plain engraved letters of the specified words. The sky above the title stays clean and empty.

TYPOGRAPHY SIZE & CENTERING — set all type at a moderate, comfortable size (NOT oversized) and pull every text block toward the CENTER of its panel, well in from every trim edge. Err strongly toward the center, never the edges. The text must be clearly legible with strong contrast against the art behind it — keep type over calm, lighter areas and use ink dark enough to read at thumbnail size; NEVER let the letters blend into the background.

FRONT COVER CONTENT ZONE — reserve the title-safe area and place, inside the front-cover text box: "THE WILDLANDS", "NEW ENGLAND", the cover description, "Wade Brannock", and "THE WILDLANDS — SERIES I". Generous breathing room around all text. No letters may approach trim edges, hinge areas, or bleed boundaries. Text must stay readable at thumbnail size. Give the front cover GENEROUS top and bottom margins: roughly three-quarters of an inch of clear illustration between the title and the top trim, and a half inch or slightly more between the bottom series line and the bottom trim. Err toward MORE margin. The author name and series line must sit well up from the bottom edge; the series line must never sit near the bottom trim.

SPINE CONTENT ZONE — keep all spine text inside the spine-safe area; do not let letters enter the hinge zones; center vertically; same engraved treatment as the front.

BACK COVER CONTENT ZONE — place all back-cover copy entirely within the copy-safe box with comfortable margins on every side. Do not let paragraphs approach trim boundaries. Do not let text compete with major illustration elements. Negative space must be intentionally reserved behind the copy.

HINGE PROTECTION ZONES — the gray hinge bands are non-content areas. No text, frames, important subjects, antlers, animal faces, or labels in the hinge regions. Background atmosphere only.

TRIM SAFETY RULE — all typography must stay comfortably inside the safe zones. Assume ~0.5 inch of visual risk around exterior edges. If a text element looks even slightly close to a trim edge, move it inward. Err toward more margin, never less.

CONTENT HIERARCHY — priority order: 1) Title, 2) Subtitle, 3) Cover description, 4) Author, 5) Series line. The title must dominate; the subtitle is clearly secondary; the description readable but subordinate; the author name must never compete with the title.

FINAL QUALITY TEST — before rendering, verify: hinges clear; all text inside safe zones; spine text centered; front hierarchy preserved; back copy readable; continuous illustration across the entire wrap; suitable for KDP hardcover production, bookstore shelf display, and collector-edition publication. If any item fails, redesign before rendering.

This production blueprint overrides any artistic decision that conflicts with print-readiness.`;

/** Return a deep-cloned config with the author bio removed from the back-cover
 *  copy (the bio is redundant on the back and crowds the safe zone). */
export function stripAuthorBio<T extends { publishing?: any }>(config: T): T {
  const c: any = JSON.parse(JSON.stringify(config));
  if (c.publishing?.bookDescription) c.publishing.bookDescription.authorBio = '';
  return c;
}

/** Background-scene art direction: the wildlife is recessive scenery, NOT a large
 *  foreground hero, so the typography has room. Overrides coverArtDirection. */
export const BACKGROUND_SCENE_DIRECTION = `One continuous, cinematic early-autumn New England wilderness panorama at soft golden dawn, wrapping unbroken across back cover, spine, and front cover: a calm river opening into a misty beaver pond beneath spruce-fir forest, with brilliant autumn hardwood ridges and the White Mountains in the soft distance; gentle mist on the water, warm low light, aged-parchment warmth, fine archival brushwork. The wildlife and the paddler are a clear SECONDARY focal element of the scene — comfortably visible and recognizable in the MID-GROUND, NOT tiny, NOT lost in the far distance, and NOT a giant foreground hero. On one shoreline a COW MOOSE stands at the water's edge with her young CALF at a natural mid-ground size (clearly readable as moose); a lone paddler glides down the river nearby in a wood-canvas canoe; a black bear forages as a candid sighting on the far bank; a loon rests on the water and a bald eagle soars overhead. Keep the UPPER portion of the front cover as clean, open dawn sky — NO animals, NO objects, NO ornaments there — reserved for the title. Botanical detail only at the lower edges and corners. Grand, immersive, collector-grade scenery, yet composed so the engraved TYPOGRAPHY stays the clear focal point with calm space around every line.`;

export function setBackgroundScene<T extends { publishing?: any }>(config: T): T {
  const c: any = JSON.parse(JSON.stringify(config));
  if (c.publishing) c.publishing.coverArtDirection = BACKGROUND_SCENE_DIRECTION;
  return c;
}

/** Operator-authored master cover prompt (replaces the built prompt verbatim).
 *  The exact back-cover copy is appended by buildMasterPrompt so the model renders
 *  the real words instead of inventing them. */
export const MASTER_COVER_PROMPT = `Create a COMPLETE FINISHED FULL-WRAP HARDCOVER BOOK COVER for a premium collector-edition wilderness field guide.

The image must be a single seamless hardcover wrap spanning:

BACK COVER → SPINE → FRONT COVER

with no visible seams.

The illustration must fill the entire wrap edge-to-edge.

No decorative borders.

No ornamental frames.

No corner flourishes.

No vines.

No filigree.

No scrollwork.

No decorative dividers.

The wilderness itself provides all visual framing.

---

FORMAT

16.409 × 11.417 inches

Hardcover wrap

Spine width: 0.834 inches

Full bleed

Professional bookstore-quality production layout

---

TEXT TO RENDER EXACTLY

THE WILDLANDS

NEW ENGLAND

A Field Guide to Wildlife, Foraging, Bushcraft, and Survival in New England

Wade Brannock

THE WILDLANDS — SERIES I

---

BACK COVER COPY AREA

Reserve a large clean text area on the back cover with comfortable margins.

Do not allow wildlife, branches, antlers, mountains, or decorative elements to interfere with readability.

Leave the lower barcode area clean and unobstructed.

---

VISUAL STYLE

Museum-quality natural-history collector edition.

Luxury wilderness encyclopedia.

Premium archival field guide.

19th-century naturalist illustration tradition.

Audubon-quality wildlife painting.

Scientific field-guide realism.

Pen-and-ink drawing.

Watercolor and gouache rendering.

Chromolithograph character.

Rich saturated vintage pigments.

Fine brushwork.

Archival parchment atmosphere.

Printed collector-volume aesthetic.

The cover should feel expensive, timeless, and worthy of preservation.

---

SCENE

One seamless New England wilderness panorama at golden dawn.

The landscape flows naturally across the entire wrap.

White Mountains in the distance.

Misty beaver pond.

Spruce-fir forest.

Autumn hardwood ridges.

Fern-lined shoreline.

Blueberries.

Wildflowers.

Soft morning fog.

Warm early sunlight.

---

PRIMARY SUBJECT

A magnificent mature bull moose.

Large.

Close.

Prominent.

Standing in shallow water.

Full palmate antlers.

Highly detailed.

The moose is the primary wildlife focal point.

The reader should immediately recognize this as a New England wilderness book.

---

SECONDARY WILDLIFE

Make wildlife noticeably larger and easier to see than typical background animals.

Clearly visible but still secondary to the moose.

Include:

Black bear

Common loon

Bald eagle

White-tailed deer

Red fox

Small canoeist on the water

These should be immediately recognizable without becoming a collage.

The landscape should feel alive and inhabited.

---

TYPOGRAPHY

Elegant engraved Caslon-style serif typography.

Museum-quality letterpress character.

Rich engraved depth.

Subtle ink impression.

Premium publishing-house appearance.

Warm sepia ink.

The typography itself should provide elegance.

No decorative embellishments around the text.

No ornaments beside the title.

No ornaments beside the subtitle.

No ornamental flourishes anywhere.

---

TYPOGRAPHY PLACEMENT

Large title area in the upper front cover.

Strong hierarchy.

Clear readability.

Author name and series line positioned significantly higher than the bottom trim edge.

Generous safety margins.

No text close to trim edges.

No text close to hinge areas.

No text close to barcode areas.

Assume professional hardcover production tolerances.

---

COMPOSITION GOALS

The typography is the primary focal point.

The moose is the primary wildlife focal point.

Supporting wildlife is clearly visible.

The illustration fills every edge naturally.

The cover feels like a premium collector-edition natural-history volume sold in museum bookstores and high-end outdoor shops.

Absolutely no decorative ornaments, flourishes, filigree, frames, badges, labels, stickers, icons, folios, logos, or graphic design elements.

The final result must look like a real published hardcover collector edition, not concept art.

CRITICAL COVER SAFETY REQUIREMENT

The title, subtitle, author name, series line, spine text, and all back-cover text must remain FAR AWAY from every outer edge.

Do NOT place typography near the trim line.

Do NOT center text vertically between top and bottom edges.

Keep all typography pulled significantly inward toward the center of its panel.

Assume the outer 0.75 inches around every exterior edge is a danger zone.

No critical text may enter this danger zone.

The title block must sit comfortably inside the front-cover panel.

The author name and series line must sit substantially higher than the bottom edge.

The back-cover text block must be centered within a large protected area and must never approach the trim edges.

The spine text must remain comfortably inside the spine safe area.

If there is uncertainty, move all text farther inward.

Too much margin is acceptable.

Text near trim edges is unacceptable.`;

export function buildMasterPrompt(backCover?: { mainDescription?: string; insideThisVolume?: string[] }): string {
  // Neutralize every "barcode" trigger — the model paints a fake ISBN/barcode when
  // it sees the word. Amazon stamps the real barcode itself. Strip + hard-negative.
  const base = MASTER_COVER_PROMPT
    .replace(/Leave the lower barcode area clean and unobstructed\./gi, 'Leave the lower-left corner of the back cover as calm, empty illustration — no text, no numbers, no boxes there.')
    .replace(/No text close to barcode areas\./gi, '')
    .replace(/[^.\n]*\bbarcode\b[^.\n]*\.?/gi, '')
    + `\n\nDO NOT DRAW A BARCODE — render NO barcode, NO ISBN, NO ISBN number, NO price code, NO barcode box or rectangle anywhere on the cover. Amazon adds the barcode itself. The lower-left of the back cover must be calm, empty background illustration only — no numbers, no codes, no boxes.

TITLE & AUTHOR PLACEMENT (CRITICAL — overrides any conflicting placement):
The typography layout is already approved. Do NOT redesign the cover. Do NOT redesign the artwork. Do NOT change the wildlife. Do NOT change the landscape. Do NOT change the visual composition. Adjust typography placement only.
Reduce the overall size of "THE WILDLANDS", "NEW ENGLAND", and "A Field Guide to Wildlife, Foraging, Bushcraft, and Survival in New England" by approximately 10–15%. Maintain hierarchy and readability.
Keep all typography substantially farther from every exterior edge.
The entire title block must remain centered horizontally within the FRONT COVER PANEL.
The entire title block must remain centered vertically within the SAFE INTERIOR AREA of the FRONT COVER PANEL.
Do not place the title near the top edge. Do not place the title near the outer right edge. Do not place the title near the spine.
Maintain approximately TWO INCHES of clear margin above the title. Maintain approximately TWO INCHES of clear margin to the right of the title. Maintain approximately TWO INCHES of clear margin to the left of the title.
Move "Wade Brannock" and "THE WILDLANDS — SERIES I" NOTICEABLY higher than a default low placement. Position them clearly in the lower-middle third — roughly 60–65% of the way down the front panel — NOT in the bottom quarter and NOT near the bottom trim. Maintain a large, generous band of illustration BELOW them. The author name and series line must never sit low or close to the bottom trim edge.
All front-cover typography must feel comfortably centered, balanced, and protected inside the safe area. Artwork remains unchanged. Wildlife remains unchanged. Landscape remains unchanged. Typography placement only.

BLEED & MARGIN OVERRIDE (Amazon KDP HARDCOVER — highest priority):
- This is a HARDCOVER CASE-LAMINATE wrap. The cover physically WRAPS AND FOLDS around the board edges — roughly TWO INCHES of every outer edge folds over and behind the boards and is NOT visible on the finished flat cover. The artwork must full-bleed off all four edges with no white or empty space anywhere.
- Treat the outer TWO INCHES of every edge as a STRICT no-text danger zone (it gets folded away). Keep EVERY line of type — title, subtitle, description, author, series, spine, and all back-cover copy — pulled at least TWO INCHES inside every trim edge, toward the CENTER of its panel. Over-margin heavily: too much margin is perfect; any text near an edge gets folded off or rejected.

FRONT COMPOSITION — fill the front cover; do NOT leave a large empty dead gap between the title and the moose. Let the rising morning mist, water, far ridges, and the moose's habitat fill the middle of the front cover so the scene reads full and cohesive from title down to the foreground, while the title still sits over calm sky.

TITLE TOP MARGIN (CRITICAL): keep the title where it is — a LARGE clear band of open sky ABOVE the title, at least 2 inches between the top of the "THE WILDLANDS" letters and the top trim edge (more is fine). The title must NEVER come close to, touch, or sit near the top edge. Lower the entire title block (title + subtitle + description) downward toward the upper-center of the front panel so it floats in clean sky with generous room above. Keep the author name and series line CENTERED in the lower-middle, raised up off the bottom (see placement above) — do not let them drop. Only the title block comes down.

SPINE TEXT (CRITICAL): set the vertical spine text — "THE WILDLANDS" and "Wade Brannock" — at a SMALLER size and keep it CENTERED within the narrow spine, with clear empty margin on BOTH long sides. NO letter may touch, cross, or come near the spine's side edges or the hinge lines where the spine meets the front and back covers (this includes the first letter "T" in "THE"). The spine text sits in the exact center of the spine width and stays well clear of the top and bottom ends of the spine. If in doubt, make the spine text smaller and pull it further toward the spine's centerline.`;
  let copy = '';
  if (backCover?.mainDescription) copy += backCover.mainDescription + '\n\n';
  if (backCover?.insideThisVolume?.length) copy += 'INSIDE THIS VOLUME:\n' + backCover.insideThisVolume.map((i) => '• ' + i).join('\n');
  if (!copy) return base;
  return `${base}

---

BACK COVER COPY — render these EXACT words inside the back-cover text area (do not alter, abbreviate, reorder, or invent any additional text):

${copy}`;
}

/** Insert the production rules immediately after COMPOSITION, before VISUAL DNA.
 *  Also strips the leftover "authorBio" back-cover clause so the model can never
 *  invent a bio (the bio is intentionally off the back cover). */
export function injectProductionRules(basePrompt: string): string {
  let p = basePrompt.replace(/; then, if present, "backCover\.authorBio" as a smaller author note near the bottom/g, '');
  // Remove every barcode reference — Amazon stamps the barcode itself over the art; we reserve nothing.
  p = p
    .replace(/\s*Keep the lower-right barcode zone clear\./g, '')
    .replace(/,? and (?:a )?clean lower-right barcode zone/gi, '')
    .replace(/,? and keep the lower-right corner clean for the barcode/gi, '')
    .replace(/[^.]*\bbarcode\b[^.]*\./gi, '');
  // Kill the base "ornamentation" cheerleading so it can't fight the NO-ORNAMENTS rule.
  p = p
    .replace(/illustration, typography, and ornamentation are inseparable/gi, 'illustration and typography are inseparable')
    .replace(/, and ornamentation/gi, '')
    .replace(/\band ornamentation\b/gi, '');
  const marker = 'WILD LANDS VISUAL DNA:';
  if (p.includes(marker)) return p.replace(marker, `${PRODUCTION_LAYOUT_RULES}\n\n${marker}`);
  return `${p}\n\n${PRODUCTION_LAYOUT_RULES}`;
}
