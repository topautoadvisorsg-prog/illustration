/**
 * MOVE ONE PLATE'S ANCHOR to a different block.
 *
 * An illustration is keyed by the stable id of the block it hangs under, so
 * moving it between pages means re-keying it, not editing a page number. The
 * asset, its size and its approval are carried across untouched.
 *
 *   npx tsx scripts/national-parks-plate-reanchor.ts <fromBlockId> <toBlockId> [--dry]
 */
await import('../src/env.js');
const FROM = process.argv[2];
const TO = process.argv[3];
const DRY = process.argv.includes('--dry');
if (!FROM || !TO) throw new Error('usage: national-parks-plate-reanchor.ts <from> <to> [--dry]');

const P = '92c4ab36-4956-4435-b656-d2679fbc73d9';
const { ProjectConfigSchema } = await import('@wildlands/shared');
const { getProject, updateProjectConfig } = await import('../src/db/repositories/projects.repo.js');
const project = await getProject(P);
const config = ProjectConfigSchema.parse(project!.config);
const ills = config.illustrations;
if (!ills?.[FROM]) throw new Error(`no illustration anchored to ${FROM}`);
if (ills[TO]) throw new Error(`${TO} already carries an illustration; a page holds one plate`);

const moved = ills[FROM]!;
const next = { ...ills };
delete next[FROM];
next[TO] = moved;
console.log(`${moved.approvedAssetPath}`);
console.log(`anchor ${FROM} -> ${TO}   placement ${moved.placementWidthIn} x ${moved.placementHeightIn}in`);
if (DRY) { console.log('\nDRY RUN — nothing written.'); process.exit(0); }
await updateProjectConfig(P, ProjectConfigSchema.parse({ ...config, illustrations: next }));
console.log(`\nwritten. ${Object.keys(next).length} illustrations. Rebuild and check the plate count.`);
process.exit(0);
