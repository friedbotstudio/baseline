// Sanity tests for the materializer module. The full byte-equivalent
// comparison against golden TaskList fixtures lives in
// tests/byte-equivalent-migration.test.mjs; this file covers the
// materializer's standalone shape contracts (sub-track expansion, selector
// resolution, slug interpolation).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

let materializer;
try {
  materializer = await import(path.join(REPO_ROOT, 'src/cli/track-tasklist-materializer.js'));
} catch (err) {
  throw new Error(
    `src/cli/track-tasklist-materializer.js not yet implemented. Original: ${err.message}`
  );
}

function trackWithSimpleNodes() {
  const allTracks = new Map();
  const track = {
    track_id: 'simple',
    nodes: [
      { id: 'a', type: 'task', skill: 'intake', depends_on: [], blocks: ['b'], can_parallel: false, needs_user: false },
      { id: 'b', type: 'task', skill: 'scout', depends_on: ['a'], blocks: [], can_parallel: false, needs_user: false },
    ],
  };
  allTracks.set('simple', track);
  Object.defineProperty(track, '_allTracks', { value: allTracks, enumerable: false });
  return track;
}

describe('materializeTaskList — simple track shape', () => {
  it('test_when_simple_track_with_two_nodes_then_tasks_have_correct_ordinals_and_blockedby', () => {
    const tasks = materializer.materializeTaskList(trackWithSimpleNodes(), { slug: 'demo' });
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].ord, 1);
    assert.equal(tasks[1].ord, 2);
    assert.deepEqual(tasks[0].blockedBy, []);
    assert.deepEqual(tasks[1].blockedBy, [1]);
    assert.equal(tasks[0].subject, 'Run /intake for demo');
    assert.equal(tasks[1].subject, 'Run /scout for demo');
  });

  it('test_when_materialize_called_without_slug_then_throws', () => {
    const track = trackWithSimpleNodes();
    assert.throws(() => materializer.materializeTaskList(track, {}), /slug/);
  });
});

function trackWithSelectorAlternates() {
  const allTracks = new Map();
  const swarmSub = {
    track_id: 'swarm-sub',
    selectable: false,
    nodes: [
      { id: 'plan', type: 'task', skill: 'swarm-plan', depends_on: [], blocks: [], can_parallel: false, needs_user: false },
    ],
  };
  const tddSub = {
    track_id: 'tdd-sub',
    selectable: false,
    nodes: [
      { id: 'tdd', type: 'task', skill: 'tdd', depends_on: [], blocks: [], can_parallel: false, needs_user: false },
    ],
  };
  const main = {
    track_id: 'main',
    nodes: [
      { id: 'start', type: 'task', skill: 'intake', depends_on: [], blocks: ['choice'], can_parallel: false, needs_user: false },
      {
        id: 'choice',
        type: 'selector',
        alternates: [
          { sub_track: 'swarm-sub', preconditions: [{ name: 'requires_git' }, { name: 'requires_min_components', argument: '3' }] },
          { sub_track: 'tdd-sub', preconditions: [] },
        ],
        depends_on: ['start'],
        blocks: [],
        can_parallel: false,
        needs_user: false,
      },
    ],
  };
  allTracks.set('swarm-sub', swarmSub);
  allTracks.set('tdd-sub', tddSub);
  allTracks.set('main', main);
  Object.defineProperty(main, '_allTracks', { value: allTracks, enumerable: false });
  return main;
}

describe('materializeTaskList — selector preconditions (SP-014)', () => {
  it('test_when_ctx_satisfies_swarm_preconditions_then_swarm_alternate_chosen', () => {
    const ctx = { isGit: true, componentCount: 5 };
    const tasks = materializer.materializeTaskList(trackWithSelectorAlternates(), { slug: 'demo', ctx });
    assert.equal(tasks.length, 2, 'start + swarm-plan');
    assert.equal(tasks[1].subject, 'Run /swarm-plan for demo', 'selector chose swarm alternate (preconditions pass)');
  });

  it('test_when_ctx_fails_swarm_git_then_tdd_default_chosen', () => {
    const ctx = { isGit: false, componentCount: 5 };
    const tasks = materializer.materializeTaskList(trackWithSelectorAlternates(), { slug: 'demo', ctx });
    assert.equal(tasks.length, 2, 'start + tdd');
    assert.equal(tasks[1].subject, 'Run /tdd for demo', 'selector fell back to tdd default (swarm requires_git fails)');
  });

  it('test_when_ctx_fails_min_components_then_tdd_default_chosen', () => {
    const ctx = { isGit: true, componentCount: 2 };
    const tasks = materializer.materializeTaskList(trackWithSelectorAlternates(), { slug: 'demo', ctx });
    assert.equal(tasks[1].subject, 'Run /tdd for demo', 'selector fell back to tdd default (componentCount<3)');
  });

  it('test_when_no_ctx_provided_then_only_empty_precondition_alternate_eligible', () => {
    const tasks = materializer.materializeTaskList(trackWithSelectorAlternates(), { slug: 'demo' });
    assert.equal(tasks[1].subject, 'Run /tdd for demo', 'no ctx → only the unconditional default eligible');
  });
});

function trackWithCanParallelNode() {
  const allTracks = new Map();
  const track = {
    track_id: 'with-parallel',
    nodes: [
      { id: 'gate', type: 'task', skill: 'intake', depends_on: [], blocks: ['p1', 'p2'], can_parallel: false, needs_user: false },
      { id: 'p1', type: 'task', skill: 'scout', depends_on: ['gate'], blocks: [], can_parallel: true, needs_user: false },
      { id: 'p2', type: 'task', skill: 'research', depends_on: ['gate'], blocks: [], can_parallel: true, needs_user: false },
    ],
  };
  allTracks.set('with-parallel', track);
  Object.defineProperty(track, '_allTracks', { value: allTracks, enumerable: false });
  return track;
}

describe('materializeTaskList — can_parallel preservation (SP-002)', () => {
  it('test_when_node_carries_can_parallel_true_then_materialized_task_preserves_flag', () => {
    const tasks = materializer.materializeTaskList(trackWithCanParallelNode(), { slug: 'demo' });
    assert.equal(tasks.length, 3);
    assert.equal(tasks[0].can_parallel, false, 'gate node has can_parallel: false');
    assert.equal(tasks[1].can_parallel, true, 'p1 node has can_parallel: true');
    assert.equal(tasks[2].can_parallel, true, 'p2 node has can_parallel: true');
  });
});
