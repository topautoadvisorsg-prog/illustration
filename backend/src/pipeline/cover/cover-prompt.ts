/**
 * COVER PROMPT — written for covers, by itself.
 *
 * The cover used to be prompted by `whole-page-render/assemble-page-prompt.ts`,
 * the INTERIOR page assembler. That assembler hardcodes one book class, so the
 * prompt for a full-colour graphic trade cover arrived saying "museum-grade,
 * vintage natural-history field guide", "the page paper is parchment #E0C8A0;
 * all ink is warm sepia #543C24 — never pure black, never colored", and hard
 * negatives forbidding "flat vector", "flat icons" and "sans-serif type
 * anywhere" — every one of which the requested cover style requires. Measured on
 * the real prompt: 6 mentions of parchment and 5 of sepia against 1 of FULL
 * COLOUR, with the contradictions in the most authoritative position.
 *
 * Nothing here is per-book. Identity comes from the production profile and the
 * style DNA; geometry comes from the geometry engine; copy comes from the spec.
 *
 * ─── WHAT THIS PROMPT DOES NOT DO ─────────────────────────────────────────────
 *
 * It does not describe the layout in prose beyond what the blueprint already
 * shows. The blueprint is the spatial authority; the prompt points at it. Saying
 * the same geometry twice, in two notations, is how the two drift apart.
 */
import type { CoverSpec } from './cover-spec.js';
import { asModelPct } from './cover-geometry.js';

const pct = (v: number): string => `${v.toFixed(1)}%`;

/**
 * The negatives that actually belong to a cover, derived from the resolved DNA
 * rather than inherited from a field-guide interior.
 */
function negatives(spec: CoverSpec): string[] {
  const out = [
    'Do NOT draw any guide line, dashed line, red box, tinted panel, label, arrow, measurement, or any other mark from the layout reference. Those exist only to position content.',
    'Do NOT render a barcode, ISBN, price box, or publisher logo. Amazon prints the barcode itself over the artwork after press.',
    'Do NOT leave a blank panel, card, plate, banner, or cutout waiting for text to be added later. There is no later step: whatever type you do not paint will not exist.',
    'Do NOT add page numbers, captions, watermarks, signatures, crop marks, or registration marks.',
    'Do NOT spill any text past the red safe line, and do NOT place text in the dimmed outer band.',
  ];
  if (spec.art.fullColour) {
    out.push(
      'Do NOT render this cover in monochrome, greyscale, duotone, sepia, kraft, or a single-ink treatment. This cover prints in FULL COLOUR.',
    );
  }
  return out;
}

export function buildCoverPrompt(spec: CoverSpec): string {
  const { geometry: g, copy, art } = spec;
  const mc = g.modelCanvas;
  const spine = asModelPct(g.modelPx.spine, mc);
  const back = asModelPct(g.modelPx.backPanel, mc);
  const front = asModelPct(g.modelPx.frontPanel, mc);

  const out: string[] = [];

  // 1. WHAT THIS IS. No book-class language that the profile did not supply.
  out.push(
    'You are designing a complete, FINISHED, print-ready book COVER WRAP: one single continuous image spanning back cover, spine and front cover.',
    'You paint ALL of the cover typography into the artwork yourself. Nothing is added afterwards — the image you produce is the cover.',
    '',
  );

  // 2. THE LAYOUT REFERENCE. It is genuinely attached; the old prompt claimed an
  //    attachment on a text-only call.
  out.push(
    'LAYOUT REFERENCE (attached image) — this is the authority on WHERE everything goes.',
    'The attached image is a production blueprint at exactly the canvas size you are painting. It is NOT artwork and NONE of it may appear in your output.',
    '  • RED DASHED BOXES mark where each piece of text goes. Put that text there.',
    '  • The RED OUTLINE is the safe line. Every letter stays inside it.',
    '  • The DIMMED outer band is physically cropped off and thrown away. Let only background colour and deliberate bleed run into it.',
    '  • The two DASHED VERTICAL LINES are the spine folds. The tinted strip between them is the spine.',
    '  • Labels such as "BACK COVER" and "FRONT COVER" identify the panels. Do not paint those words.',
    '',
  );

  // 3. GEOMETRY, as fractions of the canvas the model is actually painting on.
  //    Inches are meaningless to an image model; percentages of its own canvas
  //    are not.
  out.push(
    'PANEL GEOMETRY — measured on the canvas you are painting, left edge = 0%:',
    `  • BACK COVER  spans ${pct(back.leftPct)} to ${pct(back.leftPct + back.widthPct)} of the width.`,
    `  • SPINE       spans ${pct(spine.leftPct)} to ${pct(spine.leftPct + spine.widthPct)} of the width. It is ONLY ${pct(spine.widthPct)} wide — a narrow strip, not a panel.`,
    `  • FRONT COVER spans ${pct(front.leftPct)} to ${pct(front.leftPct + front.widthPct)} of the width.`,
    `The finished book is ${g.trimIn.widthIn} x ${g.trimIn.heightIn} inches with a ${g.dims.spineIn.toFixed(3)} inch spine at ${g.pageCount} pages.`,
    `The outer ${pct(100 - g.crop.survivingWidthPct)} of the image width is cropped away in total, half from each side.`,
    '',
  );

  // 4. ART DIRECTION. Never printed.
  out.push('ART DIRECTION — how the cover should LOOK. None of this text is printed on the cover.');
  if (art.operatorDirection) out.push(`  ${art.operatorDirection}`);
  out.push(`  Atmosphere: ${art.atmosphere}`, `  Mood: ${art.mood}`, '', art.masterStyleBlock.trim(), '');

  // 5. COPY. The only strings that get painted.
  out.push(
    'COVER COPY — paint these strings EXACTLY, letter for letter. Do not add, remove, translate, summarise, paraphrase or reorder any word. No invented, warped or mirrored glyphs.',
    `  FRONT — TITLE: "${copy.title}"`,
  );
  if (copy.subtitle) out.push(`  FRONT — SUBTITLE: "${copy.subtitle}"`);
  if (copy.coverDescription) out.push(`  FRONT — COVER LINE: "${copy.coverDescription}"`);
  out.push(`  FRONT — AUTHOR: "${copy.author}"`);
  if (copy.seriesLine) out.push(`  FRONT — SERIES: "${copy.seriesLine}"`);

  if (!spec.spineTextAllowed) {
    // KDP's 79-page floor outranks who sets the type. Below it the spine
    // carries nothing at all — the model must not letter it AND code must not
    // typeset it afterwards, which the deterministic branch would otherwise
    // happily do on a 40-page book.
    out.push('  SPINE — NO TEXT. This book is too thin for spine type; keep the spine strip clean artwork.');
  } else if (spec.spineTypeSetBy === 'deterministic') {
    // The single most important instruction in this prompt. The spine is 3% of
    // the canvas; asking the model to letter it has failed every time, and a
    // half-lettered spine is harder to repair than an empty one.
    out.push(
      `  SPINE — LEAVE COMPLETELY EMPTY. Paint NO text, NO letters, NO words, NO numbers, NO logo and NO ornament`,
      `  anywhere in the spine strip (${pct(spine.leftPct)} to ${pct(spine.leftPct + spine.widthPct)} of the width).`,
      '  The spine is a plain, flat, EVEN field of the cover\'s dominant background colour, running the full height,',
      '  with no lettering, no panel, no border, no rule and no change of tone along it. The title and author are',
      '  added to the spine afterwards by the typesetting system, so anything you paint there has to be removed.',
      '  Do NOT draw fold lines, creases, shadows, highlights or edges to indicate where the spine is.',
    );
  } else {
    out.push(
      `  SPINE — TITLE: "${copy.title}"`,
      `  SPINE — AUTHOR: "${copy.author}"`,
      '  Spine text runs along the spine reading top-to-bottom, rotated 90 degrees clockwise, on ONE line each, centred in the strip and clear of both folds.',
      '  If a spine line will not fit at a comfortable size, set it SMALLER. Never stack it onto two lines, never let it touch a fold.',
    );
  }

  if (copy.back?.mainDescription || copy.back?.insideThisVolume?.length || copy.back?.authorBio) {
    out.push('  BACK — in this order:');
    if (copy.back.mainDescription) out.push(`    1. "${copy.back.mainDescription}"`);
    if (copy.back.insideThisVolume?.length) {
      // The heading is functional, not decorative: it tells a browsing reader
      // that the list is what the book covers. The previous render dropped it
      // and the list read as loose bullets with no promise attached.
      out.push(
        '    2. The heading "INSIDE THIS VOLUME" — paint these exact words, as a small',
        '       heading in caps, directly above the list. Then the list, each item on its own line:',
      );
      for (const item of copy.back.insideThisVolume) out.push(`       • "${item}"`);
    }
    if (copy.back.authorBio) out.push(`    3. "${copy.back.authorBio}"`);
    out.push('  Keep the lower-right corner of the back cover quiet and free of type.');
  }
  out.push('');

  // 6. TYPE SAFETY, as NUMBERS from the same geometry the blueprint is drawn
  //    from. Pointing at the reference image was not enough on its own: the
  //    first render put the back-cover paragraphs 0.109in past the trim, which
  //    cuts a character off every line. A picture of a boundary is a weaker
  //    instruction than a picture PLUS the number.
  const safe = asModelPct(g.modelPx.safe, mc);
  const trim = asModelPct(g.modelPx.trim, mc);
  const backSafe = asModelPct(g.modelPx.backSafe, mc);
  const frontSafe = asModelPct(g.modelPx.frontSafe, mc);
  out.push(
    'TYPE SAFETY — these are hard numbers, measured on the canvas you are painting:',
    `  • The book is CUT at ${pct(trim.leftPct)} / ${pct(trim.topPct)} / ${pct(trim.leftPct + trim.widthPct)} / ${pct(trim.topPct + trim.heightPct)} (left/top/right/bottom). Anything past those lines is physically sliced off.`,
    `  • EVERY letter of EVERY word must sit inside ${pct(safe.leftPct)} to ${pct(safe.leftPct + safe.widthPct)} horizontally and ${pct(safe.topPct)} to ${pct(safe.topPct + safe.heightPct)} vertically. This is the red line on the reference.`,
    `  • The BACK-COVER text block starts no further left than ${pct(backSafe.leftPct)} and ends no further right than ${pct(backSafe.leftPct + backSafe.widthPct)}.`,
    `  • The FRONT-COVER text block starts no further left than ${pct(frontSafe.leftPct)} and ends no further right than ${pct(frontSafe.leftPct + frontSafe.widthPct)}.`,
    '  • If copy will not fit inside those bounds, set it SMALLER. Never widen the text block to the panel edge.',
    // The title is the one that breaks this. It is display type, the model sets
    // it to fill its box, and on the last render it overshot the safe line by
    // 0.288in and the trim by 0.038in — the outer letters would have been cut.
    `  • THE TITLE IS THE ONE THAT GOES WRONG. Set it so its longest line ENDS by ${pct(frontSafe.leftPct + frontSafe.widthPct - frontSafe.widthPct * 0.07)} of the width,`,
    '    leaving a visible gap of clear background between the last letter and the red line. Do not let any letter of the title,',
    '    subtitle or author touch or cross that line. If the title is too long to fit with that gap, set it smaller or break it',
    '    onto another line — never let it run wider.',
    '  • Give the author name something to sit on — a shape, band or colour block beneath it — so it does not drift to the bottom edge.',
    '  • Artwork may run past every one of these lines. Type may not.',
    '',
    // CONTAINMENT, not persuasion.
    //
    // Telling a model "stay inside an invisible line" has now failed twice: the
    // title is display type, it is set to fill its space, and there is nothing
    // in the picture telling it where to stop. The author line has never had
    // this problem because it sits on a graphic band — it has a visible thing
    // holding it in. So give the title the same.
    //
    // This is a composition instruction, not a guide mark: the device is REAL
    // artwork that prints, unlike the blueprint.
    'CONTAIN THE TITLE — this is how you keep it off the edge:',
    '  • The title block must sit ON or WITHIN a visible graphic element that is part of the design: a solid colour block,',
    '    a panel, a heavy band, or a bold shape behind the lettering. Not a thin outline, not a decorative frame.',
    '  • That element must itself have clear background on its left and right, well inside the red safe line. The type stops',
    '    where the element stops, and the element stops before the edge does.',
    '  • Use the same graphic language as the rest of the cover — the bold flat bands and blocks already in the art direction.',
    '  • Result: nothing on the front panel is ever floating loose near an edge. Every line of type has something holding it in.',
    '',
    'NEVER:',
    ...negatives(spec).map((s) => `  • ${s}`),
    '',
    'Before you finish, proofread every painted word against COVER COPY above. A cover with one wrong letter is unusable.',
  );

  return out.join('\n');
}
