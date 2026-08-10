/**
 * Read back what a finished PDF actually contains.
 *
 * Everything here inspects the OUTPUT rather than the inputs that produced it.
 * The defects this catches — a Type3 face, a page that is the wrong size, a
 * missing TrimBox — are all cases where the pipeline reported success and the
 * file was still unprintable.
 *
 * The font walk is the one from `scripts/font-embed-probe.ts`, which was
 * written to settle the Type3 question and then left in a script where nothing
 * on the delivery path could call it. Reading /BaseFont out of the raw bytes,
 * or asking pdf.js for family names, both give the wrong answer here: only the
 * object graph says whether a font program is embedded.
 */
import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';

// PDFDict's constructor is protected, so InstanceType cannot name it.
type Dict = PDFDict;

export interface PdfFontUse {
  /** PDF font subtype: Type0 is a CID subset, Type3 is glyph procedures. */
  subtype: string;
  baseFont: string;
  /** True when an actual font program (FontFile/2/3) is present. */
  embedded: boolean;
}

export interface PdfFacts {
  pageCount: number;
  /** Distinct page sizes in inches, with how many pages have each. */
  pageSizesIn: { widthIn: number; heightIn: number; pages: number }[];
  /** Distinct TrimBoxes in inches. Empty when no page declares one. */
  trimBoxesIn: { xIn: number; yIn: number; widthIn: number; heightIn: number; pages: number }[];
  fonts: PdfFontUse[];
  bytes: number;
}

const inches = (pt: number): number => Math.round((pt / 72) * 10000) / 10000;

export async function inspectPdf(pdf: Buffer): Promise<PdfFacts> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });

  const sizes = new Map<string, { widthIn: number; heightIn: number; pages: number }>();
  const trims = new Map<string, { xIn: number; yIn: number; widthIn: number; heightIn: number; pages: number }>();
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const sk = `${inches(width)}x${inches(height)}`;
    const s = sizes.get(sk) ?? { widthIn: inches(width), heightIn: inches(height), pages: 0 };
    s.pages += 1;
    sizes.set(sk, s);

    const t = page.getTrimBox();
    // pdf-lib falls back to the MediaBox when no TrimBox is declared. A trim box
    // identical to the page is therefore "not declared", which is what KDP sees.
    if (t && !(inches(t.width) === inches(width) && inches(t.height) === inches(height))) {
      const tk = `${inches(t.x)},${inches(t.y)},${inches(t.width)}x${inches(t.height)}`;
      const e = trims.get(tk) ?? {
        xIn: inches(t.x), yIn: inches(t.y), widthIn: inches(t.width), heightIn: inches(t.height), pages: 0,
      };
      e.pages += 1;
      trims.set(tk, e);
    }
  }

  const fonts = new Map<string, PdfFontUse>();
  const seen = new Set<unknown>();
  const visit = (res: Dict | undefined, depth = 0): void => {
    if (!res || depth > 6) return;
    const fd = res.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (fd) {
      for (const [, ref] of fd.entries()) {
        const f = doc.context.lookup(ref) as Dict;
        if (!f?.get) continue;
        const baseFont = String(f.get(PDFName.of('BaseFont')) ?? '(no BaseFont)').replace(/^\//, '');
        const subtype = String(f.get(PDFName.of('Subtype')) ?? '?').replace(/^\//, '');
        let desc = f.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
        if (!desc) {
          // A Type0 font keeps its descriptor on the descendant CIDFont.
          const kids = f.get(PDFName.of('DescendantFonts'));
          const arr = kids ? (doc.context.lookup(kids) as { get?: (i: number) => unknown }) : null;
          const kid = arr?.get ? (doc.context.lookup(arr.get(0) as never) as Dict) : null;
          desc = kid?.lookupMaybe?.(PDFName.of('FontDescriptor'), PDFDict) ?? undefined;
        }
        const embedded = !!desc && ['FontFile', 'FontFile2', 'FontFile3'].some((k) => desc!.get(PDFName.of(k)));
        fonts.set(`${subtype}:${baseFont}`, { subtype, baseFont, embedded });
      }
    }
    const xo = res.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (xo) {
      for (const [, ref] of xo.entries()) {
        if (seen.has(ref)) continue;
        seen.add(ref);
        const x = doc.context.lookup(ref) as Dict;
        visit(x?.lookupMaybe?.(PDFName.of('Resources'), PDFDict), depth + 1);
      }
    }
  };
  for (const p of doc.getPages()) visit(p.node.Resources());

  return {
    pageCount: doc.getPageCount(),
    pageSizesIn: [...sizes.values()],
    trimBoxesIn: [...trims.values()],
    fonts: [...fonts.values()].sort((a, b) => a.baseFont.localeCompare(b.baseFont)),
    bytes: pdf.length,
  };
}
