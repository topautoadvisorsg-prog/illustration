# Video prompt rules — learned from real attempts

**Owner-supplied, 2026-09-04.** These came out of actually trying image-to-video on illustrated
characters and watching it go wrong. They are not theory. Read this before writing any video
prompt.

---

## The gate

A video prompt is written **against one specific approved still**, never against a scene idea.

```
IMAGE PROMPT
  -> owner review
  -> image render
  -> OWNER APPROVES THE STILL
  -> video prompt
  -> owner review
  -> video render
```

No still, no video prompt. The approved image is the starting frame and the anchor for
everything else.

## What every video prompt must lock

Name the approved still as the first frame, then preserve:

- exact character identities
- exact outfits
- exact Trinkadoos Packs
- **exact character count**
- exact relative positions, unless the movement itself visibly changes them
- exact illustration style
- exact environment

Add only simple, natural motion appropriate to that scene.

## Standing don'ts

These are the observed failure modes, not a wish list:

- no extra characters
- no duplicated characters
- no characters disappearing
- no teleporting
- no sudden position swaps
- no outfit changes
- no style redesign
- no unnecessary new objects
- no unnatural movement speed — normal, natural pace
- simple camera motion only
- preserve the approved illustration

## Why the order matters

State what to **preserve before** what to **move**. The failure mode on illustrated characters is
the model quietly redesigning a face or a costume between frames. A prompt that opens with the
motion invites that; one that opens with the lock drifts less.

Keep motion restrained. The goal is to make the illustration feel alive — not to turn it into
animation, and not to let the video model reinterpret the art.

## A continuity note is not a video prompt

Each image prompt carries a short **Video Continuity Note**. That is a *planning* note only: it
says how the still is staged so motion could begin or continue from it — "walking left to right",
"moving deeper into the cave", "paused just before an action", "scene ending at a threshold".

It is not an animation direction and must never be pasted into a video model as a prompt.

## Image-side rules that make video work later

Set at the image stage, because they cannot be fixed afterwards:

- **No text rendered into the illustration** — no story text, captions, titles, logos, page
  numbers or decorative lettering. Text is added manually afterwards.
- **A real safe zone** in a naturally open part of the composition, holding actual
  environment/background — never a parchment panel or fake blank block painted into the art.
- **Composed as a moment in motion**, not a dead-centre static line-up: natural action poses,
  a direction of travel, guiding lines.
- **Only the characters actually in the scene** get reference images attached.
