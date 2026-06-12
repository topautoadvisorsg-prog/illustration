/**
 * Phase 0 cover/interior sync gate — pure logic test (no DB, no I/O).
 */

import { describe, expect, it } from 'vitest';
import { coverSyncStatus } from '../pipeline/book-assembly/assemble-book.js';

describe('coverSyncStatus', () => {
  it('does not apply when there is no cover', () => {
    expect(coverSyncStatus({ hasCover: false, coverBuiltForPageCount: null, interiorPageCount: 100, fullBook: true }))
      .toEqual({ applicable: false, stale: false });
  });

  it('does not apply when the cover has no recorded page count (legacy cover)', () => {
    expect(coverSyncStatus({ hasCover: true, coverBuiltForPageCount: null, interiorPageCount: 100, fullBook: true }))
      .toEqual({ applicable: false, stale: false });
  });

  it('does not apply to a chapter proof (not a full book)', () => {
    expect(coverSyncStatus({ hasCover: true, coverBuiltForPageCount: 80, interiorPageCount: 100, fullBook: false }))
      .toEqual({ applicable: false, stale: false });
  });

  it('is in sync when the cover page count matches the interior', () => {
    expect(coverSyncStatus({ hasCover: true, coverBuiltForPageCount: 273, interiorPageCount: 273, fullBook: true }))
      .toEqual({ applicable: true, stale: false });
  });

  it('is STALE when the interior page count changed after the cover was built', () => {
    expect(coverSyncStatus({ hasCover: true, coverBuiltForPageCount: 260, interiorPageCount: 273, fullBook: true }))
      .toEqual({ applicable: true, stale: true });
  });
});
