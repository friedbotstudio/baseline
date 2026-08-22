// Epic 13 (baseline-mcp) Slice D — native cross-session messaging as an accelerator.
//
// Covers AC-015, AC-016, AC-017, AC-018, AC-019, AC-020 of docs/specs/baseline-mcp.md.
//
// The word "accelerator" carries the whole design. Peers already reconcile by polling
// `sprint_status`, and that path stays authoritative. A native message only shortens
// the wait; when it never arrives the pod still completes. AC-018 is the test that
// keeps that true, because an accelerator quietly promoted to a dependency is how a
// pod comes to hang on a dropped message.
//
// What travels is a POINTER, never the payload. The channel store is the one copy of
// task state; a message carrying a brief would create a second, and the two would
// disagree the moment either moved. `composePointer` throws rather than trusting its
// caller, so the closed schema cannot be widened by passing extra keys.
//
// The probe fails closed. Cross-session messaging needs v2.1.224+, runs on macOS and
// Linux only, is absent on the cloud providers, and is off whenever feature-flag
// evaluation is disabled. Any signal the probe cannot read as a clear yes resolves
// unavailable — an accelerator that guesses wrong stalls the thing it was meant to
// speed up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const { composePointer, probeNativeMessaging, notifyPointer } =
  await import('../.claude/mcp/baseline/notify.mjs');
const { acquireLead, readLead, releaseLead } =
  await import('../.claude/mcp/baseline/lib/lead-lock.mjs');
const { enqueueTask, claimTask, signalDone } =
  await import('../.claude/mcp/baseline/handlers.mjs');

function mkChannel({ tasks = [], peers = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'baseline-notify-'));
  writeFileSync(join(root, 'sprint.json'), JSON.stringify({ sprint_id: 's1', status: 'active', peers }));
  writeFileSync(join(root, 'tasks.json'), JSON.stringify(tasks));
  writeFileSync(join(root, 'yields.json'), JSON.stringify([]));
  writeFileSync(join(root, 'mailbox.jsonl'), '');
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
const task = (id, over = {}) => ({ id, write_set: [], depends_on: [], status: 'pending', claimed_by: null, commit_sha: null, ...over });

// MOCK: the SendMessage host boundary is a Claude Code affordance with no local
// implementation — the one mock the spec's test plan sanctions. Everything below it
// (the store, the locks, the composer, the probe) is real.
function stubTransport() {
  const sent = [];
  return { sent, send: (to, body) => { sent.push({ to, body }); return { delivery: 'delivered' }; } };
}

const AVAILABLE = { available: true, reason: 'probe: available' };
const UNAVAILABLE = { available: false, reason: 'probe: unavailable' };

// --- AC-016: the pointer carries no payload --------------------------------

test('test_when_a_pointer_is_composed_then_it_names_the_channel_and_task_and_nothing_else', () => {
  const body = composePointer({ channel: 'lane-pod', task_id: 'T3', event: 'claimable' });
  assert.match(body, /lane-pod/);
  assert.match(body, /T3/);
  assert.match(body, /claimable/i);
});

test('test_when_a_pointer_is_handed_a_payload_then_it_throws_rather_than_dropping_it', () => {
  // AC-016. Silently discarding the extra key would be worse than throwing: the
  // caller would believe it had sent something it had not.
  for (const extra of [{ brief: 'do the thing' }, { write_set: ['a.mjs'] }, { payload: {} }, { body: 'x' }]) {
    assert.throws(
      () => composePointer({ channel: 'c', task_id: 'T1', event: 'claimable', ...extra }),
      /payload|pointer/i,
      `${Object.keys(extra)[0]} must be refused`,
    );
  }
});

test('test_when_a_pointer_field_is_unsafe_then_it_is_refused', () => {
  // The body reaches another session's terminal, and the ids are the same
  // path-safe ids the store uses. Neither may carry a newline or an escape.
  assert.throws(() => composePointer({ channel: '../x', task_id: 'T1', event: 'claimable' }), /channel|invalid/i);
  assert.throws(() => composePointer({ channel: 'c', task_id: 'a b', event: 'claimable' }), /task|invalid/i);
  assert.throws(() => composePointer({ channel: 'c', task_id: 'T1', event: 'not-an-event' }), /event/i);
});

// --- AC-017: the probe fails closed ----------------------------------------

test('test_when_every_signal_is_good_then_the_probe_reports_available', () => {
  const r = probeNativeMessaging({ platform: 'darwin', version: '2.1.224', env: {} });
  assert.equal(r.available, true, r.reason);
});

test('test_when_any_signal_is_unknown_or_bad_then_the_probe_reports_unavailable', () => {
  // AC-017. Each row is a documented precondition from the vendor's page; an
  // unreadable one is not a maybe.
  const cases = [
    ['unsupported platform', { platform: 'win32', version: '2.1.224', env: {} }],
    ['version below the floor', { platform: 'linux', version: '2.1.223', env: {} }],
    ['version unreadable', { platform: 'linux', version: undefined, env: {} }],
    ['platform unreadable', { platform: undefined, version: '2.1.224', env: {} }],
    ['telemetry disabled', { platform: 'linux', version: '2.1.224', env: { DISABLE_TELEMETRY: '1' } }],
    ['do-not-track', { platform: 'linux', version: '2.1.224', env: { DO_NOT_TRACK: '1' } }],
    ['nonessential traffic off', { platform: 'linux', version: '2.1.224', env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } }],
    ['flag evaluation off', { platform: 'linux', version: '2.1.224', env: { DISABLE_GROWTHBOOK: '1' } }],
    ['a cloud provider', { platform: 'linux', version: '2.1.224', env: { CLAUDE_CODE_USE_BEDROCK: '1' } }],
    ['no signals at all', {}],
  ];
  for (const [label, input] of cases) {
    const r = probeNativeMessaging(input);
    assert.equal(r.available, false, `${label} must resolve unavailable`);
    assert.ok(r.reason && r.reason.length > 0, `${label} must say why`);
  }
});

// --- AC-015: a claimable transition sends one pointer ------------------------

test('test_when_a_task_becomes_claimable_then_its_assignee_receives_one_pointer', () => {
  // AC-015.
  const ch = mkChannel({ tasks: [task('T1'), task('T2', { depends_on: ['T1'], assignee: 'peer-b' })] });
  const transport = stubTransport();
  try {
    claimTask({ channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1' });
    const r = signalDone({
      channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1',
      notify: { transport, capability: AVAILABLE, channel: 'lane-pod' },
    });

    assert.deepEqual(r.unblocked, ['T2']);
    assert.equal(transport.sent.length, 1, 'exactly one pointer per unblocked lane');
    assert.equal(transport.sent[0].to, 'peer-b', 'the pointer goes to the lane assignee');
    assert.match(transport.sent[0].body, /T2/);
    assert.match(transport.sent[0].body, /lane-pod/);
    assert.ok(!/depends_on|write_set/.test(transport.sent[0].body), 'the pointer carries no task payload');
  } finally { ch.cleanup(); }
});

test('test_when_an_unblocked_lane_has_no_assignee_then_no_pointer_is_addressed', () => {
  // A claim-any lane has no session to name. Broadcasting to every peer would be
  // a different feature, and guessing a recipient would be worse than silence.
  const ch = mkChannel({ tasks: [task('T1'), task('T2', { depends_on: ['T1'] })] });
  const transport = stubTransport();
  try {
    claimTask({ channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1' });
    signalDone({
      channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1',
      notify: { transport, capability: AVAILABLE, channel: 'lane-pod' },
    });
    assert.equal(transport.sent.length, 0);
  } finally { ch.cleanup(); }
});

test('test_when_an_enqueued_lane_is_immediately_claimable_then_its_assignee_is_pointed_at_it', () => {
  // AC-015, the other transition that makes a lane claimable.
  const ch = mkChannel();
  const transport = stubTransport();
  try {
    enqueueTask({
      channelRoot: ch.root, task_id: 'T9', brief: 'do the thing', assignee: 'peer-c',
      notify: { transport, capability: AVAILABLE, channel: 'lane-pod' },
    });
    assert.equal(transport.sent.length, 1);
    assert.equal(transport.sent[0].to, 'peer-c');
    assert.ok(!/brief|do the thing/i.test(transport.sent[0].body), 'the pointer carries no brief');
  } finally { ch.cleanup(); }
});

// --- AC-017 / AC-018: the accelerator is never load-bearing -------------------

test('test_when_the_capability_is_unavailable_then_the_transition_completes_and_sends_nothing', () => {
  // AC-017.
  const ch = mkChannel({ tasks: [task('T1'), task('T2', { depends_on: ['T1'], assignee: 'peer-b' })] });
  const transport = stubTransport();
  try {
    claimTask({ channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1' });
    const r = signalDone({
      channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1',
      notify: { transport, capability: UNAVAILABLE, channel: 'lane-pod' },
    });
    assert.equal(r.ok, true, 'the state transition is unaffected');
    assert.deepEqual(r.unblocked, ['T2']);
    assert.equal(transport.sent.length, 0);
  } finally { ch.cleanup(); }
});

test('test_when_the_transport_throws_then_the_transition_still_commits', () => {
  // AC-018 at the seam. A host that refuses must not roll back real work.
  const ch = mkChannel({ tasks: [task('T1'), task('T2', { depends_on: ['T1'], assignee: 'peer-b' })] });
  const exploding = { send: () => { throw new Error('host refused'); } };
  try {
    claimTask({ channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1' });
    const r = signalDone({
      channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1',
      notify: { transport: exploding, capability: AVAILABLE, channel: 'lane-pod' },
    });
    assert.equal(r.ok, true);
    assert.equal(JSON.parse(readFileSync(join(ch.root, 'tasks.json'), 'utf8'))[0].status, 'done');
  } finally { ch.cleanup(); }
});

test('test_when_no_notify_context_is_given_at_all_then_behaviour_is_exactly_as_before', () => {
  // AC-018. Every existing caller passes no notify block; they must be untouched.
  const ch = mkChannel({ tasks: [task('T1'), task('T2', { depends_on: ['T1'], assignee: 'peer-b' })] });
  try {
    claimTask({ channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1' });
    const r = signalDone({ channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.unblocked, ['T2']);
  } finally { ch.cleanup(); }
});

test('test_when_every_pointer_is_dropped_then_the_pod_still_completes_by_reconcile', () => {
  // AC-018, the load-bearing question. Delivery suppressed wholesale; the pod
  // finishes anyway, because the store is what says so.
  const ch = mkChannel({ tasks: [task('T1'), task('T2', { depends_on: ['T1'], assignee: 'peer-b' })] });
  const blackhole = { send: () => ({ delivery: 'refused' }) };
  const ctx = { transport: blackhole, capability: AVAILABLE, channel: 'lane-pod' };
  try {
    claimTask({ channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1' });
    signalDone({ channelRoot: ch.root, peer_id: 'peer-a', task_id: 'T1', notify: ctx });
    claimTask({ channelRoot: ch.root, peer_id: 'peer-b', task_id: 'T2' });
    signalDone({ channelRoot: ch.root, peer_id: 'peer-b', task_id: 'T2', notify: ctx });

    const statuses = JSON.parse(readFileSync(join(ch.root, 'tasks.json'), 'utf8')).map((t) => t.status);
    assert.deepEqual(statuses, ['done', 'done'], 'reconcile alone drives the pod to completion');
  } finally { ch.cleanup(); }
});

test('test_when_notify_pointer_is_called_directly_then_it_reports_why_it_did_not_send', () => {
  const transport = stubTransport();
  const off = notifyPointer({ transport, capability: UNAVAILABLE, channel: 'c', task_id: 'T1', event: 'claimable', peer: 'p' });
  assert.equal(off.sent, false);
  assert.match(off.reason, /unavailable/i);

  const nobody = notifyPointer({ transport, capability: AVAILABLE, channel: 'c', task_id: 'T1', event: 'claimable', peer: null });
  assert.equal(nobody.sent, false);
  assert.match(nobody.reason, /peer|assignee/i);
  assert.equal(transport.sent.length, 0);
});

// --- AC-020: one lead per channel -------------------------------------------

test('test_when_a_channel_is_unled_then_the_first_caller_takes_it', () => {
  const ch = mkChannel();
  try {
    const r = acquireLead({ channelRoot: ch.root, peer_id: 'lead-1' });
    assert.equal(r.ok, true);
    assert.equal(r.holder, 'lead-1');
    assert.equal(readLead({ channelRoot: ch.root }), 'lead-1');
  } finally { ch.cleanup(); }
});

test('test_when_a_second_session_leads_an_occupied_channel_then_it_is_refused_naming_the_holder', () => {
  // AC-020. Two leads on one channel is the split-brain the broker used to prevent;
  // the store has to prevent it now that the broker is gone.
  const ch = mkChannel();
  try {
    acquireLead({ channelRoot: ch.root, peer_id: 'lead-1' });
    const r = acquireLead({ channelRoot: ch.root, peer_id: 'lead-2' });
    assert.equal(r.ok, false);
    assert.equal(r.holder, 'lead-1', 'the refusal names the current holder');
    assert.match(String(r.error), /lead-1/, 'and says so in the message');
    assert.equal(readLead({ channelRoot: ch.root }), 'lead-1', 'the holder is unchanged');
  } finally { ch.cleanup(); }
});

test('test_when_the_holder_re_acquires_then_it_is_idempotent', () => {
  const ch = mkChannel();
  try {
    acquireLead({ channelRoot: ch.root, peer_id: 'lead-1' });
    const again = acquireLead({ channelRoot: ch.root, peer_id: 'lead-1' });
    assert.equal(again.ok, true);
    assert.equal(again.holder, 'lead-1');
  } finally { ch.cleanup(); }
});

test('test_when_the_lead_releases_then_another_session_may_take_it', () => {
  const ch = mkChannel();
  try {
    acquireLead({ channelRoot: ch.root, peer_id: 'lead-1' });
    assert.equal(releaseLead({ channelRoot: ch.root, peer_id: 'lead-2' }).ok, false, 'a non-holder cannot release');
    assert.equal(releaseLead({ channelRoot: ch.root, peer_id: 'lead-1' }).ok, true);
    assert.equal(acquireLead({ channelRoot: ch.root, peer_id: 'lead-2' }).ok, true);
  } finally { ch.cleanup(); }
});

test('test_when_a_lead_id_is_unsafe_then_it_is_refused', () => {
  const ch = mkChannel();
  try {
    assert.equal(acquireLead({ channelRoot: ch.root, peer_id: '../x' }).ok, false);
    assert.equal(readLead({ channelRoot: ch.root }), null);
  } finally { ch.cleanup(); }
});

// --- AC-019: the pool and the broker are gone --------------------------------

test('test_when_the_tree_is_inspected_then_the_pool_and_broker_are_absent', () => {
  // AC-019, first half.
  for (const dir of ['.claude/mcp/sprint-pool', '.claude/mcp/sprint-broker']) {
    assert.equal(existsSync(join(ROOT, dir)), false, `${dir} must be gone from disk`);
  }
});

test('test_when_the_manifest_and_bundler_are_read_then_neither_names_the_retired_servers', () => {
  // AC-019, second half. A path left in the manifest ships a file that no longer
  // exists, and the installer would fail on it.
  const manifest = JSON.parse(readFileSync(join(ROOT, 'obj/template/.claude/manifest.json'), 'utf8'));
  const stale = Object.keys(manifest.files).filter((f) => /sprint-(pool|broker)/.test(f));
  assert.deepEqual(stale, [], 'the shipped manifest still lists retired files');

  const bundler = readFileSync(join(ROOT, 'scripts/bundle-mcp-servers.mjs'), 'utf8');
  assert.ok(!/sprint-pool|sprint-broker/.test(bundler), 'the bundler still names a retired server');
});

test('test_when_the_seed_is_read_then_the_research_preview_paragraph_is_gone', () => {
  // AC-019, third half. That paragraph explained why the pool shipped unregistered.
  // With the pool retired it describes nothing, and a reader would go looking.
  for (const f of ['docs/init/seed.md', 'src/seed.template.md']) {
    const s = readFileSync(join(ROOT, f), 'utf8');
    assert.ok(!/research preview/i.test(s), `${f} still carries the research-preview paragraph`);
    assert.ok(!/dangerously-load-development-channels/.test(s), `${f} still names the channel launch flag`);
  }
});
