/**
 * Repair storage keys written with OS separators.
 *
 * Rows written before `LocalStorageService` normalised its keys hold
 * `<id>\cover\...`. The read path tolerates those, but the CONSOLE cannot: it
 * puts the key in a URL, and the file route rejects a backslash with a 400, so
 * the asset is invisible in review. Normalising the stored keys is what makes
 * existing books reviewable again.
 *
 * Touches only the separator. No file is moved, renamed, or deleted.
 *
 *   yarn tsx scripts/repair-storage-keys.ts          # report
 *   yarn tsx scripts/repair-storage-keys.ts --write
 */
import { listProjects, updateProjectConfig, setManuscript, getProject } from '../src/db/repositories/projects.repo.js';
import { ProjectConfigSchema } from '@wildlands/shared';

const WRITE = process.argv.includes('--write');
/** Built from its codepoint: a literal backslash does not survive every
 *  heredoc and editor round trip, and a mangled one silently breaks the repair. */
const BACKSLASH = String.fromCharCode(92);
const fix = (s?: string | null): string | undefined =>
  s ? s.split(BACKSLASH).join('/') : undefined;
let touched = 0;

for (const row of await listProjects()) {
  const project = await getProject(row.id);
  if (!project) continue;
  const notes: string[] = [];

  const mp = fix(project.manuscriptPath);
  const cmp = fix(project.canonicalManuscriptPath);
  if (mp && mp !== project.manuscriptPath) notes.push(`manuscriptPath -> ${mp}`);
  if (cmp && cmp !== project.canonicalManuscriptPath) notes.push(`canonicalManuscriptPath -> ${cmp}`);

  const config = ProjectConfigSchema.parse(project.config);
  const versions = config.publishing?.coverVersions ?? [];
  const fixedVersions = versions.map((v) => ({ ...v, assetPath: fix(v.assetPath) ?? v.assetPath }));
  const coverChanged = fixedVersions.some((v, i) => v.assetPath !== versions[i]!.assetPath);
  if (coverChanged) notes.push(`${versions.length} cover version key(s)`);

  // `publishing.coverAssetPath` is what the console actually renders as the
  // current cover — the versions array is only the history. Repairing the
  // history alone left the visible cover still pointing at a backslash key.
  const coverAsset = fix(config.publishing?.coverAssetPath);
  const coverAssetChanged = Boolean(coverAsset && coverAsset !== config.publishing?.coverAssetPath);
  if (coverAssetChanged) notes.push(`coverAssetPath -> ${coverAsset}`);

  const illus = config.illustrations ?? {};
  const fixedIllus = Object.fromEntries(
    Object.entries(illus).map(([k, v]) => [k, { ...v, rawAssetPath: fix(v.rawAssetPath) ?? v.rawAssetPath, approvedAssetPath: fix(v.approvedAssetPath) ?? v.approvedAssetPath }]),
  );
  const illusChanged = JSON.stringify(fixedIllus) !== JSON.stringify(illus);
  if (illusChanged) notes.push(`${Object.keys(illus).length} illustration key(s)`);

  if (!notes.length) { console.log(`  OK    ${project.title}`); continue; }
  touched++;
  console.log(`  FIX   ${project.title}`);
  for (const n of notes) console.log(`          ${n}`);

  if (!WRITE) continue;
  if (coverChanged || illusChanged || coverAssetChanged) {
    await updateProjectConfig(project.id, {
      ...config,
      illustrations: fixedIllus,
      publishing: {
        ...config.publishing,
        coverVersions: fixedVersions,
        ...(coverAsset ? { coverAssetPath: coverAsset } : {}),
      },
    } as never);
  }
  if (mp && cmp) {
    await setManuscript(project.id, {
      manuscriptPath: mp,
      manuscriptSha256: project.manuscriptSha256!,
      canonicalManuscriptPath: cmp,
      canonicalManuscriptSha256: project.canonicalManuscriptSha256!,
      manuscriptSanitized: project.manuscriptSanitized ?? true,
    });
  }
}
console.log(`\n${touched} project(s) needed repair.${WRITE ? ' Written.' : ' Dry run — re-run with --write.'}`);
process.exit(0);
