/**
 * services/claude — typed wrapper around the Anthropic SDK.
 *
 * What it does: single entry point for Claude calls. Enforces temperature 0,
 * tool-call JSON mode, a bounded retry policy, and writes token usage to
 * llm_usage. Pipeline code must never touch the SDK directly.
 *
 * Input: a system prompt, a user message, and a Zod schema describing the
 * structured result the model must return via a forced tool call.
 * Output: the parsed, schema-validated result.
 */

import Anthropic from '@anthropic-ai/sdk';
import { type ZodType, type ZodTypeDef } from 'zod';
import { getEnv, isPlaceholder } from '../../env.js';
import { logger } from '../../lib/logger.js';
import { recordUsage } from '../../db/repositories/usage.repo.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const env = getEnv();
  if (isPlaceholder(env.ANTHROPIC_API_KEY)) {
    throw new Error('ANTHROPIC_API_KEY is not configured; Claude calls are disabled.');
  }
  client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatCallInput {
  system: string;
  messages: ChatTurn[];
  projectId?: string | null;
  operation: string;
  maxTokens?: number;
}

/**
 * Plain conversational Claude call (no forced tool). Used by the operator chat
 * so a human can ask "what's wrong / what's next" and get a readable answer.
 */
export async function callChat(input: ChatCallInput): Promise<string> {
  const env = getEnv();
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: input.maxTokens ?? 1024,
    temperature: 0.3,
    system: input.system,
    messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  await recordUsage({
    projectId: input.projectId ?? null,
    provider: 'anthropic',
    model: env.ANTHROPIC_MODEL,
    operation: input.operation,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  return text || '(The agent returned an empty response.)';
}

export interface StructuredCallInput<T> {
  system: string;
  user: string;
  /** Name of the tool the model is forced to call. */
  toolName: string;
  toolDescription: string;
  schema: ZodType<T, ZodTypeDef, unknown>;
  /** JSON schema mirror of `schema` for the tool definition. */
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
  projectId?: string | null;
  operation: string;
}

const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Claude and force it to return a single tool call whose input matches
 * `schema`. Retries on transient errors and malformed output up to 3×.
 */
export async function callStructured<T>(input: StructuredCallInput<T>): Promise<T> {
  const env = getEnv();
  const anthropic = getClient();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await anthropic.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: input.maxTokens ?? 8192,
        temperature: 0,
        system: input.system,
        tools: [
          {
            name: input.toolName,
            description: input.toolDescription,
            input_schema: input.jsonSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: input.toolName },
        messages: [{ role: 'user', content: input.user }],
      });

      await recordUsage({
        projectId: input.projectId ?? null,
        provider: 'anthropic',
        model: env.ANTHROPIC_MODEL,
        operation: input.operation,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === input.toolName,
      );
      if (!toolUse) {
        throw new Error(`Claude did not return a "${input.toolName}" tool call`);
      }

      return input.schema.parse(toolUse.input);
    } catch (error) {
      lastError = error;
      const isLast = attempt === MAX_RETRIES;
      logger.warn(
        { attempt, operation: input.operation, error: error instanceof Error ? error.message : error },
        `Claude call failed${isLast ? ' (final attempt)' : ', retrying'}`,
      );
      if (isLast) break;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }

  throw new Error(
    `Claude call "${input.operation}" failed after ${MAX_RETRIES} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

