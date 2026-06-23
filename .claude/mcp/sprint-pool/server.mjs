// Orchestration: the live MCP *channel* server (project-local; NOT baseline-owned,
// NOT shipped). It is the only file here that imports the SDK. It (a) auto-registers
// this session's peer on startup (registrar), (b) exposes the enqueue_task / leave_peer /
// release_task tools the lead calls, and (c) drives the watcher, pushing a
// notifications/claude/channel event into the session on each newly-relevant change.
//
// Channel contract per https://code.claude.com/docs/en/channels-reference :
//   capabilities.experimental['claude/channel'] = {}   registers the push listener
//   mcp.notification('notifications/claude/channel', {content, meta})  pushes a <channel> event
//
// Launch (custom, not on the Anthropic allowlist):
//   claude --dangerously-load-development-channels server:sprint-pool

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isSafeId } from '../sprint-channel/lib/safe-id.mjs';
import { enqueueTask, leavePeer, releaseTask } from './handlers.mjs';
import { runRegistration } from './registrar.mjs';
import { pollOnce } from './watcher.mjs';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const STATE_ROOT = join(PROJECT_DIR, '.claude', 'state', 'sprint');
const SPRINT_ID = process.env.SPRINT_POOL_CHANNEL || 'lobby';
const PEER_ID = process.env.SPRINT_POOL_PEER_ID || 'companion-1';
const ROLE = process.env.SPRINT_POOL_ROLE || 'peer';
const POLL_MS = Number(process.env.SPRINT_POOL_POLL_MS || 750);

function channelRoot(sprintId) {
  if (!isSafeId(sprintId)) throw new Error(`invalid channel id: ${sprintId}`);
  const root = join(STATE_ROOT, sprintId);
  mkdirSync(root, { recursive: true });
  return root;
}

const TOOLS = [
  {
    name: 'enqueue_task',
    description: 'Lead pushes a fully-specified unit of work onto the pool for an idle peer to claim',
    inputSchema: {
      type: 'object',
      properties: {
        sprint_id: { type: 'string' }, task_id: { type: 'string' }, brief: { type: 'string' },
        write_set: { type: 'array', items: { type: 'string' } }, depends_on: { type: 'array', items: { type: 'string' } },
      },
      required: ['task_id'],
    },
    run: (root, a) => enqueueTask({ channelRoot: root, ...a }),
  },
  {
    name: 'leave_peer',
    description: 'Deregister a peer from the pool (mark inactive)',
    inputSchema: { type: 'object', properties: { sprint_id: { type: 'string' }, peer_id: { type: 'string' } }, required: ['peer_id'] },
    run: (root, a) => leavePeer({ channelRoot: root, ...a }),
  },
  {
    name: 'release_task',
    description: 'Lead re-dispatches a yielded task: reset to pending, clear claimer, update the brief',
    inputSchema: { type: 'object', properties: { sprint_id: { type: 'string' }, task_id: { type: 'string' }, brief: { type: 'string' } }, required: ['task_id'] },
    run: (root, a) => releaseTask({ channelRoot: root, ...a }),
  },
];

const reply = (result) => ({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result });

export function buildServer() {
  const server = new Server(
    { name: 'sprint-pool', version: '0.1.0' },
    {
      capabilities: { experimental: { 'claude/channel': {} }, tools: {} },
      instructions:
        'Pool coordination events arrive as <channel source="sprint-pool" event="task-available|yield" task_id="...">. '
        + 'On task-available: claim the task via the sprint-channel claim_task tool, execute its recipe within its write_set, '
        + 'and yield_fork any un-decidable choice (never decide). On yield (lead only): arbitrate in main context, then release_task.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) throw new Error(`unknown tool: ${req.params.name}`);
    const args = req.params.arguments || {};
    const root = channelRoot(args.sprint_id || SPRINT_ID);
    return reply(tool.run(root, args));
  });

  return server;
}

function startWatchLoop(server) {
  const root = channelRoot(SPRINT_ID);
  const seen = new Set();
  const push = (event) => server.notification({
    method: 'notifications/claude/channel',
    params: { content: `pool ${event.event}: ${event.task_id}`, meta: { event: event.event, task_id: event.task_id } },
  });
  return setInterval(() => {
    try {
      pollOnce({ channelRoot: root, role: ROLE, notify: push, seen });
    } catch (err) {
      process.stderr.write(`sprint-pool watch error: ${err.message}\n`);
    }
  }, POLL_MS);
}

export { channelRoot };

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const reg = runRegistration({ projectDir: PROJECT_DIR, channelRoot: channelRoot(SPRINT_ID), peer_id: PEER_ID, role: ROLE });
  if (!reg.registered) {
    process.stderr.write(`sprint-pool refused to start: ${reg.reason || reg.error}\n`);
    process.exit(1);
  }
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  const timer = startWatchLoop(server);
  const shutdown = () => { clearInterval(timer); leavePeer({ channelRoot: channelRoot(SPRINT_ID), peer_id: PEER_ID }); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.stderr.write(`sprint-pool channel running on stdio (channel=${SPRINT_ID}, peer=${PEER_ID}, role=${ROLE})\n`);
}
