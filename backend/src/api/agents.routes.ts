import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { WILDLANDS_AGENT_CONTRACTS } from '../agents/agent-contracts.js';

const AgentContractResponseSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mission: z.string(),
      expertFrame: z.string(),
      hardRules: z.array(z.string()),
      requiredInputs: z.array(z.string()),
      requiredOutputs: z.array(z.string()),
      researchDirectives: z.array(z.string()),
      runtime: z.enum(['advisory-llm', 'deterministic', 'planned']),
      usesTools: z.boolean(),
      usesVision: z.boolean(),
      realityNote: z.string(),
    }),
  ),
});

export async function registerAgentRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/agents',
    { schema: { response: { 200: AgentContractResponseSchema } } },
    async () => ({ agents: Object.values(WILDLANDS_AGENT_CONTRACTS) }),
  );
}
