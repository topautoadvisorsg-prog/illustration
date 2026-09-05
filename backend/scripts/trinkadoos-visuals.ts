/**
 * THE TRINKADOOS — visual manifest for the video layer.
 *
 * Reads the same hash-locked art brief the interior proof reads, and emits, per
 * title, 16 book visuals + 16 video-only visuals, each with an image prompt, a
 * video prompt and its reference list. Writes JSON for tooling and a review sheet
 * for a person. Renders nothing and spends nothing.
 *
 * Usage: tsx scripts/trinkadoos-visuals.ts [bookNumber ...]     (default: all ten)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  CANON_GUARDS, buildImagePrompt, buildVideoPrompt, charactersInScene, toReviewMarkdown,
  type CharacterRef, type ShotKind, type VisualUnit,
} from './book-to-video.js';
import { BOOK, LOAD_BEARING, TITLES, readArtBrief, type TitleSpec } from './trinkadoos-config.js';

const OUT = `${BOOK}/08-VIDEO-LAYER`;
const CLIP_SECONDS = 8;

/**
 * The cast, and the packs they actually own.
 *
 * CANON, from the art brief: Bram bear, Nico turtle, Tessa unicorn, Sivi butterfly.
 * The delivered character sheet labels three of the four wrongly — it swaps Tessa
 * and Nico, and calls Sivi "Lyra", a name that appears nowhere in the manuscript,
 * the bible or the brief. The DRAWINGS are right and match the palette; only the
 * captions are wrong. The crops below are named for who the child actually is, so
 * a prompt that asks for Nico gets the turtle.
 */
const CAST: CharacterRef[] = [
  { name: 'Bram', ref: 'refs/chars/bram-bear.png' },
  { name: 'Tessa', ref: 'refs/chars/tessa-unicorn.png' },
  { name: 'Nico', ref: 'refs/chars/nico-turtle.png' },
  { name: 'Sivi', ref: 'refs/chars/sivi-butterfly.png' },
  { name: 'Zinumi', ref: 'refs/chars/zinumi.png', aliases: ['fairy', 'the creature spun'] },
];

const STYLE_REF = 'refs/style/trinkadoos-style.png';

interface BriefUnit { key: string; label: string; art: string; text: string[] }

function parseBrief(md: string): Map<number, BriefUnit[]> {
  const byBook = new Map<number, BriefUnit[]>();
  let book = 0;
  let unit: BriefUnit | null = null;
  let inText = false;
  for (const line of md.split('\n')) {
    const b = /^# BOOK (\d+) /.exec(line);
    if (b) { book = Number(b[1]); byBook.set(book, []); unit = null; continue; }
    if (!book) continue;
    // "PAGE 32" before "PAGE 3" — the prefix match silently ate every closer once.
    const u = /^### (PAGE 32|PAGE 3|SPREAD (\d+))(.*)$/.exec(line);
    if (u) {
      const key = u[1] === 'PAGE 3' ? 'P3' : u[1] === 'PAGE 32' ? 'P32' : `S${u[2]}`;
      unit = { key, label: `${u[1]}${u[3]}`.trim(), art: '', text: [] };
      byBook.get(book)!.push(unit);
      inText = false;
      continue;
    }
    if (!unit) continue;
    if (line.startsWith('**TEXT:**')) { inText = true; continue; }
    if (line.startsWith('**ART:**')) { unit.art = line.slice(8).trim(); inText = false; continue; }
    if (inText && line.startsWith('>')) {
      const t = line.slice(1).trim();
      if (t && !t.startsWith('**END OF')) unit.text.push(t);
    }
  }
  return byBook;
}

/** First sentence of an art cue — the scene, before the direction notes. */
const firstSentence = (s: string) => (/^(.*?[.!?])(\s|$)/.exec(s)?.[1] ?? s).trim();

/**
 * Page-layout words are meaningless in a 16:9 shot and actively misleading.
 *
 * The book cue for Book 1 Spread 12 ends "Bram's amber HOLD as the payoff on the
 * right-hand page". Inherited into a video prompt it asks an image model to
 * compose for a right-hand page that does not exist. Video-only scenes are
 * scrubbed of spread vocabulary; the book prompts keep every word.
 */
function forVideoFraming(scene: string): string {
  return scene
    .replace(/\s*(?:as the payoff\s*)?on the (?:right|left)-hand page/gi, '')
    .replace(/\bacross the spread\b/gi, 'across the scene')
    .replace(/\bin one spread\b/gi, 'in one view')
    .replace(/\bthis spread\b/gi, 'this moment')
    .replace(/\bpage-turn\b/gi, 'beat')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

/**
 * Supplemental shots rotate through a four-shot vocabulary.
 *
 * One video-only shot per story unit: it guarantees even coverage across the
 * whole book instead of clustering on the exciting spreads, and it keeps the
 * count honest at 16 + 16 without anyone having to decide 320 times.
 */
const VIDEO_SHOTS: ShotKind[] = ['ESTABLISH', 'CLOSE', 'DETAIL', 'TRANSITION'];

const SHOT_FRAMING: Record<Exclude<ShotKind, 'STORY'>, (scene: string) => string> = {
  ESTABLISH: (s) => `Wide establishing view of the same place, no story action: ${s}`,
  CLOSE: (s) => `Close on the character's face in the same moment: ${s}`,
  DETAIL: (s) => `Close detail of the object that matters in this moment, characters out of frame or blurred behind: ${s}`,
  TRANSITION: (s) => `The travelling beat between moments, seen from behind or at a distance: ${s}`,
};

const MOTION: Record<ShotKind, string> = {
  STORY: 'a slow push in toward the characters, and small natural movement where the scene already implies it',
  ESTABLISH: 'a very slow drift across the scene with slight background parallax',
  CLOSE: 'a small head movement and one blink, breathing visible in the shoulders',
  DETAIL: 'a slow push in on the object, with light shifting gently across it',
  TRANSITION: 'the characters take a few steps away from camera as the light moves',
};

/** Cues that mean all four children are on the page without naming them. */
const GROUP_PHRASES = [
  // Bare "children" earns its place: Book 1 Spread 2 ("Children small against it")
  // and Spread 14 ("Children silhouetted against it, arms up") name nobody, and
  // without it the payoff spread of the book would have been briefed with no
  // character reference attached at all.
  '\\bchildren\\b', 'all four', 'four faces', 'the others', 'the four of them',
  'everybody', 'each pack', 'four sets', 'all of them',
];
const KIDS = ['Bram', 'Tessa', 'Nico', 'Sivi'];

/**
 * Guards are added only where the scene can actually break the rule.
 *
 * The first Book 1 run appended the outfit rule to Zinumi's introduction because
 * the cue mentions her wings. Nothing is being worn in that picture. A guard
 * fired on the wrong page is not harmless — it is one more instruction competing
 * with the scene, so the trigger names garments and packs, never body parts.
 */
function guardsFor(art: string, present: CharacterRef[]): string[] {
  const g: string[] = [];
  if (/\b(pack|packs|outfit|outfits|hood|hoods|boots|dressing|dressed|stor(?:ed|ing)|costume|niche)\b/i.test(art)) {
    g.push(CANON_GUARDS.outfits);
  }
  if (present.some((c) => c.name === 'Zinumi')) g.push(CANON_GUARDS.zinumi);
  return g;
}

function build(spec: TitleSpec, units: BriefUnit[]): VisualUnit[] {
  const out: VisualUnit[] = [];
  units.forEach((u, index) => {
    const present = charactersInScene(u.art, CAST, { groupPhrases: GROUP_PHRASES, groupMembers: KIDS });
    const refs = [STYLE_REF, ...present.map((c) => c.ref)];
    const guards = guardsFor(u.art, present);
    const loadBearing = LOAD_BEARING[`${spec.book}:${u.key}`];
    const id = `TRK-${String(spec.book).padStart(2, '0')}-${u.key}`;

    // 1. The canonical book illustration. Scene text is the brief, verbatim.
    out.push({
      id: `${id}-BOOK`, book: spec.book, unit: u.key, layer: 'book', shot: 'STORY',
      refs,
      imagePrompt: buildImagePrompt({ scene: u.art, mustShow: loadBearing, guards }),
      videoPrompt: buildVideoPrompt(MOTION.STORY, CLIP_SECONDS),
      durationSec: CLIP_SECONDS, status: 'draft',
      note: loadBearing ? 'LOAD-BEARING — the story breaks if this is not in the picture.' : undefined,
    });

    // 2. The supplemental shot. Same place, same characters, different framing.
    const shot = VIDEO_SHOTS[index % VIDEO_SHOTS.length]!;
    out.push({
      id: `${id}-VIDEO`, book: spec.book, unit: u.key, layer: 'video-only', shot,
      refs,
      imagePrompt: buildImagePrompt({
        scene: SHOT_FRAMING[shot as Exclude<ShotKind, 'STORY'>](forVideoFraming(firstSentence(u.art))),
        guards,
      }),
      videoPrompt: buildVideoPrompt(MOTION[shot], CLIP_SECONDS),
      durationSec: CLIP_SECONDS, status: 'draft',
      note: 'Video only. Not a book page and not part of the 32-page pagination.',
    });
  });
  return out;
}

function main() {
  const wanted = process.argv.slice(2).map(Number).filter(Number.isFinite);
  const titles = wanted.length ? TITLES.filter((t) => wanted.includes(t.book)) : TITLES;
  const brief = parseBrief(readArtBrief());
  mkdirSync(`${OUT}/visuals`, { recursive: true });

  let book = 0;
  let video = 0;
  for (const spec of titles) {
    const units = brief.get(spec.book) ?? [];
    const visuals = build(spec, units);
    const stem = `${OUT}/visuals/BOOK-${String(spec.book).padStart(2, '0')}`;
    writeFileSync(`${stem}.visuals.json`, `${JSON.stringify({ book: spec.book, title: spec.title, clipSeconds: CLIP_SECONDS, visuals }, null, 2)}\n`);
    writeFileSync(`${stem}.review.md`, toReviewMarkdown(`Book ${spec.book} — ${spec.title}`, visuals));
    book += visuals.filter((v) => v.layer === 'book').length;
    video += visuals.filter((v) => v.layer === 'video-only').length;
    console.log(`BOOK ${spec.book}  ${spec.title}`);
    console.log(`  ${visuals.length} visuals (${visuals.filter((v) => v.layer === 'book').length} book + ${visuals.filter((v) => v.layer === 'video-only').length} video-only)  ->  ${stem.split('/').pop()}.{json,review.md}`);
  }
  console.log(`\ntotal ${book + video} visuals  ${book} book  ${video} video-only  ${(book + video) * CLIP_SECONDS}s of clip`);
  console.log('nothing rendered, nothing spent');
}

main();
