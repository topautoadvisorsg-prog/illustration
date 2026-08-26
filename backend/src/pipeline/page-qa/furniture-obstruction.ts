/**
 * FURNITURE-REGION OBSTRUCTION — measured, not judged.
 *
 * The one control the vision profile could not catch: a solid bar of ink across
 * the running-head margin. Vision declines to call it a defect, and reasonably
 * so — a dark header band is a real design choice in real books. Asking a model
 * to guess which one it is looking at was never going to work.
 *
 * It is also not a question that needs a model. "Is this region 95% black" is
 * measurement.
 *
 * ─── THE RULE IS NOT "DARK IS BAD" ────────────────────────────────────────
 * A book with a deliberate band on every page must not fail for having a design.
 * A single page with a black slab where every one of its peers has ordinary
 * running furniture must. So the comparison is BOOK-RELATIVE:
 *
 *     this page's furniture band  vs  the same band on its peer pages
 *
 * Peers are pages of the same structural role, because a chapter opener's header
 * legitimately differs from a body page's. The norm is a median with a median
 * absolute deviation, which a handful of obstructed pages cannot drag.
 *
 * ─── TWO KINDS OF EVIDENCE, NOT ONE ───────────────────────────────────────
 * Darkness alone is weak. Darkness where the TEXT LAYER says a running head
 * should be, on a page whose role expects furniture, is strong: something opaque
 * is sitting on top of content we know is there.
 */
import sharp from 'sharp';
import type { ModelPage } from './page-model.js';
import type { PageRole, RoleAssignment } from './page-roles.js';
import type { Finding, Severity } from './deterministic-rules.js';

export interface BandStats {
  page: number;
  /** Fraction of pixels below the ink threshold in the header band. */
  headerDarkFraction: number;
  /** The darkest single pixel row in that band. A solid bar drives this to ~1. */
  headerMaxRowDark: number;
  footerDarkFraction: number;
  footerMaxRowDark: number;
}

/** Where furniture lives, as a fraction of page height. Matches `isFurniture`. */
const HEADER_BAND = { top: 0.0, height: 0.075 };
const FOOTER_BAND = { top: 0.925, height: 0.075 };

/** Below this grey value a pixel counts as ink. */
const INK = 128;

/**
 * Measure the furniture bands of every supplied page raster.
 *
 * Greyscale, raw pixels, no model. Cheap enough to run on a whole book.
 */
export async function measureFurnitureBands(rasters: Map<number, Buffer>): Promise<Map<number, BandStats>> {
  const out = new Map<number, BandStats>();
  for (const [page, png] of rasters) {
    const meta = await sharp(png).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (!w || !h) continue;
    const header = await bandStats(png, w, h, HEADER_BAND);
    const footer = await bandStats(png, w, h, FOOTER_BAND);
    out.set(page, {
      page,
      headerDarkFraction: header.darkFraction,
      headerMaxRowDark: header.maxRowDark,
      footerDarkFraction: footer.darkFraction,
      footerMaxRowDark: footer.maxRowDark,
    });
  }
  return out;
}

async function bandStats(
  png: Buffer,
  w: number,
  h: number,
  band: { top: number; height: number },
): Promise<{ darkFraction: number; maxRowDark: number }> {
  const top = Math.max(0, Math.round(h * band.top));
  const height = Math.max(1, Math.min(h - top, Math.round(h * band.height)));
  const { data } = await sharp(png)
    .extract({ left: 0, top, width: w, height })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let dark = 0;
  let maxRowDark = 0;
  for (let y = 0; y < height; y += 1) {
    let rowDark = 0;
    for (let x = 0; x < w; x += 1) {
      if (data[y * w + x]! < INK) rowDark += 1;
    }
    dark += rowDark;
    maxRowDark = Math.max(maxRowDark, rowDark / w);
  }
  return { darkFraction: dark / (w * height), maxRowDark };
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Median absolute deviation: a spread that a few outliers cannot inflate. */
const mad = (xs: number[], med: number): number => median(xs.map((x) => Math.abs(x - med)));

export interface ObstructionOptions {
  /**
   * A band this much darker than its peers, in MADs, is anomalous.
   * Generous, because MAD on a clean book is tiny and any multiple of it would
   * fire on ordinary variation without the absolute floors below.
   */
  madMultiple?: number;
  /** HARD_FAIL needs a band this dark in absolute terms as well. */
  hardFloor?: number;
  /** REVIEW needs at least this much. Below it, decoration is not a defect. */
  reviewFloor?: number;
  /** A solid bar drives the darkest row near 1. This is what separates it from type. */
  solidRowFraction?: number;
}

/**
 * Flag pages whose furniture band is anomalous FOR THIS BOOK.
 *
 * Roles are compared only against their own kind, and a role with fewer than
 * three peers is skipped entirely: a norm computed from two pages is not a norm.
 */
export function detectFurnitureObstruction(
  stats: Map<number, BandStats>,
  roles: RoleAssignment[],
  pages: ModelPage[],
  opts: ObstructionOptions = {},
): Finding[] {
  const madMultiple = opts.madMultiple ?? 6;
  const hardFloor = opts.hardFloor ?? 0.25;
  const reviewFloor = opts.reviewFloor ?? 0.12;
  const solidRowFraction = opts.solidRowFraction ?? 0.6;

  const roleOf = new Map(roles.map((r) => [r.page, r]));
  const pageOf = new Map(pages.map((p) => [p.n, p]));
  const findings: Finding[] = [];

  const groups = new Map<PageRole, number[]>();
  for (const r of roles) {
    if (!stats.has(r.page)) continue;
    groups.set(r.role, [...(groups.get(r.role) ?? []), r.page]);
  }

  for (const [role, memberPages] of groups) {
    if (memberPages.length < 3) continue;
    const values = memberPages.map((n) => stats.get(n)!.headerDarkFraction);
    const med = median(values);
    const spread = mad(values, med);

    for (const n of memberPages) {
      const s = stats.get(n)!;
      const excess = s.headerDarkFraction - med;
      // Anomalous relative to peers AND substantial in absolute terms. Both, so
      // that a uniformly banded book stays clean and a faint ornament does not
      // become a failure.
      const anomalous = spread > 0 ? excess > spread * madMultiple : excess > reviewFloor;
      if (!anomalous || s.headerDarkFraction < reviewFloor) continue;

      const solid = s.headerMaxRowDark >= solidRowFraction;
      const expectsFurniture = roleOf.get(n)?.expectsFurniture ?? false;
      // The text layer knows whether furniture is actually there to be covered.
      const furnitureLines = pageOf.get(n)?.furniture.length ?? 0;

      const severity: Severity =
        solid && s.headerDarkFraction >= hardFloor && expectsFurniture ? 'HARD_FAIL' : 'REVIEW';

      findings.push({
        page: n,
        code: 'FURNITURE_REGION_OBSTRUCTION',
        severity,
        role,
        detail:
          `The header band is ${(s.headerDarkFraction * 100).toFixed(0)}% ink against a ${(med * 100).toFixed(1)}% ` +
          `median for the ${memberPages.length} ${role} pages of this book` +
          (solid ? `, and its darkest row is ${(s.headerMaxRowDark * 100).toFixed(0)}% covered, which is a solid bar rather than type` : '') +
          (expectsFurniture && furnitureLines === 0
            ? '. The text layer reports no running furniture on a page whose role expects it, so something opaque is covering it'
            : '.'),
        evidence: {
          headerDarkFraction: Number(s.headerDarkFraction.toFixed(4)),
          peerMedian: Number(med.toFixed(4)),
          peerMad: Number(spread.toFixed(5)),
          maxRowDark: Number(s.headerMaxRowDark.toFixed(3)),
          peers: memberPages.length,
          furnitureLines,
        },
        suggests: 'illustration',
      });
    }
  }

  return findings.sort((a, b) => a.page - b.page);
}
