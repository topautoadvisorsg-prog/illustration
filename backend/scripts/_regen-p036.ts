import { writeFileSync, renameSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { generateImage } from '../src/services/openai/openai.js';
const OUT = 'C:/Users/jovan/Downloads/before-you-need-it/06-PRODUCTION/illustrations';
const id = 'p036-sequence-not-schedule';
if (existsSync(`${OUT}/${id}.png`)) renameSync(`${OUT}/${id}.png`, `${OUT}/_rejected-${id}-v1.png`);

const prompt = `Black and white editorial diagram for an educational nonfiction book, in a contemporary clear-line style: clean confident linework, flat grey fills, simple uncluttered forms, generous white space. Calm and matter-of-fact. Plain white background, no border, no frame, no shadow, no texture. STRICTLY black, white and grey — no colour. NO text, NO letters, NO numbers, NO labels, NO tick marks, NO ruler marks, NO scale.

SUBJECT: five small solid black circles sitting along one thin horizontal line, spaced DRAMATICALLY UNEVENLY.

The spacing is the entire point and must be unmistakable at a glance:
- the first two circles almost touching, nearly overlapping
- then a very large empty gap, wider than everything else combined
- then two more circles close together
- then another wide gap
- then the last circle alone near the end of the line

Some gaps must be at least six times wider than others. It must be impossible to read the spacing as regular, measured or evenly divided. This diagram says "these happen in this order" and must NEVER look like a timeline, a calendar, a ruler or a measuring scale.`;

const img = await generateImage({ prompt, size: '1536x1024', quality: 'high' });
writeFileSync(`${OUT}/${id}.png`, img.pngBuffer);
writeFileSync(`${OUT}/${id}.prompt.txt`, prompt);
console.log(`regenerated ${id}: ${img.widthPx}x${img.heightPx} sha256 ${createHash('sha256').update(img.pngBuffer).digest('hex').slice(0, 16)}…`);
process.exit(0);
