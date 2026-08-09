/**
 * REWRITE THE `name` TABLE OF AN sfnt FONT, AND NOTHING ELSE.
 *
 * ─── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * Google Fonts serves Archivo, EB Garamond and friends as VARIABLE fonts. One
 * binary per family+style carries a `wght` axis, and the stylesheet repeats that
 * same binary under `font-weight: 400`, `500` and `600` — the browser pins the
 * axis from the `@font-face` descriptor. That works perfectly for a webfont and
 * falls apart the moment the face becomes a system font, because the pinning
 * descriptor is exactly what we are removing.
 *
 * Worse, the sliced binaries carry the WRONG NAME. Archivo's `name` table says
 * family "Archivo SemiBold" with no typographic-family record, so fontconfig
 * never exposes a family called "Archivo" and `font-family: Archivo` matches
 * nothing — Chromium would silently fall back to DejaVu Sans for every heading
 * in the book. EB Garamond happens to be named correctly, which is the only
 * reason the two behave differently. Verified with `fc-list` inside the render
 * image, not assumed.
 *
 * So the derived faces need their identity repaired. The repair must touch the
 * `name` table ONLY: `glyf`, `loca`, `hmtx`, `head`, `fvar`, `gvar`, `HVAR` and
 * the rest are copied byte-for-byte, which is what keeps glyph outlines and
 * metrics identical and pagination immovable. `tableDigests()` exists so callers
 * can prove that rather than trust it, and `deriveTtf` asserts it on every run.
 *
 * `head.checkSumAdjustment` is the one unavoidable exception: it is a checksum
 * over the whole file, so it necessarily changes when any table does.
 */
import { createHash } from 'node:crypto';

/** The four bytes at the head of every sfnt we accept. */
const TRUETYPE_TAG = 0x00010000;

export interface NameOverrides {
  /** nameID 1 — the family fontconfig reports and CSS matches against. */
  family: string;
  /** nameID 2 — RIBBI subfamily. Only "Regular"/"Italic" are used here. */
  subfamily: string;
}

interface TableRecord {
  tag: string;
  checkSum: number;
  offset: number;
  length: number;
}

function readTableDirectory(buf: Buffer): TableRecord[] {
  if (buf.length < 12) throw new Error('not an sfnt: shorter than the offset table');
  const version = buf.readUInt32BE(0);
  if (version !== TRUETYPE_TAG) {
    throw new Error(`unsupported sfnt version 0x${version.toString(16)} (expected TrueType outlines)`);
  }
  const numTables = buf.readUInt16BE(4);
  const tables: TableRecord[] = [];
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    tables.push({
      tag: buf.toString('latin1', rec, rec + 4),
      checkSum: buf.readUInt32BE(rec + 4),
      offset: buf.readUInt32BE(rec + 8),
      length: buf.readUInt32BE(rec + 12),
    });
  }
  return tables;
}

/** sha256 of every table's bytes, keyed by tag. The equality proof for callers. */
export function tableDigests(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of readTableDirectory(buf)) {
    out[t.tag] = createHash('sha256').update(buf.subarray(t.offset, t.offset + t.length)).digest('hex');
  }
  return out;
}

interface NameRecord {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  value: Buffer;
}

/** Encode a string the way the given platform expects it. */
function encodeForPlatform(platformID: number, value: string): Buffer {
  if (platformID === 3) {
    // Windows: UTF-16BE.
    const le = Buffer.from(value, 'utf16le');
    return Buffer.from(le).swap16();
  }
  // Macintosh (platform 1) and anything else: MacRoman, of which ASCII is a
  // subset. Font family names outside ASCII would need a real encoder; refuse
  // rather than write mojibake into a print master.
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(value)) {
    throw new Error(`cannot encode "${value}" for platform ${platformID}: non-ASCII family names are unsupported`);
  }
  return Buffer.from(value, 'latin1');
}

function parseNameTable(buf: Buffer, table: TableRecord): NameRecord[] {
  const base = table.offset;
  const format = buf.readUInt16BE(base);
  if (format !== 0) {
    // Format 1 adds language-tag records whose indices we would have to remap.
    // Nothing we vendor uses it, so refuse loudly instead of guessing.
    throw new Error(`name table format ${format} is not supported (expected 0)`);
  }
  const count = buf.readUInt16BE(base + 2);
  const storage = base + buf.readUInt16BE(base + 4);
  const records: NameRecord[] = [];
  for (let i = 0; i < count; i++) {
    const r = base + 6 + i * 12;
    const length = buf.readUInt16BE(r + 8);
    const offset = buf.readUInt16BE(r + 10);
    records.push({
      platformID: buf.readUInt16BE(r),
      encodingID: buf.readUInt16BE(r + 2),
      languageID: buf.readUInt16BE(r + 4),
      nameID: buf.readUInt16BE(r + 6),
      value: Buffer.from(buf.subarray(storage + offset, storage + offset + length)),
    });
  }
  return records;
}

/** Serialise name records back into a format-0 table. */
function buildNameTable(records: NameRecord[]): Buffer {
  const sorted = [...records].sort(
    (a, b) =>
      a.platformID - b.platformID ||
      a.encodingID - b.encodingID ||
      a.languageID - b.languageID ||
      a.nameID - b.nameID,
  );
  const header = Buffer.alloc(6 + sorted.length * 12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(sorted.length, 2);
  header.writeUInt16BE(header.length, 4);

  const storage: Buffer[] = [];
  let cursor = 0;
  sorted.forEach((rec, i) => {
    const r = 6 + i * 12;
    header.writeUInt16BE(rec.platformID, r);
    header.writeUInt16BE(rec.encodingID, r + 2);
    header.writeUInt16BE(rec.languageID, r + 4);
    header.writeUInt16BE(rec.nameID, r + 6);
    header.writeUInt16BE(rec.value.length, r + 8);
    header.writeUInt16BE(cursor, r + 10);
    storage.push(rec.value);
    cursor += rec.value.length;
    if (cursor > 0xffff) throw new Error('name table storage exceeds the 16-bit offset field');
  });

  return Buffer.concat([header, ...storage]);
}

/** sfnt table checksum: sum of big-endian uint32s, zero-padded to 4 bytes. */
function checksum(data: Buffer): number {
  const padded = data.length % 4 === 0 ? data : Buffer.concat([data, Buffer.alloc(4 - (data.length % 4))]);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

/**
 * Return `font` with its `name` table replaced. Every other table is copied
 * verbatim; only `head.checkSumAdjustment` is recomputed, because it is a
 * checksum over the whole file.
 */
export function rewriteFontNames(font: Buffer, overrides: NameOverrides): Buffer {
  const { family, subfamily } = overrides;
  // Checked up front rather than at encode time: whether a font happens to
  // carry Macintosh name records is not a property we want deciding which
  // family names are legal. These faces carry Windows records only.
  // eslint-disable-next-line no-control-regex
  const nonAscii = [family, subfamily].find((v) => /[^\x00-\x7F]/.test(v));
  if (nonAscii !== undefined) {
    throw new Error(`cannot use "${nonAscii}": non-ASCII family names are unsupported`);
  }
  const full = subfamily.toLowerCase() === 'regular' ? family : `${family} ${subfamily}`;
  const postScript = `${family.replace(/\s+/g, '')}-${subfamily.replace(/\s+/g, '')}`;

  // nameID -> replacement. 1/2 are what fontconfig and CSS matching read; 4 and
  // 6 are kept consistent so tooling that prefers them agrees with the rest.
  const replacements = new Map<number, string>([
    [1, family],
    [2, subfamily],
    [4, full],
    [6, postScript],
  ]);

  const tables = readTableDirectory(font);
  const nameTable = tables.find((t) => t.tag === 'name');
  if (!nameTable) throw new Error('font has no name table');

  const records = parseNameTable(font, nameTable);
  const seen = new Set<string>();
  const rewritten: NameRecord[] = [];
  for (const rec of records) {
    const replacement = replacements.get(rec.nameID);
    if (replacement === undefined) {
      rewritten.push(rec);
      continue;
    }
    // Collapse the per-language duplicates the sliced fonts carry: one record
    // per (platform, encoding, nameID) is all a family identity needs, and
    // leaving stale localised variants behind lets fontconfig pick a name we
    // did not intend.
    const key = `${rec.platformID}/${rec.encodingID}/${rec.nameID}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rewritten.push({ ...rec, value: encodeForPlatform(rec.platformID, replacement) });
  }

  const newName = buildNameTable(rewritten);

  // Re-emit the font, preserving directory order. Table data is 4-byte aligned,
  // as the spec requires and as some rasterisers assume.
  const ordered = [...tables].sort((a, b) => a.offset - b.offset);
  const dirSize = 12 + tables.length * 16;
  const chunks: { rec: TableRecord; data: Buffer }[] = [];
  for (const t of ordered) {
    const data = t.tag === 'name' ? newName : font.subarray(t.offset, t.offset + t.length);
    chunks.push({ rec: t, data: Buffer.from(data) });
  }

  let offset = dirSize;
  const layout = new Map<string, { offset: number; length: number; checkSum: number }>();
  const body: Buffer[] = [];
  for (const { rec, data } of chunks) {
    layout.set(rec.tag, {
      offset,
      length: data.length,
      checkSum: rec.tag === 'name' ? checksum(data) : rec.checkSum,
    });
    body.push(data);
    const pad = (4 - (data.length % 4)) % 4;
    if (pad) body.push(Buffer.alloc(pad));
    offset += data.length + pad;
  }

  const out = Buffer.alloc(offset);
  out.writeUInt32BE(TRUETYPE_TAG, 0);
  out.writeUInt16BE(tables.length, 4);
  // searchRange / entrySelector / rangeShift, per the sfnt spec.
  const entrySelector = Math.floor(Math.log2(tables.length));
  const searchRange = 16 * 2 ** entrySelector;
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(tables.length * 16 - searchRange, 10);

  // The directory itself stays in the original (tag-sorted) order.
  tables.forEach((t, i) => {
    const l = layout.get(t.tag)!;
    const rec = 12 + i * 16;
    out.write(t.tag, rec, 4, 'latin1');
    out.writeUInt32BE(l.checkSum, rec + 4);
    out.writeUInt32BE(l.offset, rec + 8);
    out.writeUInt32BE(l.length, rec + 12);
  });
  let cursor = dirSize;
  for (const part of body) {
    part.copy(out, cursor);
    cursor += part.length;
  }

  // head.checkSumAdjustment = 0xB1B0AFBA - checksum(whole file with the field
  // zeroed). It covers every byte, so it cannot survive a table change.
  const head = layout.get('head');
  if (head) {
    out.writeUInt32BE(0, head.offset + 8);
    const adjustment = (0xb1b0afba - checksum(out)) >>> 0;
    out.writeUInt32BE(adjustment, head.offset + 8);
  }

  return out;
}

/** Read back nameID 1 and 2, so callers can verify the rewrite took. */
export function readFontNames(font: Buffer): { family: string; subfamily: string } {
  const tables = readTableDirectory(font);
  const nameTable = tables.find((t) => t.tag === 'name');
  if (!nameTable) throw new Error('font has no name table');
  const records = parseNameTable(font, nameTable);
  const pick = (nameID: number): string => {
    const win = records.find((r) => r.platformID === 3 && r.nameID === nameID);
    if (win) return Buffer.from(win.value).swap16().toString('utf16le');
    const any = records.find((r) => r.nameID === nameID);
    return any ? any.value.toString('latin1') : '';
  };
  return { family: pick(1), subfamily: pick(2) };
}
