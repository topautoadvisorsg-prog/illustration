import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from 'fastify-type-provider-zod';
import { getEnv } from './env.js';
import { registerHealthRoutes } from './api/health.routes.js';
import { registerProjectRoutes } from './api/projects.routes.js';
import { registerPageRoutes } from './api/pages.routes.js';
import { registerIntelligenceRoutes } from './api/intelligence.routes.js';
import { registerAgentRoutes } from './api/agents.routes.js';

export async function buildServer(): Promise<FastifyInstance> {
  const env = getEnv();
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    // A full book manuscript (and base64-encoded DOCX/PDF) far exceeds Fastify's
    // 1 MB default, which silently rejects full uploads. Allow up to 25 MB.
    bodyLimit: 25 * 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'The Wildlands Publishing Platform API',
        version: '0.1.0',
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });

  await registerHealthRoutes(app);
  await registerProjectRoutes(app);
  await registerPageRoutes(app);
  await registerIntelligenceRoutes(app);
  await registerAgentRoutes(app);

  app.get('/', async () => ({
    service: 'wildlands-backend',
    docs: `http://${env.HOST}:${env.PORT}/api/docs`,
  }));

  return app;
}
