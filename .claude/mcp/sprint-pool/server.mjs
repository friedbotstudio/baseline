// Orchestration: the live MCP *channel* server (project-local; NOT baseline-owned,
// NOT shipped). It (a) auto-registers this session's peer on startup (registrar),
// (b) exposes the enqueue_task / leave_peer / release_task tools the lead calls, and
// (c) wires the transport: the lead hosts an in-process broker on a Unix-domain socket
// and peers connect as broker clients, bridging pushed events into the session via
// notifications/claude/channel. (The former 750ms poll-watch loop is removed — delivery
// is event-native over the socket.)
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
import { createBroker } from '../sprint-broker/broker.mjs';
import { createClient } from '../sprint-broker/client.mjs';
import { resolveSockPath } from '../sprint-broker/sock-path.mjs';

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const STATE_ROOT = join(PROJECT_DIR, '.claude', 'state', 'sprint');
const SPRINT_ID = process.env.SPRINT_POOL_CHANNEL || 'lobby';
const PEER_ID = process.env.SPRINT_POOL_PEER_ID || 'companion-1';
const ROLE = process.env.SPRINT_POOL_ROLE || 'peer';

// Set once the lead session hosts its broker; enqueue/release then route in-process so
// they broadcast a pushed event. A non-hosting session falls back to the file handlers.
let activeBroker = null;
// Set once a peer session connects its broker client; claim/signal_done/yield route
// through it so the peer acts ON the broker (not its own file state).
let activeClient = null;

function channelRoot(sprintId) {
  if (!isSafeId(sprintId)) throw new Error(`invalid channel id: ${sprintId}`);
  const root = join(STATE_ROOT, sprintId);
  mkdirSync(root, { recursive: true });
  return root;
}

const TOOLS = [
  {
    name: 'enqueue_task',
    description: 'Lead pushes a fully-specified unit of work onto the pool. Omit assignee for a claim-any lane (first free peer wins); set assignee to a peer_id to direct the lane to that peer (the lead controls allocation, e.g. to spread load or hand a lane to a named peer).',
    inputSchema: {
      type: 'object',
      properties: {
        sprint_id: { type: 'string' }, task_id: { type: 'string' }, brief: { type: 'string' },
        write_set: { type: 'array', items: { type: 'string' } }, depends_on: { type: 'array', items: { type: 'string' } },
        assignee: { type: 'string', description: 'optional peer_id; when set, only that peer may claim the lane' },
      },
      required: ['task_id'],
    },
    run: (root, a) => {
      if (activeBroker) {
        activeBroker.enqueue({ id: a.task_id, brief: a.brief || '', write_set: a.write_set || [], depends_on: a.depends_on || [], assignee: a.assignee || null });
        return { enqueued: true, task_id: a.task_id };
      }
      return enqueueTask({ channelRoot: root, ...a });
    },
  },
  {
    name: 'claim_task',
    description: 'Peer claims a pushed task through the broker (single-winner). Use THIS, not the file-based sprint-channel claim_task.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] },
    run: (_root, a) => {
      if (!activeClient) return { claimed: false, error: 'no broker client (not a connected peer session)' };
      return activeClient.call('claim', { peer_id: PEER_ID, task_id: a.task_id });
    },
  },
  {
    name: 'signal_done',
    description: 'Peer signals a claimed task done through the broker; unblocks its dependents.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] },
    run: (_root, a) => {
      if (!activeClient) return { ok: false, error: 'no broker client (not a connected peer session)' };
      return activeClient.call('signal_done', { peer_id: PEER_ID, task_id: a.task_id });
    },
  },
  {
    name: 'yield_fork',
    description: 'Peer yields an un-decidable fork to the lead through the broker (RALPH stop-rule). Never decide — yield.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, fork_desc: { type: 'string' } }, required: ['task_id', 'fork_desc'] },
    run: (_root, a) => {
      if (!activeClient) return { recorded: false, error: 'no broker client (not a connected peer session)' };
      return activeClient.call('yield', { peer_id: PEER_ID, task_id: a.task_id, fork_desc: a.fork_desc });
    },
  },
  {
    name: 'sprint_status',
    description: 'Read authoritative pool state (tasks/yields/peers/messages). Lossless source of truth — reconcile from this rather than trusting individual pushed events, which can be dropped in transit.',
    inputSchema: { type: 'object', properties: {} },
    run: () => {
      if (activeBroker) {
        const s = activeBroker.state;
        return { tasks: s.tasks, yields: s.yields, peers: s.peers, messages: s.messages, all_done: s.tasks.length > 0 && s.tasks.every((t) => t.status === 'done') };
      }
      if (activeClient) return activeClient.call('status', {});
      return { error: 'no active broker/client (not a connected pool session)' };
    },
  },
  {
    name: 'ask_lead',
    description: 'Peer raises a free-form question or escalation to the lead through the broker (org-team charter). Use for non-task queries; yield_fork stays for task-bound un-decidable forks. The lead arbitrates in main context and may escalate to the human.',
    inputSchema: { type: 'object', properties: { body: { type: 'string' }, kind: { type: 'string', enum: ['query', 'escalation'] } }, required: ['body'] },
    run: (_root, a) => {
      if (!activeClient) return { ok: false, error: 'no broker client (not a connected peer session)' };
      return activeClient.call('message', { peer_id: PEER_ID, kind: a.kind || 'query', body: a.body });
    },
  },
  {
    name: 'answer_peer',
    description: 'Lead answers a peer free-form message (after arbitrating in main context, or relaying a human decision); routes the answer back to the peer.',
    inputSchema: { type: 'object', properties: { message_id: { type: 'string' }, answer: { type: 'string' } }, required: ['message_id', 'answer'] },
    run: (_root, a) => {
      if (!activeBroker) return { ok: false, error: 'no active broker (not the lead session)' };
      return activeBroker.answer(a.message_id, a.answer);
    },
  },
  {
    name: 'leave_peer',
    description: 'Deregister a peer from the pool (mark inactive)',
    inputSchema: { type: 'object', properties: { sprint_id: { type: 'string' }, peer_id: { type: 'string' } }, required: ['peer_id'] },
    run: (root, a) => leavePeer({ channelRoot: root, ...a }),
  },
  {
    name: 'release_task',
    description: 'Lead re-dispatches a yielded task: reset to pending, clear claimer, resolve the yield, update the brief',
    inputSchema: { type: 'object', properties: { sprint_id: { type: 'string' }, task_id: { type: 'string' }, brief: { type: 'string' } }, required: ['task_id'] },
    run: (root, a) => {
      if (activeBroker) { activeBroker.release(a.task_id, a.brief); return { released: true }; }
      return releaseTask({ channelRoot: root, ...a });
    },
  },
];

const reply = (result) => ({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result });

// Role-scoped session instructions. A peer and a lead get DIFFERENT guidance: a peer
// must never adopt the lead role, even when the same human runs it as the workflow
// lead in another context. (Dogfood finding: a peer that believed it was "the lead"
// declined a claimable lane and starved the queue.) Pushed events are hints; reconcile
// via sprint_status before acting.
const PEER_INSTRUCTIONS =
  'You are a POOL PEER (role: peer) on this channel, and you stay a peer here regardless of any other role this session plays elsewhere. '
  + 'On a task-available hint: reconcile via sprint_status, then claim_task a pending lane you are eligible for (a lane with no assignee, or one whose assignee is your peer_id), execute its recipe within its write_set, signal_done when finished, ask_lead for a free-form question, and yield_fork any un-decidable choice. '
  + 'You NEVER arbitrate yields, NEVER release_task or answer_peer, and NEVER decline a claimable lane on the belief that you are the lead. If a lane is claimable and yours to take, take it.';
const LEAD_INSTRUCTIONS =
  'You are the POOL LEAD (role: lead) on this channel. The broker pushes peer lifecycle into this session: task-claimed, task-done (payload.unblocked lists newly-claimable dependents), all-done (every enqueued lane has drained), yield (arbitrate in main context, then release_task), and peer-message (answer with answer_peer). '
  + 'Enqueue work with enqueue_task (set assignee to direct a lane at a named peer, or omit it for claim-any). '
  + 'Pushed events can be dropped in transit, so treat them as hints, not guarantees: while you wait for completion, call sprint_status to read authoritative state (tasks/yields/peers/messages) — its all_done flag is true exactly when every enqueued lane has drained, so a lost task-done or all-done push can never strand you.';

// Identity is baked into the instructions so a session knows exactly who it is on the
// channel up front (dogfood finding: a peer guessed it was peer-1 and only learned its
// real id when a directed claim was rejected). Tools always use the configured peer_id;
// the model should never infer its identity from task pushes.
export function instructionsFor(role, peerId = '') {
  const base = role === 'lead' ? LEAD_INSTRUCTIONS : PEER_INSTRUCTIONS;
  if (!peerId) return base;
  const id = role === 'lead'
    ? ` Your id on this channel is \`${peerId}\`.`
    : ` Your peer id on this channel is \`${peerId}\` — you are \`${peerId}\` and no other peer; claim only a lane with no assignee or assigned to \`${peerId}\`, and never assume another peer's identity.`;
  return base + id;
}

export function buildServer() {
  const server = new Server(
    { name: 'sprint-pool', version: '0.2.0' },
    {
      capabilities: { experimental: { 'claude/channel': {} }, tools: {} },
      instructions: instructionsFor(ROLE, PEER_ID),
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
    return reply(await tool.run(root, args));
  });

  return server;
}

function bridgeEvent(server, event) {
  server.notification({
    method: 'notifications/claude/channel',
    params: { content: `pool ${event.op}: ${event.payload?.task_id ?? ''}`, meta: { event: event.op, ...event.payload } },
  });
}

async function startLead(server) {
  activeBroker = createBroker({
    channelRoot: channelRoot(SPRINT_ID),
    sockPath: resolveSockPath({ env: process.env, channel: SPRINT_ID }),
    onEvent: (event) => bridgeEvent(server, event),
  });
  await activeBroker.listen();
  process.stderr.write(`sprint-pool lead: broker listening (channel=${SPRINT_ID})\n`);
  const shutdown = async () => { await activeBroker.close(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

async function startPeer(server) {
  activeClient = createClient({ sockPath: resolveSockPath({ env: process.env, channel: SPRINT_ID }), onEvent: (event) => bridgeEvent(server, event) });
  await activeClient.call('register', { peer_id: PEER_ID, role: ROLE, workspace: '.' });
  process.stderr.write(`sprint-pool peer ${PEER_ID}: connected to broker (channel=${SPRINT_ID})\n`);
  const shutdown = async () => { await activeClient.close(); leavePeer({ channelRoot: channelRoot(SPRINT_ID), peer_id: PEER_ID }); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export { channelRoot };

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const server = buildServer();
  await server.connect(new StdioServerTransport());

  // The enqueue_task / leave_peer / release_task tools are available to any session that
  // loads this server. Broker hosting (lead) and client attach (peer) activate ONLY for
  // sessions launched as a pool lead/peer (launch.sh sets SPRINT_POOL_ACTIVE=1). A normal
  // session that merely has this server in its MCP config does neither — so the channel
  // never pollutes unrelated sessions.
  if (process.env.SPRINT_POOL_ACTIVE === '1') {
    const reg = runRegistration({ projectDir: PROJECT_DIR, channelRoot: channelRoot(SPRINT_ID), peer_id: PEER_ID, role: ROLE });
    if (reg.registered) {
      if (ROLE === 'lead') await startLead(server);
      else await startPeer(server);
    } else {
      process.stderr.write(`sprint-pool inactive: ${reg.reason || reg.error}\n`);
    }
  }
}
