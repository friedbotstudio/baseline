// T2 of extractor-noise-and-prereq-drift.
// Spec: docs/specs/extractor-noise-and-prereq-drift.md (§Behavior #2, D3/D7/D8/D11)
// Covers AC-004 (derive unreachable phases), AC-008 (consent-gate deny-list),
//        AC-011 (internal_phases are never excepted), AC-013 (validator accepts the field).
//
// Root cause this pins: a phase skill declares a prereq its own track's DAG can
// never satisfy. `integrate` wants `security` in completed|exceptions, but the
// chore DAG has no security node. `/spec` wants `research`, but the power DAG has
// no research node — that one blocked a real spec write during this very workflow.
// The cure is to DERIVE exceptions from the track's DAG rather than hand-author them.
//
// The deny-list (AC-008) is the load-bearing safety property: nothing in
// workflows.jsonl requires an `approve-spec` node, so a naive derivation would
// auto-except GATE A and track_guard would then permit tdd writes with no
// approval token on disk. That is a consent-gate bypass. It must fail closed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKFLOWS = join(REPO_ROOT, '.claude/workflows.jsonl');

function readTracks() {
  return readFileSync(WORKFLOWS, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function trackById(id) {
  const track = readTracks().find((t) => t.track_id === id);
  assert.ok(track, `workflows.jsonl must declare a '${id}' track`);
  return track;
}

// The phase universe, derived (D8) — never a hardcoded roster, which would rot
// the moment a track adds a phase.
function allPhasesFromDisk() {
  const phases = new Set();
  for (const track of readTracks()) {
    for (const node of track.nodes ?? []) {
      if (node.metadata?.phase) phases.add(node.metadata.phase);
    }
  }
  return [...phases];
}

function phasesOf(track) {
  return (track.nodes ?? []).map((n) => n.metadata?.phase).filter(Boolean);
}

// A deliberately malformed track: it has a `spec` node but NO `approve-spec` node.
// Nothing in the workflows.jsonl invariants forbids this shape.
const TRACK_WITHOUT_GATE_A = {
  track_id: 'lean-no-gate',
  nodes: [
    { id: 'spec', metadata: { phase: 'spec' } },
    { id: 'tdd', metadata: { phase: 'tdd' } },
    { id: 'commit', metadata: { phase: 'commit' } },
  ],
};

const CONSENT_GATES = ['approve-spec', 'approve-swarm', 'grant-commit', 'commit'];

describe('T2 — deriveExceptions', () => {
  it('test_when_phase_absent_from_track_dag_then_derived_as_exception', async () => { // AC-004
    const { deriveExceptions } = await import('../.claude/skills/triage/derive-exceptions.mjs');
    const power = trackById('power');
    // subTracks is load-bearing: `tdd` reaches the power DAG through the
    // `implementation` selector's `tdd-worker-chain` alternate, not through a bare
    // node. Omitting the map excepts a phase the track can actually run.
    const subTracks = new Map(readTracks().map((t) => [t.track_id, t]));
    const result = deriveExceptions(power.nodes, allPhasesFromDisk(), power.internal_phases ?? [], [], { subTracks });

    // `research` has no node in the power DAG. Its absence from exceptions is what
    // blocked the spec write in this workflow until it was hand-corrected.
    assert.ok(result.includes('research'), 'power has no research node -> research must be excepted');
    assert.ok(result.includes('intake'), 'power has no intake node -> intake must be excepted');
    assert.ok(!result.includes('spec'), 'power HAS a spec node -> spec must NOT be excepted');
    assert.ok(!result.includes('tdd'), 'power reaches tdd via the implementation selector -> tdd must NOT be excepted');
  });

  it('test_when_track_lacks_approve_spec_node_then_consent_gate_not_excepted', async () => { // AC-008
    const { deriveExceptions } = await import('../.claude/skills/triage/derive-exceptions.mjs');
    const result = deriveExceptions(TRACK_WITHOUT_GATE_A.nodes, allPhasesFromDisk(), [], []);

    // CONSENT-GATE BYPASS GUARD. Fail closed: a missing gate node means the track
    // is malformed, never that the gate may be silently skipped.
    for (const gate of CONSENT_GATES) {
      assert.ok(
        !result.includes(gate),
        `consent gate '${gate}' must NEVER be auto-excepted — excepting approve-spec would let track_guard permit tdd writes with no approval token`,
      );
    }
  });

  it('test_when_track_declares_internal_phases_then_not_excepted', async () => { // AC-011
    const { deriveExceptions } = await import('../.claude/skills/triage/derive-exceptions.mjs');
    const chore = trackById('chore');
    const internal = chore.internal_phases ?? [];
    assert.ok(internal.includes('security'), 'chore must declare security as an internal phase');

    const result = deriveExceptions(chore.nodes, allPhasesFromDisk(), internal, []);
    for (const phase of internal) {
      assert.ok(
        !result.includes(phase),
        `'${phase}' is a chore internal phase — exceptions must not claim it is skipped while the chore skill runs it`,
      );
    }
  });

  it('test_when_authored_exception_given_then_preserved_in_union', async () => { // AC-004
    const { deriveExceptions } = await import('../.claude/skills/triage/derive-exceptions.mjs');
    const chore = trackById('chore');
    const result = deriveExceptions(chore.nodes, allPhasesFromDisk(), chore.internal_phases ?? [], ['brd']);
    assert.ok(result.includes('brd'), 'a hand-authored exception must survive the union');
  });

  it('test_when_track_nodes_not_array_then_throws_named_error', async () => { // AC-004
    const { deriveExceptions } = await import('../.claude/skills/triage/derive-exceptions.mjs');
    for (const bad of [null, undefined, {}, 'power', 42]) {
      assert.throws(
        () => deriveExceptions(bad, allPhasesFromDisk(), [], []),
        /trackNodes/i,
        `deriveExceptions(${JSON.stringify(bad)}) must throw a NAMED error, not silently return a partial array`,
      );
    }
  });

  it('test_when_all_phases_derived_then_matches_union_across_tracks', async () => { // AC-004
    const { deriveExceptions } = await import('../.claude/skills/triage/derive-exceptions.mjs');
    const chore = trackById('chore');
    const universe = allPhasesFromDisk();
    const result = deriveExceptions(chore.nodes, universe, chore.internal_phases ?? [], []);

    // Every returned exception must be a real phase from the derived universe (D8) —
    // no invented names, no stale hardcoded roster.
    for (const phase of result) {
      assert.ok(universe.includes(phase), `'${phase}' must come from the derived phase universe`);
    }
    // And nothing the chore DAG actually declares may be excepted.
    for (const phase of phasesOf(chore)) {
      assert.ok(!result.includes(phase), `'${phase}' has a node in the chore DAG -> must not be excepted`);
    }
  });

  it('test_when_workflows_jsonl_has_internal_phases_then_validator_accepts', async () => { // AC-013
    const { validateWorkflowsJsonl } = await import('../.claude/skills/triage/workflows-validator.js');
    const result = await validateWorkflowsJsonl(WORKFLOWS);

    // KNOWN_TRACK_FIELDS is a CLOSED set (workflows-validator.js:92). Before the fix
    // this fails with: unknown field 'internal_phases' (strict schema; v1 fields only).
    assert.equal(
      result.ok,
      true,
      `the live workflows.jsonl must validate clean once 'internal_phases' is a known track field; errors: ${JSON.stringify(result.errors ?? result)}`,
    );
    const chore = (result.tracks ?? []).find((t) => t.track_id === 'chore');
    assert.ok(chore, 'validator must return the chore track');
    assert.ok(
      Array.isArray(chore.internal_phases) && chore.internal_phases.includes('security'),
      'the validated chore track must carry internal_phases including security',
    );
  });
});
