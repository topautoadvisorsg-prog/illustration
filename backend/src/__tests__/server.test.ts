import { describe, expect, it } from 'vitest';
import { buildServer } from '../server.js';

// Authenticated routes reject with 401 once CONSOLE_PASSWORD is configured, so
// a bare request only passes on a machine that has never set one. Send the
// credential the same way the e2e suite does, so these tests hold either way.
const authHeaders = { Authorization: `Bearer ${process.env.CONSOLE_PASSWORD || ''}` };

describe('buildServer', () => {
  // The point of this test is that the server BOOTS and serves /health whether
  // or not real credentials are configured — it must not depend on the machine
  // it runs on. It used to assert `placeholderKeys` contained OPENAI_API_KEY,
  // which only holds on a fresh clone that has never been configured; on any
  // machine with a real key it failed permanently and became standing noise.
  // Placeholder DETECTION itself is covered by isPlaceholder's own unit tests.
  it('serves health regardless of whether real API keys are configured', async () => {
    const app = await buildServer();
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ ok: boolean; placeholderKeys: string[] }>();
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.placeholderKeys)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('serves pipeline agent contracts for the operator UI', async () => {
    const app = await buildServer();
    try {
      const response = await app.inject({ method: 'GET', url: '/api/agents', headers: authHeaders });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ agents: Array<{ id: string; name: string }> }>();
      expect(body.agents.map((agent) => agent.id)).toContain('MANUSCRIPT_ANALYST');
      expect(body.agents.map((agent) => agent.id)).toContain('PAGE_PLANNER');
    } finally {
      await app.close();
    }
  });
});
