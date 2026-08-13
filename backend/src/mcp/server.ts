#!/usr/bin/env node
/**
 * WILDLANDS MCP SERVER — the platform, callable by an agent.
 *
 * Design rule: this file contains NO business logic. Every tool is a thin call
 * to an HTTP endpoint the console also uses. That is deliberate — the moment
 * the agent path and the operator path have separate implementations they
 * begin to drift, and the operator finds out at the printer.
 *
 * COST RULE. Tools are split into two groups and the split is enforced by
 * naming, not by trust:
 *   *_preflight / *_readiness / *_status  — free, read-only, safe to call
 *   *_generate / *_build                  — SPEND or long compute
 * A spending tool refuses to run unless `confirm: true` is passed explicitly,
 * so no amount of enthusiastic tool-calling can spend money by accident. This
 * mirrors the cost-control policy the console already enforces on its buttons.
 *
 * Transport is stdio, so it runs as a subprocess of the agent. Configure with:
 *   WILDLANDS_API   base URL of the backend  (default: Railway production)
 *   WILDLANDS_KEY   console password / bearer token
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = process.env.WILDLANDS_API ?? 'https://wildlandsbackend-production.up.railway.app';
const KEY = process.env.WILDLANDS_KEY ?? '';

type Json = Record<string, unknown>;

async function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(KEY ? { authorization: `Bearer ${KEY}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 2000) };
  }
  if (!res.ok) {
    const msg = (data as { message?: string })?.message ?? `${res.status} ${res.statusText}`;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return (data ?? {}) as Json;
}

/** Every tool returns text; agents read it, and it stays readable in a log. */
const out = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

const server = new McpServer({ name: 'wildlands', version: '1.0.0' });

// ── read-only ──────────────────────────────────────────────────────────────

server.registerTool(
  'list_books',
  {
    title: 'List books',
    description: 'Every project on the platform, with id, title and page count. Free.',
    inputSchema: {},
  },
  async () => out(await call('GET', '/api/projects')),
);

server.registerTool(
  'intake_options',
  {
    title: 'Intake options',
    description:
      'What a book brief may legally name: trim presets, paper stocks, and the REGISTERED production profiles. ' +
      'Call this before book_intake rather than guessing a profile id — an unregistered id is refused.',
    inputSchema: {},
  },
  async () => out(await call('GET', '/api/books/intake-options')),
);

server.registerTool(
  'book_readiness',
  {
    title: 'Book readiness (pre-spend gate)',
    description:
      'Deterministic, free audit of whether a book is set up correctly enough to spend money on. ' +
      'Checks that the production profile, layout standard and Style DNA actually RESOLVE rather than ' +
      'silently falling back, that the breakdown parser held on this manuscript, that no other book\'s ' +
      'region has leaked into the prompts, and that a cover is geometrically buildable. ' +
      'Returns READY, WARNING or BLOCKED. Run this before any generate tool.',
    inputSchema: { projectId: z.string().uuid() },
  },
  async ({ projectId }) => out(await call('GET', `/api/projects/${projectId}/readiness`)),
);

server.registerTool(
  'book_status',
  {
    title: 'Book production status',
    description: 'Production dashboard for one book: queues, chapter readiness, export state. Free.',
    inputSchema: { projectId: z.string().uuid() },
  },
  async ({ projectId }) => out(await call('GET', `/api/projects/${projectId}/production-dashboard`)),
);

server.registerTool(
  'cover_preflight',
  {
    title: 'Cover preflight',
    description:
      'Everything a paid cover generation WOULD send — geometry, blueprint, the exact prompt, the cost estimate — ' +
      'and 17 fail-closed checks. Costs nothing. Always read this before cover_generate.',
    inputSchema: { projectId: z.string().uuid() },
  },
  async ({ projectId }) => out(await call('GET', `/api/projects/${projectId}/cover/preflight`)),
);

server.registerTool(
  'cover_versions',
  {
    title: 'Cover version history',
    description: 'Every cover version kept for a book, which one is current, and the page count each was built for. Free.',
    inputSchema: { projectId: z.string().uuid() },
  },
  async ({ projectId }) => out(await call('GET', `/api/projects/${projectId}/cover-artwork`)),
);

// ── writes that cost nothing ───────────────────────────────────────────────

server.registerTool(
  'book_intake',
  {
    title: 'Take in a new book',
    description:
      'Create a project from a brief and a manuscript, then run breakdown and pagination and return a readiness report. ' +
      'Idempotent: re-posting the same brief returns the project it already made instead of a duplicate. ' +
      'Costs nothing — no image or model spend happens here. Use intake_options first to get a valid productionProfileId.',
    inputSchema: {
      title: z.string(),
      authorName: z.string(),
      subtitle: z.string().optional().describe('Also the region string the illustration planner reads.'),
      productionProfileId: z.string(),
      trimPreset: z.enum(['5.5x8.5', '6x9', '7x10', '8.5x11']).optional(),
      paperStock: z.enum(['cream', 'white']).default('cream'),
      manuscriptPath: z.string().optional().describe('Absolute path to a .md/.txt manuscript on this machine.'),
      manuscriptMarkdown: z.string().optional().describe('Manuscript text, if not reading from a path.'),
      setupOnly: z.boolean().default(false).describe('Create and ingest, but skip breakdown and pagination.'),
    },
  },
  async (args) => {
    let markdown = args.manuscriptMarkdown;
    let filename = 'manuscript.md';
    if (!markdown && args.manuscriptPath) {
      const { readFile } = await import('node:fs/promises');
      const path = await import('node:path');
      markdown = await readFile(args.manuscriptPath, 'utf8');
      filename = path.basename(args.manuscriptPath);
    }
    return out(
      await call('POST', '/api/books/intake', {
        brief: {
          title: args.title,
          subtitle: args.subtitle,
          authorName: args.authorName,
          productionProfileId: args.productionProfileId,
          trimPreset: args.trimPreset ?? '5.5x8.5',
          paperStock: args.paperStock,
        },
        ...(markdown ? { manuscript: { filename, markdown } } : {}),
        setupOnly: args.setupOnly,
      }),
    );
  },
);

server.registerTool(
  'cover_upload',
  {
    title: 'Upload cover artwork',
    description:
      'Put a finished cover wrap in as the next version and make it current. The previous version is kept, never overwritten. ' +
      'Free — this is the way approved artwork fixed outside the platform gets back in.',
    inputSchema: {
      projectId: z.string().uuid(),
      imagePath: z.string().describe('Absolute path to a PNG of the full wrap.'),
      note: z.string().optional(),
    },
  },
  async ({ projectId, imagePath, note }) => {
    const { readFile } = await import('node:fs/promises');
    const pngBase64 = (await readFile(imagePath)).toString('base64');
    return out(await call('PUT', `/api/projects/${projectId}/cover-artwork`, { pngBase64, note }));
  },
);

server.registerTool(
  'cover_select_version',
  {
    title: 'Switch to a cover version',
    description: 'Make a previously kept cover version current again. Deletes nothing. Free.',
    inputSchema: { projectId: z.string().uuid(), version: z.number().int().positive() },
  },
  async ({ projectId, version }) => out(await call('PUT', `/api/projects/${projectId}/cover-artwork`, { selectVersion: version })),
);

// ── spend / long compute — every one gated on explicit confirmation ────────

/**
 * The guard. An agent that decides to "just try it" gets a refusal and a
 * pointer at the free preflight, rather than a charge.
 */
function requireConfirm(confirm: boolean, what: string, preflightTool: string) {
  if (!confirm) {
    throw new Error(
      `${what} costs money and was not confirmed. Run ${preflightTool} first, show the operator what it says, ` +
        'and only then call this again with confirm: true.',
    );
  }
}

server.registerTool(
  'cover_generate',
  {
    title: 'Generate cover artwork (SPENDS)',
    description:
      'ONE paid image call that generates the full wrap. Blocked when preflight fails. ' +
      'Requires confirm: true — read cover_preflight and get the operator\'s go-ahead first.',
    inputSchema: {
      projectId: z.string().uuid(),
      confirm: z.boolean().default(false).describe('Must be true. Set only after the operator has approved the spend.'),
    },
  },
  async ({ projectId, confirm }) => {
    requireConfirm(confirm, 'Cover generation', 'cover_preflight');
    return out(await call('POST', `/api/projects/${projectId}/generate-cover-artwork`, {}));
  },
);

server.registerTool(
  'build_interior',
  {
    title: 'Build the typeset interior (report)',
    description:
      'Deterministic typeset build — no image spend, but it drives a headless browser and takes minutes. ' +
      'Returns the build report including the real page count, which is what the cover spine is sized from. ' +
      'Requires confirm: true so it is never kicked off speculatively. ' +
      'NOTE: passing chaptersStartRecto SAVES that policy to the book, because a preview showing one page ' +
      'count while the spine was sized from another is a defect this platform has already shipped once.',
    inputSchema: {
      projectId: z.string().uuid(),
      chaptersStartRecto: z.boolean().optional().describe('Omit to use the book\'s saved policy.'),
      confirm: z.boolean().default(false),
    },
  },
  async ({ projectId, chaptersStartRecto, confirm }) => {
    requireConfirm(confirm, 'Interior build', 'book_readiness');
    const params = new URLSearchParams({ format: 'json' });
    if (chaptersStartRecto !== undefined) params.set('recto', String(chaptersStartRecto));
    return out(await call('GET', `/api/projects/${projectId}/typeset-preview?${params}`));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
