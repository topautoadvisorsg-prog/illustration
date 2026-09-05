/**
 * A typed doorway onto `adm-zip`, which ships no declarations.
 *
 * Without this every consumer picks up `any` for the zip handle and then
 * `implicitly has an 'any' type` on each callback parameter downstream — five to
 * eight errors per script, none of them about the script. The alternative was
 * adding `@types/adm-zip` as a dependency, which is a heavier change than the
 * two functions actually used here deserve.
 *
 * The cast is confined to this file. Everything above it is typed.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface ZipEntry {
  entryName: string;
  getData(): Buffer;
}

interface AdmZipCtor {
  new (buffer: Buffer): { getEntries(): ZipEntry[] };
}

/** Every entry in a zip archive, in package order. */
export function zipEntries(buffer: Buffer): ZipEntry[] {
  const AdmZip = require('adm-zip') as AdmZipCtor;
  return new AdmZip(buffer).getEntries();
}
