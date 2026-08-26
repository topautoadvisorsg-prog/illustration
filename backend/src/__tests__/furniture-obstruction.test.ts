/**
 * WHAT A FAILURE HERE MEANS
 *
 * This rule exists because a solid bar across the running-head margin is the one
 * calibration control the vision profile could not catch — and reasonably so, as
 * a dark header band is a real design choice. Asking a model to guess which book
 * it is looking at was the wrong question. "Is this region 95% ink" is
 * measurement.
 *
 * The rule is therefore NOT "dark is bad". It is "unexpected FOR THIS BOOK".
 * The design control below is the important test: pages that are just as dark as
 * the obstructed one must come back clean when every one of their peers shares
 * the band.
 */
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  measureFurnitureBands,
  detectFurnitureObstruction,
} from '../pipeline/page-qa/furniture-obstruction.js';
import type { RoleAssignment } from '../pipeline/page-qa/page-roles.js';
import type { ModelPage } from '../pipeline/page-qa/page-model.js';

const W = 400;
const H = 600;

/** A page with ordinary light furniture: a thin grey line where a running head sits. */
const normalPage = (): Promise<Buffer> =>
  sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="12"><rect x="120" y="4" width="160" height="4" fill="#333"/></svg>`,
        ),
        top: 22,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

/** A page whose header band is a solid slab of ink. */
const obstructedPage = (): Promise<Buffer> =>
  sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="40"><rect x="0" y="0" width="${W}" height="40" fill="#101010"/></svg>`,
        ),
        top: 4,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

const roles = (n: number): RoleAssignment[] =>
  Array.from({ length: n }, (_, i) => ({
    page: i + 1,
    role: 'BODY' as const,
    evidence: 'test',
    minDensity: 0.55,
    expectsFurniture: true,
  }));

const noPages: ModelPage[] = [];

describe('measuring the furniture band', () => {
  it('reports a light band as almost no ink', async () => {
    const stats = await measureFurnitureBands(new Map([[1, await normalPage()]]));
    expect(stats.get(1)!.headerDarkFraction).toBeLessThan(0.05);
  });

  it('reports a solid bar as nearly all ink, with a fully covered row', async () => {
    const stats = await measureFurnitureBands(new Map([[1, await obstructedPage()]]));
    expect(stats.get(1)!.headerDarkFraction).toBeGreaterThan(0.5);
    expect(stats.get(1)!.headerMaxRowDark).toBeGreaterThan(0.95);
  });
});

describe('the rule is book-relative, not a darkness threshold', () => {
  it('flags one obstructed page among normal peers', async () => {
    const rasters = new Map<number, Buffer>();
    for (let i = 1; i <= 7; i += 1) rasters.set(i, await normalPage());
    rasters.set(4, await obstructedPage());

    const findings = detectFurnitureObstruction(await measureFurnitureBands(rasters), roles(7), noPages);
    expect(findings.map((f) => f.page)).toEqual([4]);
    expect(findings[0]!.severity).toBe('HARD_FAIL');
    expect(findings[0]!.code).toBe('FURNITURE_REGION_OBSTRUCTION');
  });

  /**
   * THE DESIGN CONTROL. Identical pixels to the case above, on every page.
   * A book with a deliberate band must not fail for having a design.
   */
  it('leaves a book alone when EVERY comparable page carries the same band', async () => {
    const rasters = new Map<number, Buffer>();
    for (let i = 1; i <= 7; i += 1) rasters.set(i, await obstructedPage());
    const findings = detectFurnitureObstruction(await measureFurnitureBands(rasters), roles(7), noPages);
    expect(findings).toEqual([]);
  });

  it('leaves an entirely ordinary book alone', async () => {
    const rasters = new Map<number, Buffer>();
    for (let i = 1; i <= 7; i += 1) rasters.set(i, await normalPage());
    expect(detectFurnitureObstruction(await measureFurnitureBands(rasters), roles(7), noPages)).toEqual([]);
  });

  it('refuses to judge a role with fewer than three peers', async () => {
    // A norm computed from two pages is not a norm.
    const rasters = new Map<number, Buffer>([
      [1, await normalPage()],
      [2, await obstructedPage()],
    ]);
    expect(detectFurnitureObstruction(await measureFurnitureBands(rasters), roles(2), noPages)).toEqual([]);
  });

  it('compares a role only against its own kind', async () => {
    // Openers legitimately differ from body pages; mixing them would invent a norm
    // that describes neither.
    const rasters = new Map<number, Buffer>();
    for (let i = 1; i <= 6; i += 1) rasters.set(i, await normalPage());
    const mixed: RoleAssignment[] = roles(6).map((r, i) =>
      i < 3 ? r : { ...r, role: 'CHAPTER_OPENER' as const },
    );
    expect(detectFurnitureObstruction(await measureFurnitureBands(rasters), mixed, noPages)).toEqual([]);
  });
});

describe('severity', () => {
  it('carries the numbers behind the judgement', async () => {
    const rasters = new Map<number, Buffer>();
    for (let i = 1; i <= 7; i += 1) rasters.set(i, await normalPage());
    rasters.set(2, await obstructedPage());
    const f = detectFurnitureObstruction(await measureFurnitureBands(rasters), roles(7), noPages)[0]!;
    expect(f.evidence).toBeTruthy();
    expect(f.evidence!.peers).toBe(7);
    expect(Number(f.evidence!.headerDarkFraction)).toBeGreaterThan(Number(f.evidence!.peerMedian));
    expect(f.detail).toContain('median');
  });
});
