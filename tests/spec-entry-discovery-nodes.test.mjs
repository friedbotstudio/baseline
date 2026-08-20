// spec-entry discovery nodes: intake + scout (cycle-time-fixes, then
// spec-entry-intake-node).
//
// The intake half exists to put gate A back on the artifact the gate-collapse
// intended. `/approve-direction` approves the DIRECTION and records a whole-file
// sha256 of whatever artifact it was handed; its own SOP says the spec "is now
// machine-reviewed, not human-gated". spec-entry had no intake node, so the
// command had nothing to resolve and the token ended up hashing the SPEC — 110 of
// 113 archived tokens point at `docs/specs/`, only 3 at `docs/intake/`. With the
// token bound to the spec, any post-approval byte change re-yields at gate A, so a
// typo fix costs the same human round-trip as a scope change.
//
// The fix is structural, not a severity carve-out: gate A sits immediately after
// `intake` and BEFORE any spec exists, exactly as it does on intake-full, so the
// token can only ever hash the direction document. Never let the spec be the
// approved artifact and then exempt "minor" edits — a model judging its own
// amendment minor is self-approval.
//
// Measured motivation: joining 209 archived workflow.json files to the phase
// timing logs, spec-entry was both the most-used track (26 runs) and the slowest
// (median 119.6 min), despite shipping a SMALLER median diff than intake-full
// (9 files / 563 lines vs 16 / 904) in roughly twice the post-approval
// implementation span (73.0 min vs 37.3). The structural difference between the
// two tracks is that spec-entry drafts its spec with no codebase map, so the
// guesses it commits to are found and paid for during implementation.
//
// This pins the fix: spec-entry runs /scout before /spec, the way intake-full
// already does. Scout's own median is 2.7 min.
//
// SUT: .claude/workflows.jsonl (track spec-entry)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadTrack(trackId, rel = '.claude/workflows.jsonl') {
  const raw = readFileSync(join(REPO_ROOT, rel), 'utf8');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const track = JSON.parse(line);
    if (track.track_id === trackId) return track;
  }
  throw new Error(`${rel} declares no track_id=${trackId}`);
}

const nodeById = (track, id) => track.nodes.find((n) => n.id === id);

describe('spec-entry — intake and scout precede spec', () => {
  for (const rel of ['.claude/workflows.jsonl', 'src/.claude/workflows.template.jsonl']) {
    it(`test_when_${rel.replace(/[^\w]/g, '_')}_is_loaded_then_gate_a_precedes_every_spec_node`, () => {
      const ids = loadTrack('spec-entry', rel).nodes.map((n) => n.id);
      assert.ok(ids.indexOf('approve-direction') < ids.indexOf('spec'),
        'gate A is reached before a spec exists, so its token cannot hash one');
      assert.ok(ids.indexOf('intake') < ids.indexOf('approve-direction'),
        'intake is the artifact gate A approves');
    });
  }

  it('test_when_spec_entry_is_loaded_then_it_declares_an_intake_node', () => {
    const intake = nodeById(loadTrack('spec-entry'), 'intake');
    assert.ok(intake, 'spec-entry declares an intake node');
    assert.equal(intake.metadata.phase, 'intake');
    assert.equal(intake.skill, 'intake');
    assert.deepEqual(intake.depends_on, [], 'intake is the track entry');
    assert.notEqual(intake.needs_user, true, 'intake is not a consent gate');
  });

  it('test_when_spec_entry_is_loaded_then_gate_a_depends_on_intake_only', () => {
    const gate = nodeById(loadTrack('spec-entry'), 'approve-direction');
    assert.deepEqual(gate.depends_on, ['intake'],
      'gate A fires on the intake, never on a drafted spec');
    assert.equal(gate.needs_user, true, 'gate A is still a consent gate');
  });

  it('test_when_spec_entry_is_loaded_then_it_declares_a_scout_node', () => {
    const scout = nodeById(loadTrack('spec-entry'), 'scout');
    assert.ok(scout, 'spec-entry declares a scout node');
    assert.equal(scout.metadata.phase, 'scout');
    assert.deepEqual(scout.depends_on, ['approve-direction'], 'scout runs under an approved direction');
    assert.notEqual(scout.needs_user, true, 'scout is not a consent gate');
  });

  it('test_when_spec_entry_is_loaded_then_spec_depends_on_scout', () => {
    const spec = nodeById(loadTrack('spec-entry'), 'spec');
    assert.ok(spec, 'spec node still present');
    assert.deepEqual(spec.depends_on, ['scout'], 'spec is drafted against the scout report');
  });

  it('test_when_scout_is_added_then_the_downstream_chain_is_untouched', () => {
    const track = loadTrack('spec-entry');
    const chain = ['spec-shippability-review', 'implementation',
      'simplify', 'security', 'integrate', 'document', 'archive',
      'roadmap-sync', 'memory-sync', 'grant-commit', 'commit'];
    for (const id of chain) assert.ok(nodeById(track, id), `${id} still declared`);
    assert.equal(nodeById(track, 'commit').depends_on[0], 'grant-commit', 'gate C still precedes commit');
  });

  it('test_when_scout_is_added_then_it_is_no_longer_a_derived_exception', async () => {
    const { deriveExceptions } = await import(join(REPO_ROOT, '.claude/skills/triage/derive-exceptions.mjs'));
    const track = loadTrack('spec-entry');
    const raw = readFileSync(join(REPO_ROOT, '.claude/workflows.jsonl'), 'utf8');
    const allPhases = new Set();
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      for (const n of JSON.parse(line).nodes) if (n.metadata?.phase) allPhases.add(n.metadata.phase);
    }
    const derived = deriveExceptions(track.nodes, [...allPhases], track.internal_phases ?? [], []);
    assert.ok(!derived.includes('scout'), 'a declared scout node must not be excepted away');
    assert.ok(!derived.includes('intake'), 'a declared intake node must not be excepted away');
    assert.ok(derived.includes('research'), 'research is the only discovery phase spec-entry still skips');
  });
});
