// T3 — org-dispatch calls eight tools; sprint-channel (the REGISTERED server)
// exposes only four. ask_lead / answer_peer / sprint_status / enqueue_task are
// Article X's load-bearing surface — the peer->lead->human escalation chain and
// the authoritative completion check — and today they exist only on sprint-pool,
// which needs `claude --dangerously-load-development-channels`.
//
// D-1 puts them on sprint-channel so a consumer runs org mode with no flag.
//
// No internal mocks (Art. VI.3): every test drives the real handlers against a
// real tmpdir channel root and the real mkdirSync lock.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HANDLERS = path.join(REPO_ROOT, '.claude/mcp/sprint-channel/handlers.mjs');
const SERVER = path.join(REPO_ROOT, '.claude/mcp/sprint-channel/server.mjs');

const handlers = await import(pathToFileURL(HANDLERS).href);
const server = await import(pathToFileURL(SERVER).href);

// Named-export guard — the four new handlers do not exist yet, so each test
// fails naming the export it needs instead of dying on "not a function".
function fn(name) {
  assert.equal(typeof handlers[name], 'function', `expected named export \`${name}\` to be a function`);
  return handlers[name];
}

function withChannel(run) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'chan-'));
  const channelRoot = path.join(tmp, 'sprint-a');
  mkdirSync(channelRoot, { recursive: true });
  try {
    return run(channelRoot);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// The nine tools the channel shipped before this change.
const PRIOR_TOOL_NAMES = [
  'register_peer', 'send_message', 'broadcast', 'claim_task', 'signal_done',
  'raise_conflict', 'yield_fork', 'release_task', 'leave_peer',
];

describe('T3 — sprint-channel carries the escalation surface', () => {
  it('test_when_peer_asks_lead_then_message_persisted_and_visible_in_status', () => { // AC-008
    withChannel((channelRoot) => {
      const askLead = fn('askLead');
      const sprintStatus = fn('sprintStatus');
      const asked = askLead({ channelRoot, peer_id: 'p2', body: 'which helper owns retries?' });
      assert.equal(asked.ok, true, 'ask_lead must succeed on a live channel');
      assert.ok(asked.message_id, 'ask_lead must return a message_id');
      const status = sprintStatus({ channelRoot });
      const found = (status.messages || []).find((m) => m.message_id === asked.message_id);
      assert.ok(found, 'sprint_status must surface the pending peer message');
      assert.equal(found.from_peer, 'p2');
      assert.equal(found.body, 'which helper owns retries?');
    });
  });

  it('test_when_lead_answers_then_originating_peer_reads_answer', () => { // AC-008
    withChannel((channelRoot) => {
      const askLead = fn('askLead');
      const answerPeer = fn('answerPeer');
      const sprintStatus = fn('sprintStatus');
      const { message_id } = askLead({ channelRoot, peer_id: 'p3', body: 'q' });
      const answered = answerPeer({ channelRoot, message_id, answer: 'reuse lib/retry.mjs' });
      assert.equal(answered.ok, true, 'answer_peer must succeed for a known message_id');
      const msg = sprintStatus({ channelRoot }).messages.find((m) => m.message_id === message_id);
      assert.equal(msg.answer, 'reuse lib/retry.mjs', 'the peer must be able to read the answer');
      assert.ok(msg.answered_at, 'an answered message must carry answered_at');
    });
  });

  it('test_when_answer_peer_called_twice_then_idempotent', () => { // AC-008
    withChannel((channelRoot) => {
      const askLead = fn('askLead');
      const answerPeer = fn('answerPeer');
      const sprintStatus = fn('sprintStatus');
      const { message_id } = askLead({ channelRoot, peer_id: 'p2', body: 'q' });
      answerPeer({ channelRoot, message_id, answer: 'same' });
      const first = sprintStatus({ channelRoot }).messages.find((m) => m.message_id === message_id).answered_at;
      const second = answerPeer({ channelRoot, message_id, answer: 'same' });
      assert.equal(second.ok, true, 'repeating the same answer must be a no-op, not an error');
      const after = sprintStatus({ channelRoot }).messages.filter((m) => m.message_id === message_id);
      assert.equal(after.length, 1, 'idempotent answer must not duplicate the message record');
      assert.equal(after[0].answered_at, first, 'answered_at must not move on a repeat');
    });
  });

  it('test_when_two_peers_claim_same_lane_then_single_winner', () => { // AC-008
    withChannel((channelRoot) => {
      const enqueueTask = fn('enqueueTask');
      enqueueTask({ channelRoot, task_id: 'lane-a', brief: 'b', write_set: ['src/a.mjs'] });
      const first = handlers.claimTask({ channelRoot, peer_id: 'p2', task_id: 'lane-a' });
      const second = handlers.claimTask({ channelRoot, peer_id: 'p3', task_id: 'lane-a' });
      const winners = [first, second].filter((r) => r.claimed === true);
      assert.equal(winners.length, 1, 'exactly one peer may win a contested lane');
    });
  });

  it('test_when_enqueue_task_duplicate_id_then_no_duplicate_row', () => { // AC-008
    withChannel((channelRoot) => {
      const enqueueTask = fn('enqueueTask');
      const sprintStatus = fn('sprintStatus');
      const payload = { channelRoot, task_id: 'lane-a', brief: 'b', write_set: ['src/a.mjs'] };
      enqueueTask(payload);
      const again = enqueueTask(payload);
      assert.equal(again.ok, true, 're-enqueueing the same task_id must be a no-op returning ok');
      const rows = sprintStatus({ channelRoot }).tasks.filter((t) => t.id === 'lane-a' || t.task_id === 'lane-a');
      assert.equal(rows.length, 1, 'a duplicate enqueue must not create a second row');
    });
  });

  it('test_when_sprint_id_traversal_then_rejected_before_path_build', () => { // AC-011
    withChannel((channelRoot) => {
      const askLead = fn('askLead');
      for (const bad of ['', '../escape', '../../etc/passwd', 'x'.repeat(300), 'péer']) {
        const r = askLead({ channelRoot, peer_id: bad, body: 'q' });
        assert.equal(r.ok, false, `peer_id ${JSON.stringify(bad)} must be rejected`);
        assert.match(String(r.error || ''), /invalid/i, 'rejection must be a named error');
      }
    });
  });

  it('test_when_unknown_message_id_then_named_error_no_mutation', () => { // AC-011
    withChannel((channelRoot) => {
      const answerPeer = fn('answerPeer');
      const sprintStatus = fn('sprintStatus');
      const before = JSON.stringify(sprintStatus({ channelRoot }));
      const r = answerPeer({ channelRoot, message_id: 'nope-404', answer: 'x' });
      assert.equal(r.ok, false, 'an unknown message_id must not succeed');
      assert.match(String(r.error || ''), /unknown|not found/i, 'the error must name the cause');
      assert.equal(JSON.stringify(sprintStatus({ channelRoot })), before, 'state must be unchanged');
    });
  });

  it('test_when_channel_state_absent_then_named_error_not_hang', () => { // AC-011
    const sprintStatus = fn('sprintStatus');
    const tmp = mkdtempSync(path.join(tmpdir(), 'chan-missing-'));
    try {
      const r = sprintStatus({ channelRoot: path.join(tmp, 'never-created') });
      assert.ok(r && typeof r === 'object', 'must return a value rather than throwing or hanging');
      assert.ok(
        r.ok === false || Array.isArray(r.tasks),
        'a missing channel root must yield a named error or an empty-but-valid status',
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_all_lanes_drain_then_all_done_is_authoritative', () => { // AC-008
    withChannel((channelRoot) => {
      const enqueueTask = fn('enqueueTask');
      const sprintStatus = fn('sprintStatus');
      enqueueTask({ channelRoot, task_id: 'lane-a', brief: 'b', write_set: ['src/a.mjs'] });
      assert.equal(sprintStatus({ channelRoot }).all_done, false, 'a pending lane means not done');
      handlers.claimTask({ channelRoot, peer_id: 'p2', task_id: 'lane-a' });
      handlers.signalDone({ channelRoot, peer_id: 'p2', task_id: 'lane-a' });
      assert.equal(sprintStatus({ channelRoot }).all_done, true, 'all_done must flip when the last lane drains');
    });
  });

  it('test_when_existing_four_tools_then_names_and_shapes_unchanged', () => { // regression
    for (const name of PRIOR_TOOL_NAMES) {
      assert.ok(
        server.TOOL_NAMES.includes(name),
        `pre-existing tool "${name}" must survive the escalation-surface addition`,
      );
    }
    for (const added of ['ask_lead', 'answer_peer', 'sprint_status', 'enqueue_task']) {
      assert.ok(server.TOOL_NAMES.includes(added), `sprint-channel must now expose "${added}"`);
    }
  });
});
