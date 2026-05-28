/**
 * Spike 2 Step A — Load Hand-Authored Page Manifest
 *
 * Real Stage 1.5 will use Claude to generate page manifests from the manuscript.
 * For the vertical slice, we use a hand-authored manifest at
 * spikes/fixtures/chanterelle.manifest.json and validate it against a Zod schema
 * that mirrors what production will use.
 *
 * This step needs NO API keys.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// -----------------------------------------------------------------------------
// Page manifest schema — provisional v0. Will be moved to @wildlands/shared
// in Phase 1 and become the canonical schema.
// -----------------------------------------------------------------------------

const IllustrationSchema = z.object({
  subject: z.string().min(20, 'subject too short — must describe the scene'),
  size_hint: z.string(),
  secondary_subject: z.string().nullable(),
  annotations: z.array(z.string()).max(5, 'max 5 annotations per image'),
  warning: z.boolean(),
  warning_subject: z.string().nullable(),
});

const SectionSchema = z.object({
  header: z.string(),
  body: z.string(),
});

const BodyTextSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  intro: z.string(),
  sections: z.array(SectionSchema),
});

export const PageManifestSchema = z.object({
  manifest_id: z.string().regex(/^[A-Z0-9_]+_P\d{3}$/, 'manifest_id format'),
  book_id: z.string(),
  brand: z.enum(['THE_WILDLANDS', 'WILD_BACK_COUNTRY', 'THE_WILD_REGION']),
  page_number: z.number().int().positive(),
  chapter_number: z.number().int().nonnegative(),
  chapter_name: z.string(),
  page_type: z.enum([
    'SPECIES_ENTRY',
    'CHAPTER_OPENER',
    'BACK_MATTER_TABLE',
    'TECHNICAL_DIAGRAM',
    'TRACK_OR_HABITAT',
    'TREE_OR_TALL_PLANT',
    'INTRO',
  ]),
  entry_name: z.string(),
  scientific_name: z.string().nullable(),
  word_count: z.number().int().positive(),
  layout_template: z.enum([
    'LAYOUT_1_STANDARD',
    'LAYOUT_2_TEXT_HEAVY',
    'LAYOUT_3_ILLUSTRATION_DOMINANT',
    'LAYOUT_4_DANGER_WARNING',
    'LAYOUT_5_CHAPTER_OPENER',
    'LAYOUT_6_BACK_MATTER',
    'LAYOUT_7_SCATTERED_VIGNETTES',
    'LAYOUT_8_MARGIN_ILLUSTRATION',
    'LAYOUT_9_DIAGNOSTIC_DIAGRAM',
  ]),
  zone_tags: z.array(z.string()),
  is_danger_page: z.boolean(),
  has_lookalike: z.boolean(),
  lookalike_name: z.string().nullable(),
  illustration: IllustrationSchema,
  body_text: BodyTextSchema,
  warning_elements: z.string().nullable(),
  continuation_page: z.boolean(),
  status: z.enum(['PENDING', 'GENERATED', 'APPROVED', 'UPSCALED', 'LAID_OUT', 'COMPLETE']),
});

export type PageManifest = z.infer<typeof PageManifestSchema>;

// -----------------------------------------------------------------------------

export async function stepA_loadManifest(fixturePath?: string): Promise<PageManifest> {
  const finalPath =
    fixturePath ?? path.join(REPO_ROOT, 'spikes/fixtures/chanterelle.manifest.json');
  const raw = await readFile(finalPath, 'utf8');
  const json: unknown = JSON.parse(raw);
  const parsed = PageManifestSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Manifest validation failed for ${finalPath}:\n${issues}`);
  }
  return parsed.data;
}

// Standalone runner
if (import.meta.url === `file://${process.argv[1]}`) {
  stepA_loadManifest()
    .then((m) => {
      // eslint-disable-next-line no-console
      console.log(`✓ Step A — loaded manifest ${m.manifest_id} (${m.entry_name}, ${m.word_count} words, layout=${m.layout_template})`);
    })
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(`✗ Step A — ${(e as Error).message}`);
      process.exit(1);
    });
}
