import { describe, expect, it } from 'vitest';
import { buildServer } from '../server.js';

describe('buildServer', () => {
  it('serves health without real API keys', async () => {
    const app = await buildServer();
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ ok: boolean; placeholderKeys: string[] }>();
      expect(body.ok).toBe(true);
      expect(body.placeholderKeys).toContain('OPENAI_API_KEY');
    } finally {
      await app.close();
    }
  });

  it('serves pipeline agent contracts for the operator UI', async () => {
    const app = await buildServer();
    try {
      const response = await app.inject({ method: 'GET', url: '/api/agents' });
      expect(response.statusCode).toBe(200);
      const body = response.json<{ agents: Array<{ id: string; name: string }> }>();
      expect(body.agents.map((agent) => agent.id)).toContain('MANUSCRIPT_ANALYST');
      expect(body.agents.map((agent) => agent.id)).toContain('PAGE_PLANNER');
    } finally {
      await app.close();
    }
  });
});
