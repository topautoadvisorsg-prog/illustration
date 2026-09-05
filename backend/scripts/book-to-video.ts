/**
 * BOOK-TO-VIDEO LAYER — reusable across titles, not a Trinkadoos hack.
 *
 * A printed picture book already has one visual per page unit. A video edition
 * wants roughly twice that: the canonical book illustrations, plus supplemental
 * shots that exist only in the video. This module holds the shared shape of a
 * visual unit and the two prompt templates. A per-book driver supplies the
 * story units, the character map and the style reference; nothing here knows
 * anything about a particular book.
 *
 * PRINT PAGINATION IS NOT TOUCHED. Video-only units carry `layer: 'video-only'`
 * and never appear in a page plan. The interior proof and this manifest read the
 * same source and cannot disagree about what the book is.
 *
 * NOTHING HERE RENDERS OR SPENDS. It writes prompts for a human to read. Render
 * happens elsewhere, after approval.
 */

/** Small, fixed vocabulary. A bigger one just makes review slower. */
export type ShotKind = 'STORY' | 'ESTABLISH' | 'CLOSE' | 'DETAIL' | 'TRANSITION';

export type VisualLayer = 'book' | 'video-only';

export type ReviewStatus = 'draft' | 'approved' | 'image-rendered' | 'video-rendered';

export interface VisualUnit {
  /** Stable across regeneration, e.g. TRK-01-S03-VIDEO. */
  id: string;
  book: number;
  /** The story unit this hangs off: P3, S1..S14, P32. Video-only units share the parent's. */
  unit: string;
  layer: VisualLayer;
  shot: ShotKind;
  /** Style reference first, then only the characters actually in the scene. */
  refs: string[];
  imagePrompt: string;
  videoPrompt: string;
  durationSec: number;
  status: ReviewStatus;
  /** Why this shot exists, for the reviewer. Never sent to a model. */
  note?: string;
}

export interface CharacterRef {
  name: string;
  /** Path to the reference crop. */
  ref: string;
  /** Words in an art cue that mean this character is present. */
  aliases?: string[];
}

/**
 * The one standing rule set, appended only when the scene can break it.
 *
 * Kept to a single short line because the brief already describes the scene and
 * a long tail of prohibitions makes an image model worse, not better. These two
 * are here because they are the series' hard canon and the cheapest to violate:
 * outfits are physically worn and never materialise, and Zinumi has no words.
 */
export const CANON_GUARDS = {
  outfits: 'Outfits and packs are real clothing, physically worn — never glowing on or materialising.',
  zinumi: 'Zinumi never speaks: no speech bubbles, no lettering.',
} as const;

/**
 * Which characters a cue actually mentions.
 *
 * Name matching alone is not enough, and Book 1 proved it on the first run. The
 * opener says "Establish all four children … Sivi mid-skid, the others piling up
 * behind her" — one name, four children on the page — so a name-only match
 * attached one reference and the render would have had three children invented
 * from nothing. `groupPhrases` catches the cues that mean everybody without
 * listing anybody.
 */
export function charactersInScene(
  text: string,
  cast: CharacterRef[],
  options: { groupPhrases?: string[]; groupMembers?: string[] } = {},
): CharacterRef[] {
  const named = new Set(
    cast
      .filter((c) => [c.name, ...(c.aliases ?? [])].some((w) => new RegExp(`\\b${w}\\b`, 'i').test(text)))
      .map((c) => c.name),
  );
  const isGroup = (options.groupPhrases ?? []).some((p) => new RegExp(p, 'i').test(text));
  if (isGroup) for (const m of options.groupMembers ?? []) named.add(m);
  return cast.filter((c) => named.has(c.name));
}

/**
 * IMAGE PROMPT — style reference + the characters in the scene + what is happening.
 *
 * Deliberately close to plain English. The scene sentence comes from the art
 * brief, which is already written the way a person would describe a picture, so
 * rewriting it into keyword soup would lose the thing that makes it good. Pose,
 * expression and camera are left to the model unless the story genuinely needs
 * them pinned, which is what `mustShow` is for.
 */
export function buildImagePrompt(input: {
  scene: string;
  mood?: string;
  /** The one story detail that has to be visible. Omit when there isn't one. */
  mustShow?: string;
  guards?: string[];
}): string {
  const parts = [input.scene.trim().replace(/\s+/g, ' ')];
  if (input.mood) parts.push(`Mood: ${input.mood}.`);
  if (input.mustShow) parts.push(`Must be visible: ${input.mustShow}`);
  if (input.guards?.length) parts.push(input.guards.join(' '));
  return parts.join(' ');
}

/**
 * VIDEO PROMPT — the finished still is the anchor; add only the named motion.
 *
 * The preservation clause comes first and is identical on every shot. That is
 * the point: the failure mode of image-to-video on illustrated characters is the
 * model redesigning a face or a costume between frames, and a shot that says
 * what to keep before it says what to move drifts less than one that opens with
 * a camera move.
 */
export function buildVideoPrompt(motion: string, durationSec = 8): string {
  return [
    'Animate the attached still image.',
    'Keep the characters, their clothing and packs, the art style, the background and the composition exactly as they are in the image.',
    `Motion: ${motion.trim().replace(/\s+$/, '').replace(/\.$/, '')}.`,
    'Subtle 2D motion only. Do not add or remove characters or objects, do not redesign anything, no large camera moves.',
    `About ${durationSec} seconds.`,
  ].join(' ');
}

/** Renders a manifest as a review sheet a person can read without opening JSON. */
export function toReviewMarkdown(title: string, units: VisualUnit[]): string {
  const book = units.filter((u) => u.layer === 'book').length;
  const video = units.filter((u) => u.layer === 'video-only').length;
  const lines: string[] = [
    `# ${title} — visual review sheet`,
    '',
    `${units.length} visuals · **${book} book** · **${video} video-only** · ${units.reduce((n, u) => n + u.durationSec, 0)}s of clip at ${units[0]?.durationSec ?? 8}s each`,
    '',
    'Nothing here has been rendered. Approve or edit, then render.',
    '',
  ];
  for (const u of units) {
    lines.push(`## ${u.id} · ${u.unit} · ${u.layer.toUpperCase()} · ${u.shot}`);
    if (u.note) lines.push(`*${u.note}*`);
    lines.push('');
    lines.push(`**Refs:** ${u.refs.map((r) => `\`${r}\``).join(' + ')}`);
    lines.push('');
    lines.push(`**Image prompt**`);
    lines.push('```');
    lines.push(u.imagePrompt);
    lines.push('```');
    lines.push(`**Video prompt** (${u.durationSec}s)`);
    lines.push('```');
    lines.push(u.videoPrompt);
    lines.push('```');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
