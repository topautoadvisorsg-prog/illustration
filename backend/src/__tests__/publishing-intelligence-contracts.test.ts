import { describe, expect, it } from 'vitest';
import {
  CreateExperimentRequestSchema,
  CreateStandardRequestSchema,
  KnowledgeOverviewSchema,
} from '@wildlands/shared';
import { buildServer } from '../server.js';

describe('Publishing Intelligence contracts', () => {
  it('defaults experiment records to running global knowledge', () => {
    const parsed = CreateExperimentRequestSchema.parse({
      title: 'Typography Test',
      hypothesis: '11.5pt body text improves readability.',
      testPerformed: 'Render representative pages and compare.',
    });

    expect(parsed.scope).toBe('GLOBAL');
    expect(parsed.status).toBe('RUNNING');
    expect(parsed.tags).toEqual([]);
  });

  it('accepts locked standards with versioned JSON values', () => {
    const parsed = CreateStandardRequestSchema.parse({
      title: 'Body Text Standard',
      domain: 'Typography',
      standardKey: 'body_text',
      value: { font: 'EB Garamond', bodyPt: 11.5 },
      rationale: 'Accepted after proof review.',
    });

    expect(parsed.status).toBe('LOCKED');
    expect(parsed.value).toMatchObject({ bodyPt: 11.5 });
  });

  it('has a stable overview response shape', () => {
    const parsed = KnowledgeOverviewSchema.parse({
      totals: {
        experiments: 1,
        decisions: 1,
        standards: 1,
        sops: 1,
        costRecords: 1,
        printReviews: 1,
        lessons: 1,
      },
      lockedStandards: 1,
      openExperiments: 0,
      recentItems: [],
    });

    expect(parsed.totals.printReviews).toBe(1);
  });

  it('registers the Intelligence route group without requiring database access at boot', async () => {
    const app = await buildServer();
    try {
      expect(app.hasRoute({ method: 'GET', url: '/api/intelligence/overview' })).toBe(true);
      expect(app.hasRoute({ method: 'POST', url: '/api/intelligence/experiments' })).toBe(true);
    } finally {
      await app.close();
    }
  });
});
