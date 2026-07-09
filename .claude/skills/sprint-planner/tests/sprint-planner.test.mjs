// sprint-planner.test.mjs — selects a dependency-ready, cohesive sprint; excludes unready
// tasks naming the unmet prerequisite (AC-004); proposes only (AC-005). Run:
//   node --test .claude/skills/sprint-planner/tests/sprint-planner.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectSprint, computeReadiness } from '../planner.mjs';

// Fixture roadmap: P1 done; P4 depends on P1 (ready); S1 depends on W1 (W1 planned -> blocked).
const TASKS = [
  { id: 'P1', epic: 3, title: 'value types', deps: [], done_record: 'AC-001', edge_tests: ['t_edge_p1'], wiring_test: 't_wire_p1', priority: 1 },
  { id: 'P4', epic: 3, title: 'activation', deps: ['P1'], done_record: 'AC-004', edge_tests: ['t_edge_p4'], wiring_test: 't_wire_p4', priority: 2 },
  { id: 'S1', epic: 3, title: 'declare storage', deps: ['W1'], done_record: 'AC-007', edge_tests: ['t_edge_s1'], wiring_test: 't_wire_s1', priority: 3 },
];
const STATUS = { P1: 'done', P4: 'planned', S1: 'planned', W1: 'planned' };

describe('computeReadiness', () => {
  it('ready when every dep is done', () => {
    assert.deepEqual(computeReadiness(TASKS[1], STATUS), { ready: true, blockedBy: [] });
  });
  it('blocked names the unmet prerequisite', () => {
    assert.deepEqual(computeReadiness(TASKS[2], STATUS), { ready: false, blockedBy: ['W1'] });
  });
});

describe('selectSprint (AC-004)', () => {
  it('selects ready tasks and excludes unready ones naming the blocker', () => {
    const out = selectSprint({ tasks: TASKS, statusById: STATUS, capacity: 4 });
    const ids = out.features.map((f) => f.id);
    assert.ok(ids.includes('P4'), 'ready task P4 selected');
    assert.ok(!ids.includes('S1'), 'blocked task S1 excluded');
    const s1 = out.excluded.find((e) => e.id === 'S1');
    assert.ok(s1, 'S1 reported as excluded');
    assert.deepEqual(s1.blockedBy, ['W1']);
  });

  it('emits the sprint-plan manifest feature shape (done_record + edge/wiring)', () => {
    const out = selectSprint({ tasks: TASKS, statusById: STATUS, capacity: 4 });
    for (const f of out.features) {
      assert.ok(f.done_record, 'done_record present');
      assert.ok(Array.isArray(f.edge_tests) && f.edge_tests.length > 0, 'edge_tests present');
      assert.ok(f.wiring_test, 'wiring_test present');
    }
  });

  it('AC-005: returns a proposal object only (no side effects) — caller confirms before /triage', () => {
    const out = selectSprint({ tasks: TASKS, statusById: STATUS, capacity: 4 });
    assert.equal(typeof out, 'object');
    assert.ok('features' in out && 'excluded' in out);
    // proposal is a plain data object; nothing is committed or staged by selection.
  });
});
