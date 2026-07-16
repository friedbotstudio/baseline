// Tests for the gate-collapse DAG change (spec: docs/specs/gate-collapse.md, AC-001).
//
// After the collapse, the intake-full track materializes exactly TWO needs_user
// gates — `approve-direction` (immediately after intake) and `grant-commit`
// (at commit) — never three, and never the old `approve-spec` node.
//
// These assertions FAIL until .claude/workflows.jsonl moves the gate node from
// `approve-spec` (after spec-shippability-review) to `approve-direction`
// (after intake). Real workflows.jsonl is loaded — no fixtures.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const materializer = await import(path.join(REPO_ROOT, 'src/cli/track-tasklist-materializer.js'));

function loadTrack(trackId) {
  const lines = readFileSync(path.join(REPO_ROOT, '.claude/workflows.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  const allTracks = new Map();
  let target = null;
  for (const line of lines) {
    const t = JSON.parse(line);
    allTracks.set(t.track_id, t);
    if (t.track_id === trackId) target = t;
  }
  if (!target) throw new Error(`track ${trackId} not found in workflows.jsonl`);
  Object.defineProperty(target, '_allTracks', { value: allTracks, enumerable: false });
  return target;
}

function needsUserTasks(tasks) {
  return tasks.filter((t) => t.needs_user === true || t.metadata?.needs_user === true);
}

describe('gate-collapse — intake-full presents two human gates (AC-001)', () => {
  const tasks = materializer.materializeTaskList(loadTrack('intake-full'), {
    slug: 'demo',
    ctx: { commitConsentRequired: true },
  });

  it('test_when_intake_full_materialized_then_exactly_two_needs_user_gates', () => {
    const gates = needsUserTasks(tasks);
    assert.equal(gates.length, 2, `expected 2 human gates, got ${gates.length}: ${gates.map((g) => g.metadata?.phase).join(', ')}`);
  });

  it('test_when_intake_full_materialized_then_gates_are_approve_direction_and_grant_commit', () => {
    const phases = needsUserTasks(tasks).map((g) => g.metadata?.phase).sort();
    assert.deepEqual(phases, ['approve-direction', 'grant-commit']);
  });

  it('test_when_intake_full_materialized_then_no_approve_spec_gate_remains', () => {
    const phases = tasks.map((t) => t.metadata?.phase);
    assert.ok(!phases.includes('approve-spec'), 'approve-spec node must be gone after the collapse');
  });

  it('test_when_approve_direction_placed_then_it_fires_right_after_intake', () => {
    const intake = tasks.find((t) => t.metadata?.phase === 'intake');
    const direction = tasks.find((t) => t.metadata?.phase === 'approve-direction');
    assert.ok(intake && direction, 'both intake and approve-direction tasks must exist');
    // approve-direction blocks on intake and sits at ordinal intake+1 (D-7: before scout).
    assert.ok(direction.ord > intake.ord, 'approve-direction must come after intake');
    const scout = tasks.find((t) => t.metadata?.phase === 'scout');
    if (scout) assert.ok(direction.ord < scout.ord, 'approve-direction (D-7) must fire before scout');
  });
});
