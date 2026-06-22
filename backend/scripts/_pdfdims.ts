/* Print page count + per-page size (inches) of one or more PDFs. Read-only.
 * Usage: _pdfdims.ts <file.pdf> [file2.pdf ...] */
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

for (const f of process.argv.slice(2)) {
  try {
    const doc = await PDFDocument.load(readFileSync(f), { updateMetadata: false });
    const pages = doc.getPages();
    const sizes = new Set(pages.map((p) => `${(p.getWidth() / 72).toFixed(3)}x${(p.getHeight() / 72).toFixed(3)}`));
    console.log(`${f.split(/[\\/]/).pop()} → ${pages.length} page(s); size(s) in: ${[...sizes].join(', ')}`);
  } catch (e) {
    console.log(`${f}: ERROR ${e instanceof Error ? e.message : String(e)}`);
  }
}
process.exit(0);
