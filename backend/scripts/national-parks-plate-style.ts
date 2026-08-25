/**
 * THE LOCKED PLATE LANGUAGE for 7 NATIONAL PARKS.
 *
 * Held in one place so every interior plate is described by the same words. The
 * five approved plates and the four chapter-end plates added after the proof
 * read are one set, and a set is only a set while nothing has drifted.
 *
 * No side effects: importing this generates nothing and spends nothing.
 */

export const STYLE = [
  'STYLE — hold this exactly:',
  'A black-and-white engraving in the manner of nineteenth-century steel-plate and wood engraving,',
  'in the tradition of Gustave Doré: burin line, dense cross-hatching, dramatic chiaroscuro, deep',
  'velvety shadow against luminous open sky, and a theatrical sense of scale where the landscape',
  'dwarfs any human figure. Fine, disciplined line detail throughout — rock strata, foliage and cloud',
  'all described by line, never by wash.',
  '',
  'PURE BLACK INK ON WHITE. No colour of any kind. No greys, no gradients, no halftone dots, no',
  'airbrush, no digital blur — every tone built from hatching, cross-hatching and stipple, because a',
  'black-and-white book prints line art at a single ink density.',
  '',
  'Serious, elegant and timeless. NOT cartoon, NOT comic-book, NOT modern flat vector, NOT clip art,',
  'NOT photographic, NOT painterly wash. Detailed but READABLE at printed size: the main shapes must',
  'still separate when the plate is only three and a half inches wide.',
].join('\n');

/** A full plate: tall, for a page with several inches of white beneath the text. */
export const COMPOSITION = [
  'COMPOSITION — this is a PORTRAIT plate for a 6x9 book page:',
  'Vertical composition, taller than it is wide, designed for a tall narrow slot. Build the image in',
  'clear depth layers from foreground to far distance so the eye travels up and back through it.',
  'Keep the important subject CENTRED and well inside the frame — nothing critical near the left or',
  'right edge. Leave calm, open space toward the top so the plate breathes and does not read as a',
  'crowded poster.',
].join('\n');

/**
 * A RESTRAINED ENDPIECE, for a chapter ending that faces a strong structural
 * page — a part divider or a back-matter opener. A full portrait plate there
 * competes with the page overleaf, so the endpiece is small, wide and quiet: a
 * closing mark rather than a picture to stop at.
 */
export const ENDPIECE_COMPOSITION = [
  'COMPOSITION — this is a small ENDPIECE closing a chapter, not a full plate:',
  'A wide, shallow horizontal band, roughly 3:2 landscape, designed to sit in the lower half of a',
  '6x9 page beneath the last line of text. Restrained and quiet. One clear silhouette with generous',
  'open white space around it, readable instantly at about three and a half inches wide. Keep the',
  'subject centred and well inside the frame. This closes a chapter; it must not read as a poster.',
].join('\n');

export const FORBIDDEN = [
  'MUST NOT INCLUDE: no text, no letters, no numbers, no caption, no title, no signature, no',
  'monogram, no watermark, no logo, no page number. No decorative border, frame, rule or vignette',
  'box. No colour. No modern objects — no vehicles, no power lines, no signage with writing, no',
  'buildings. No visible faces.',
  '',
  'OUTPUT: white background, image running to the edges of the canvas, no matting and no margins.',
].join('\n');
