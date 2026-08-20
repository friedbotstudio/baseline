// spec-entry scout node (cycle-time-fixes, item 2).
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

function loadTrack(trackId) {
  const raw = readFileSync(join(REPO_ROOT, '.claude/workflows.jsonl'), 'utf8');
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const track = JSON.parse(line);
    if (track.track_id === trackId) return track;
  }
  throw new Error(`workflows.jsonl declares no track_id=${trackId}`);
}

const nodeById = (track, id) => track.nodes.find((n) => n.id === id);

describe('spec-entry — scout precedes spec', () => {
  it('test_when_spec_entry_is_loaded_then_it_declares_a_scout_node', () => {
    const scout = nodeById(loadTrack('spec-entry'), 'scout');
    assert.ok(scout, 'spec-entry declares a scout node');
    assert.equal(scout.metadata.phase, 'scout');
    assert.deepEqual(scout.depends_on, [], 'scout is the track entry');
    assert.notEqual(scout.needs_user, true, 'scout is not a consent gate');
  });

  it('test_when_spec_entry_is_loaded_then_spec_depends_on_scout', () => {
    const spec = nodeById(loadTrack('spec-entry'), 'spec');
    assert.ok(spec, 'spec node still present');
    assert.deepEqual(spec.depends_on, ['scout'], 'spec is drafted against the scout report');
  });

  it('test_when_scout_is_added_then_the_downstream_chain_is_untouched', () => {
    const track = loadTrack('spec-entry');
    const chain = ['spec-shippability-review', 'approve-direction', 'implementation',
      'simplify', 'security', 'integrate', 'document', 'archive',
      'roadmap-sync', 'memory-sync', 'grant-commit', 'commit'];
    for (const id of chain) assert.ok(nodeById(track, id), `${id} still declared`);
    assert.deepEqual(nodeById(track, 'approve-direction').depends_on, ['spec-shippability-review']);
    assert.equal(nodeById(track, 'approve-direction').needs_user, true, 'gate A still a consent gate');
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
    assert.ok(derived.includes('intake'), 'spec-entry still skips intake');
    assert.ok(derived.includes('research'), 'spec-entry still skips research');
  });
});
