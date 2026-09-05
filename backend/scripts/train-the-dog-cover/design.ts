/**
 * TRAIN THE DOG YOU'VE GOT — the design, in one editable file.
 *
 * Palette, faces, every placement figure and the back-cover copy. Changing the
 * cover means changing numbers here; it never means touching the geometry, and
 * it never means regenerating artwork. That separation is the entire argument
 * for live type.
 *
 * DIRECTION, from the approved brief: deep saturated blue; a very large,
 * high-contrast title that has to dominate at Amazon thumbnail size; warm
 * yellow/cream/white against the blue; minimal clutter; ages 8-12 without
 * reading preschool.
 */
import type { CopyBlockSpec } from '../../src/pipeline/publishing-standard/cover-copy-column.js';
import type { TextStyle } from './type.js';

/**
 * FACES.
 *
 * Segoe UI throughout, because the interior's display face IS Segoe UI —
 * headings, box titles, labels and folios are all set in it — so the cover and
 * the pages inside agree. Segoe UI Black gives the title real weight without
 * bringing in a face the book has never used.
 *
 * Every one of these is proved to resolve before the build places a glyph. See
 * `assertFontResolves`: librsvg substitutes silently, and a cover set in the
 * wrong typeface looks entirely normal.
 */
export const FACES: Record<string, TextStyle> = {
  title: { family: 'Segoe UI Black', weight: 900, trackingEm: -0.012 },
  subtitle: { family: 'Segoe UI Semibold', weight: 600 },
  author: { family: 'Segoe UI', weight: 700, trackingEm: 0.02 },
  spineTitle: { family: 'Segoe UI Black', weight: 900 },
  spineAuthor: { family: 'Segoe UI Semibold', weight: 600 },
  backCopy: { family: 'Segoe UI', weight: 400 },
};

export const PALETTE = {
  /** Deep saturated blue. The placeholder ground is this exact colour. */
  ground: '#0F3D91',
  titleInk: '#FFFFFF',
  /** Warm yellow, the brief's contrast colour. Carries the subtitle. */
  subtitleInk: '#FFD24A',
  authorInk: '#FFF3D6',
  spineInk: '#FFF3D6',
  backInk: '#F6F1E4',
  /**
   * A dark halo under every glyph, not a panel behind it.
   *
   * On the flat placeholder it is invisible. It exists for the finished
   * artwork, where the author's name and the back copy cross the illustration:
   * a halo keeps the picture whole where a solid strip would punch a hole in
   * it. Semi-transparent so it never reads as an outline.
   */
  halo: 'rgba(6,26,66,0.55)',
} as const;

/**
 * TITLE BREAKS — a real decision, so both are built and compared.
 *
 * The phrase breaks naturally after "dog": TRAIN THE DOG / YOU'VE GOT. That is
 * the better read. But the approved brief names thumbnail dominance as the
 * governing constraint, and a two-line break caps the type at the width of
 * "TRAIN THE DOG", while a three-line break is limited only by "YOU'VE GOT" and
 * comes out substantially larger.
 *
 * Rather than argue it, the build sets both and writes a side-by-side thumbnail
 * with the measured cap height of each. Switching is one word here.
 */
export const TITLE_BREAKS = {
  primary: ['TRAIN', 'THE DOG', "YOU’VE GOT"],
  alternative: ['TRAIN THE DOG', "YOU’VE GOT"],
} as const;

export const LAYOUT = {
  // ── front title ──────────────────────────────────────────────────────────
  /** Top of the title's INK, measured from the top of the wrap. Front safe starts at 0.375in. */
  titleTopIn: 0.85,
  /** Inside the 5.5in front safe width, with room for the halo. */
  titleMeasureIn: 5.2,
  titleMaxCapIn: 0.78,
  titleLeadingEm: 1.02,

  // ── subtitle, hung off the title's measured ink ──────────────────────────
  subtitleLines: [
    'Dog Training for Kids 8–12',
    'Teach Sit, Come and Loose-Leash Walking',
    'Even If You’ve Never Trained a Dog Before',
  ],
  subtitleGapIn: 0.34,
  subtitleMeasureIn: 4.85,
  subtitleMaxCapIn: 0.19,
  subtitleLeadingEm: 1.5,

  // ── author ───────────────────────────────────────────────────────────────
  /**
   * Measured UP from the bottom trim. 1.15in rather than the puberty book's
   * 1.05in: that figure was set for an 8.5in panel and this one is 9in, so the
   * same proportion sits a tenth of an inch higher.
   */
  authorBaselineFromBottomIn: 1.15,
  authorCapIn: 0.3,
  /**
   * Baseline when the name has to sit OVER the picture because the panel has no
   * empty band. Higher than the clear-band figure: it clears the grass edge and
   * the boy's shoe, and keeps the whole name inside the 0.25in safe area.
   */
  authorBaselineFromBottomOverArtIn: 0.62,
  /**
   * How far the author's baseline sits ABOVE THE FRONT SAFE AREA'S bottom edge
   * when the name has to go over the picture.
   *
   * Measured from the SAFE area, not from the panel. On a paperback the safe
   * inset is 0.25in and the two are interchangeable; on a hardcover it is
   * 0.635in, because the case has to allow for the hinge. Deriving from the
   * panel put the name 0.141in outside the hardcover safe area while reporting
   * the paperback as fine. 0.37in covers the descender of "Corley" plus a
   * margin, and reproduces the paperback placement exactly.
   */
  authorFootClearIn: 0.37,
  /** A heavier halo for that case, so white type holds over green grass. */
  authorHaloOverArtEm: 0.16,
  authorMaxWidthIn: 4.0,

  // ── spine ────────────────────────────────────────────────────────────────
  spineGapIn: 0.55,
  /** House margin ABOVE KDP's 0.0625in fold variance. Sizing to the floor leaves nothing for press wander. */
  spineClearanceFactor: 1.2,

  // ── back cover ───────────────────────────────────────────────────────────
  /** Column centred in the back panel: 0.70 + 5.55 = 6.25, and the panel spans 0.125..6.125. */
  backColumnLeftIn: 0.7,
  backColumnRightIn: 5.55,
  backBandTopIn: 0.95,
  backBandBottomIn: 6.55,
  /** Font sizes in inches; 0.167in is 12pt, 0.125in is 9pt. */
  backMaxSizeIn: 0.167,
  backMinSizeIn: 0.125,
  /** Clear space required between the last line of copy and the barcode reserve. */
  backCopyBarcodeGapIn: 0.3,

  /**
   * How far the illustration is slid DOWN the front panel, with the vacated
   * band at the top filled by the artwork's own background colour.
   *
   * Set from the collision that actually happened: at zero shift the treat hand
   * sat at 3.9in and the subtitle ran to 4.4in, so two lines of type crossed the
   * hand and the muzzle. This clears the subtitle with room to spare and costs
   * only the bottom of the dog's chest, which bleeds off the trim anyway.
   */
  artShiftDownIn: 1.15,

  // ── shared ───────────────────────────────────────────────────────────────
  haloEm: 0.1,
  /**
   * The title gets a LIGHTER halo than everything else. At 258px a 0.1em stroke
   * is 26px of dark edge, which stops reading as legibility insurance and
   * starts reading as a deliberate outline. The title is white on deep blue and
   * already has all the contrast it needs; the halo is there only for where it
   * crosses the illustration.
   */
  titleHaloEm: 0.045,
  /**
   * Cap on how much of each side the artwork fit may crop.
   *
   * Generated wrap art comes out nearer 1.50:1 and this wrap is 1.3696:1, so an
   * uncapped fill takes 0.55in off each side — enough to remove a muzzle. With
   * the cap set, the fitter reduces the scale instead and reports what it did.
   */
  maxSideCropIn: 0.3,
} as const;

/**
 * BACK-COVER COPY — DRAFT, FOR APPROVAL. NOT APPROVED TEXT.
 *
 * Written from the manuscript, in the manuscript's own voice: second person,
 * short sentences, honest about limits. The hook is the book's actual opening
 * complaint — nobody ever explains HOW — because that is what the book is for.
 *
 * What it deliberately does NOT do, per instruction and per the book's own
 * standards: no endorsements, no credentials, no claim the author is a trainer
 * (the book's first page says plainly that he is not), no promise about any
 * particular dog, no "guaranteed", no "in just 7 days".
 *
 * The closing italic line is the only part addressed past the child to the
 * adult holding the book in a shop. It states the reading age, says where the
 * behavioural claims come from, and points at the grown-up section that really
 * is in the back matter. Every clause in it is checkable against the interior.
 */
export const BACK_COPY: CopyBlockSpec[] = [
  { kind: 'para', text: 'Nobody tells you how.', bold: true },
  {
    kind: 'para',
    text:
      'They hand you a dog and they say “now you have to train her.” ' +
      'Then they leave you to work it out on your own.',
  },
  { kind: 'para', text: 'This book is the part nobody said.' },
  {
    kind: 'para',
    text:
      'You’ll learn how to get your dog’s attention, and how to teach sit, down, wait and come. ' +
      'How to get things out of their mouth. How to walk down a street without being dragged. ' +
      'And how to read what your dog is telling you with their ears, their tail and their eyes, ' +
      'before anything goes wrong.',
  },
  {
    kind: 'para',
    text: 'You’ll find out what a growl actually means, and why you never tell a dog off for it.',
  },
  {
    kind: 'para',
    text:
      'It’s honest with you the whole way. Every chapter says how long things really take, ' +
      'what your dog might never do, and which problems are not yours to fix. ' +
      'When something needs a grown-up, it says so, and it tells you what to ask for.',
  },
  {
    kind: 'para',
    text:
      'You don’t need a puppy. You don’t need a clever dog. ' +
      'You don’t need to have done this before.',
  },
  { kind: 'para', text: 'Train the dog you’ve got.', bold: true },
  {
    kind: 'para',
    italic: true,
    text:
      'For readers 8–12. Reward-based methods, drawn from the veterinary and professional sources ' +
      'listed at the back. Includes a section for the adult in charge.',
  },
];
