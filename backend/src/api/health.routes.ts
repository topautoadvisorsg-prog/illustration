import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPlaceholderKeys } from '../env.js';

const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal('wildlands-backend'),
  version: z.string(),
  placeholderKeys: z.array(z.string()),
});

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: HealthResponseSchema,
        },
      },
    },
    async () => ({
      ok: true,
      service: 'wildlands-backend' as const,
      version: '0.1.0',
      placeholderKeys: getPlaceholderKeys(),
    }),
  );
}
