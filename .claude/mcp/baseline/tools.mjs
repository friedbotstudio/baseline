// Domain: the tool table — every call this channel exposes, its input schema, and
// the handler it delegates to.
//
// Split out of server.mjs, which is Orchestration: it builds the MCP server, wires
// the transport, and resolves each call's channel root. The table is neither of
// those — it is the declarative wiring between a tool name and a handler, and it
// grows every time the channel gains a call while the orchestration around it does
// not. Keeping them together meant one file carried both concerns and grew past the
// layer budget on every new tool.
//
// This file imports `zod` for the input schemas. The SDK itself (`McpServer`,
// `StdioServerTransport`) still lives only in server.mjs; `lib/` remains free of
// both, which is what lets the coordination core be tested without either.

import { z } from 'zod';
import * as handlers from './handlers.mjs';
import { TASK_STATUSES } from './lib/tasks.mjs';
import { acquireLead, releaseLead } from './lib/lead-lock.mjs';

/**
 * Each row is `[name, description, inputSchema, run]`. `run` receives the already-
 * resolved channel root and the call's remaining arguments, so no row resolves a
 * path itself — that stays with the orchestration layer that validated it.
 */
export const TOOLS = [
  ['register_peer', 'Register a peer (worker|session) on the sprint channel',
    { sprint_id: z.string().optional(), peer_id: z.string(), pclass: z.enum(['worker', 'session']), role: z.string(), workspace: z.string() },
    (channelRootPath, a) => handlers.registerPeer({ channelRoot: channelRootPath, ...a })],
  ['send_message', 'Send a mechanical-coordination message to a peer',
    { sprint_id: z.string().optional(), from: z.string(), to: z.string(), type: z.string(), payload: z.any() },
    (channelRootPath, a) => handlers.sendMessage({ channelRoot: channelRootPath, ...a })],
  ['broadcast', 'Broadcast a coordination message to all peers',
    { sprint_id: z.string().optional(), from: z.string(), type: z.string(), payload: z.any() },
    (channelRootPath, a) => handlers.broadcast({ channelRoot: channelRootPath, ...a })],
  ['claim_task', 'Atomically claim a task (file-locked, race-safe)',
    { sprint_id: z.string().optional(), peer_id: z.string(), task_id: z.string() },
    (channelRootPath, a) => handlers.claimTask({ channelRoot: channelRootPath, ...a })],
  ['signal_done', 'Signal a task done and unblock its dependents',
    { sprint_id: z.string().optional(), peer_id: z.string(), task_id: z.string(), commit_sha: z.string().optional() },
    (channelRootPath, a) => handlers.signalDone({ channelRoot: channelRootPath, ...a })],
  ['raise_conflict', 'Raise a write-set conflict for lead arbitration',
    { sprint_id: z.string().optional(), peer_id: z.string(), task_id: z.string(), path: z.string() },
    (channelRootPath, a) => handlers.raiseConflict({ channelRoot: channelRootPath, ...a })],
  ['yield_fork', 'Yield an un-decidable fork to the lead (RALPH stop-rule)',
    { sprint_id: z.string().optional(), peer_id: z.string(), task_id: z.string(), fork_desc: z.string() },
    (channelRootPath, a) => handlers.yieldFork({ channelRoot: channelRootPath, ...a })],
  ['release_task', 'Lead re-dispatch: reset a claimed/yielded task to pending (optionally with a new brief) and resolve its open yield',
    { sprint_id: z.string().optional(), task_id: z.string(), brief: z.string().optional() },
    (channelRootPath, a) => handlers.releaseTask({ channelRoot: channelRootPath, ...a })],
  ['update_task', 'Move a task you hold the claim on to another status (e.g. claimed -> in_progress)',
    { sprint_id: z.string().optional(), peer_id: z.string(), task_id: z.string(), status: z.enum(TASK_STATUSES) },
    (channelRootPath, a) => handlers.updateTask({ channelRoot: channelRootPath, ...a })],
  ['cancel_task', 'Retire a task that will not be worked — unclaimable, and it stops blocking its dependents',
    { sprint_id: z.string().optional(), task_id: z.string() },
    (channelRootPath, a) => handlers.cancelTask({ channelRoot: channelRootPath, ...a })],
  ['list_tasks', 'Read the lane board: every task with its status, claimant and dependencies',
    { sprint_id: z.string().optional() },
    (channelRootPath, a) => handlers.listTasks({ channelRoot: channelRootPath, ...a })],
  ['leave_peer', 'Deregister a peer from the sprint channel (removes it from peers[])',
    { sprint_id: z.string().optional(), peer_id: z.string() },
    (channelRootPath, a) => handlers.leavePeer({ channelRoot: channelRootPath, ...a })],
  // Article X escalation surface (experimental — org mode is opt-in via
  // velocity.org_mode.enabled and off by default). These four live here rather
  // than on sprint-pool so a consumer needs no research-preview channel flag.
  ['ask_lead', 'Peer asks the lead a free-form question (peer->lead->human escalation)',
    { sprint_id: z.string().optional(), peer_id: z.string(), body: z.string() },
    (channelRootPath, a) => handlers.askLead({ channelRoot: channelRootPath, ...a })],
  ['answer_peer', 'Lead answers a peer question; the peer reads it back by message_id',
    { sprint_id: z.string().optional(), message_id: z.string(), answer: z.string() },
    (channelRootPath, a) => handlers.answerPeer({ channelRoot: channelRootPath, ...a })],
  ['sprint_status', 'Authoritative channel state; all_done is the never-dropped completion check',
    { sprint_id: z.string().optional() },
    (channelRootPath, a) => handlers.sprintStatus({ channelRoot: channelRootPath, ...a })],
  ['enqueue_task', 'Lead enqueues a lane; optional assignee makes it directed rather than claim-any',
    {
      sprint_id: z.string().optional(),
      task_id: z.string(),
      brief: z.string().optional(),
      write_set: z.array(z.string()).optional(),
      depends_on: z.array(z.string()).optional(),
      assignee: z.string().optional(),
    },
    (channelRootPath, a) => handlers.enqueueTask({ channelRoot: channelRootPath, ...a })],
  // One lead per channel. The retired broker held this by being the single process
  // every peer connected through; with it gone the store holds it instead.
  ['acquire_lead', 'Take the lead hat on this channel; refused, naming the holder, if another session already leads',
    { sprint_id: z.string().optional(), peer_id: z.string() },
    (channelRootPath, a) => acquireLead({ channelRoot: channelRootPath, ...a })],
  ['release_lead', 'Hand the lead hat back; only the current holder may',
    { sprint_id: z.string().optional(), peer_id: z.string() },
    (channelRootPath, a) => releaseLead({ channelRoot: channelRootPath, ...a })],
];

export const TOOL_NAMES = TOOLS.map(([name]) => name);
