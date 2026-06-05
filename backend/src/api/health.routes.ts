import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getPlaceholderKeys } from '../env.js';
import { activeStorageKind } from '../services/storage/project-storage.js';
import { listProjects } from '../db/repositories/projects.repo.js';

const HealthResponseSchema = z.object({
  ok: z.boolean(),
  service: z.literal('wildlands-backend'),
  version: z.string(),
  placeholderKeys: z.array(z.string()),
  // Persistence status — one call confirms the image library won't vanish:
  // durable storage + a live DB connection.
  storage: z.enum(['supabase', 'local-ephemeral']),
  storageDurable: z.boolean(),
  db: z.enum(['connected', 'error']),
  projectCount: z.number(),
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
    async () => {
      const storage = activeStorageKind();
      let db: 'connected' | 'error' = 'connected';
      let projectCount = 0;
      try {
        projectCount = (await listProjects()).length;
      } catch {
        db = 'error';
      }
      return {
        // ok = service is up. Durability is reported separately via storageDurable/db
        // so dev (no keys, ephemeral storage) is still "ok" while production durability
        // is explicitly checkable.
        ok: true,
        service: 'wildlands-backend' as const,
        version: '0.1.0',
        placeholderKeys: getPlaceholderKeys(),
        storage,
        storageDurable: storage === 'supabase',
        db,
        projectCount,
      };
    },
  );
}
