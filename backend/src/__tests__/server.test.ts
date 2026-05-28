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
});
