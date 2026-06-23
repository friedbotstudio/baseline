import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Watcher core does not exist yet — import fails RED until /implement writes it.
// pollOnce reads the channel state and calls notify() for newly-relevant changes,
// tracking `seen` to avoid re-notifying. The fs.watch/interval shell lives in server.mjs.
import { pollOnce } from '../.claude/mcp/sprint-pool/watcher.mjs';

function mkChannel({ tasks = [], yields = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sprint-pool-watch-'));
  writeFileSync(join(root, 'sprint.json'), JSON.stringify({ sprint_id: 'lobby', status: 'active', peers: [] }));
  writeFileSync(join(root, 'tasks.json'), JSON.stringify(tasks));
  writeFileSync(join(root, 'yields.json'), JSON.stringify(yields));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
const task = (id, over = {}) => ({ id, write_set: [id.toLowerCase()], depends_on: [], status: 'pending', claimed_by: null, ...over });

// --- peer role watches tasks → task-available push (AC-002) ---
test('test_when_watcher_detects_tasks_change_then_emits_task_available', () => {
  const ch = mkChannel({ tasks: [task('P1')] });
  try {
    const events = [];
    const seen = new Set();
    pollOnce({ channelRoot: ch.root, role: 'peer', notify: (e) => events.push(e), seen });
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'task-available');
    assert.equal(events[0].task_id, 'P1');
  } finally { ch.cleanup(); }
});

test('test_when_watcher_polls_twice_then_no_duplicate_push', () => {
  const ch = mkChannel({ tasks: [task('P1')] });
  try {
    const events = [];
    const seen = new Set();
    pollOnce({ channelRoot: ch.root, role: 'peer', notify: (e) => events.push(e), seen });
    pollOnce({ channelRoot: ch.root, role: 'peer', notify: (e) => events.push(e), seen });
    assert.equal(events.length, 1, 'an already-seen pending task is not re-pushed');
  } finally { ch.cleanup(); }
});

test('test_when_watcher_sees_only_claimed_tasks_then_no_push', () => {
  const ch = mkChannel({ tasks: [task('P1', { status: 'claimed', claimed_by: 'peer-9' })] });
  try {
    const events = [];
    pollOnce({ channelRoot: ch.root, role: 'peer', notify: (e) => events.push(e), seen: new Set() });
    assert.equal(events.length, 0, 'a non-claimable (already claimed) task is not pushed');
  } finally { ch.cleanup(); }
});

// --- lead role watches yields → yield push (AC-004) ---
test('test_when_watcher_detects_yield_then_emits_yield_event', () => {
  const ch = mkChannel({ yields: [{ task_id: 'P1', peer_id: 'peer-2', fork_desc: 'which format?', status: 'open' }] });
  try {
    const events = [];
    pollOnce({ channelRoot: ch.root, role: 'lead', notify: (e) => events.push(e), seen: new Set() });
    assert.equal(events.length, 1);
    assert.equal(events[0].event, 'yield');
    assert.equal(events[0].task_id, 'P1');
  } finally { ch.cleanup(); }
});

test('test_when_watcher_lead_sees_resolved_yield_then_no_push', () => {
  const ch = mkChannel({ yields: [{ task_id: 'P1', peer_id: 'peer-2', fork_desc: 'x', status: 'resolved' }] });
  try {
    const events = [];
    pollOnce({ channelRoot: ch.root, role: 'lead', notify: (e) => events.push(e), seen: new Set() });
    assert.equal(events.length, 0, 'a resolved yield is not pushed');
  } finally { ch.cleanup(); }
});
