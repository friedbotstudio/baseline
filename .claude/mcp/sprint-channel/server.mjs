// Orchestration: the live MCP stdio server. This is the ONLY file in the channel
// that imports the SDK — the coordination core (handlers + lib) stays SDK-free.
// Each call resolves its channelRoot from a validated sprint_id (CWE-22 guard),
// then delegates to the slice-B handlers.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as handlers from './handlers.mjs';
import { isSafeId } from './lib/safe-id.mjs';

const STATE_ROOT = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.claude', 'state', 'sprint');

function channelRoot(sprint_id) {
  if (!isSafeId(sprint_id)) throw new Error(`invalid sprint_id: ${sprint_id}`);
  const root = join(STATE_ROOT, sprint_id);
  mkdirSync(root, { recursive: true });
  return root;
}

const reply = (result) => ({
  content: [{ type: 'text', text: JSON.stringify(result) }],
  structuredContent: result,
});

const TOOLS = [
  ['register_peer', 'Register a peer (worker|session) on the sprint channel',
    { sprint_id: z.string(), peer_id: z.string(), pclass: z.enum(['worker', 'session']), role: z.string(), workspace: z.string() },
    (channelRootPath, a) => handlers.registerPeer({ channelRoot: channelRootPath, ...a })],
  ['send_message', 'Send a mechanical-coordination message to a peer',
    { sprint_id: z.string(), from: z.string(), to: z.string(), type: z.string(), payload: z.any() },
    (channelRootPath, a) => handlers.sendMessage({ channelRoot: channelRootPath, ...a })],
  ['broadcast', 'Broadcast a coordination message to all peers',
    { sprint_id: z.string(), from: z.string(), type: z.string(), payload: z.any() },
    (channelRootPath, a) => handlers.broadcast({ channelRoot: channelRootPath, ...a })],
  ['claim_task', 'Atomically claim a task (file-locked, race-safe)',
    { sprint_id: z.string(), peer_id: z.string(), task_id: z.string() },
    (channelRootPath, a) => handlers.claimTask({ channelRoot: channelRootPath, ...a })],
  ['signal_done', 'Signal a task done and unblock its dependents',
    { sprint_id: z.string(), peer_id: z.string(), task_id: z.string(), commit_sha: z.string().optional() },
    (channelRootPath, a) => handlers.signalDone({ channelRoot: channelRootPath, ...a })],
  ['raise_conflict', 'Raise a write-set conflict for lead arbitration',
    { sprint_id: z.string(), peer_id: z.string(), task_id: z.string(), path: z.string() },
    (channelRootPath, a) => handlers.raiseConflict({ channelRoot: channelRootPath, ...a })],
  ['yield_fork', 'Yield an un-decidable fork to the lead (RALPH stop-rule)',
    { sprint_id: z.string(), peer_id: z.string(), task_id: z.string(), fork_desc: z.string() },
    (channelRootPath, a) => handlers.yieldFork({ channelRoot: channelRootPath, ...a })],
  ['release_task', 'Lead re-dispatch: reset a claimed/yielded task to pending (optionally with a new brief) and resolve its open yield',
    { sprint_id: z.string(), task_id: z.string(), brief: z.string().optional() },
    (channelRootPath, a) => handlers.releaseTask({ channelRoot: channelRootPath, ...a })],
  ['leave_peer', 'Deregister a peer from the sprint channel (removes it from peers[])',
    { sprint_id: z.string(), peer_id: z.string() },
    (channelRootPath, a) => handlers.leavePeer({ channelRoot: channelRootPath, ...a })],
  // Article X escalation surface (experimental — org mode is opt-in via
  // velocity.org_mode.enabled and off by default). These four live here rather
  // than on sprint-pool so a consumer needs no research-preview channel flag.
  ['ask_lead', 'Peer asks the lead a free-form question (peer->lead->human escalation)',
    { sprint_id: z.string(), peer_id: z.string(), body: z.string() },
    (channelRootPath, a) => handlers.askLead({ channelRoot: channelRootPath, ...a })],
  ['answer_peer', 'Lead answers a peer question; the peer reads it back by message_id',
    { sprint_id: z.string(), message_id: z.string(), answer: z.string() },
    (channelRootPath, a) => handlers.answerPeer({ channelRoot: channelRootPath, ...a })],
  ['sprint_status', 'Authoritative channel state; all_done is the never-dropped completion check',
    { sprint_id: z.string() },
    (channelRootPath, a) => handlers.sprintStatus({ channelRoot: channelRootPath, ...a })],
  ['enqueue_task', 'Lead enqueues a lane; optional assignee makes it directed rather than claim-any',
    {
      sprint_id: z.string(),
      task_id: z.string(),
      brief: z.string().optional(),
      write_set: z.array(z.string()).optional(),
      depends_on: z.array(z.string()).optional(),
      assignee: z.string().optional(),
    },
    (channelRootPath, a) => handlers.enqueueTask({ channelRoot: channelRootPath, ...a })],
];

export function buildServer() {
  const server = new McpServer({ name: 'sprint-channel', version: '0.1.0' });
  for (const [name, description, inputSchema, run] of TOOLS) {
    server.registerTool(name, { description, inputSchema }, async ({ sprint_id, ...rest }) => reply(run(channelRoot(sprint_id), rest)));
  }
  return server;
}

export const TOOL_NAMES = TOOLS.map(([name]) => name);

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const transport = new StdioServerTransport();
  await buildServer().connect(transport);
  process.stderr.write('sprint-channel MCP server running on stdio\n');
}
