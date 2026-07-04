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
let validator;
try {
  materializer = await import(path.join(REPO_ROOT, 'src/cli/track-tasklist-materializer.js'));
  validator = await import(path.join(REPO_ROOT, 'src/cli/workflows-validator.js'));
} catch (err) {
  throw new Error(
    `materializer or workflows-validator not loadable. Original: ${err.message}`
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

function trackWithConditionalGrantCommit({ annotate = true } = {}) {
  const allTracks = new Map();
  const gc = {
    id: 'grant-commit', type: 'task', skill: 'grant-commit',
    depends_on: ['memory-flush'], blocks: ['commit'], can_parallel: false, needs_user: true,
  };
  if (annotate) gc.condition = { name: 'requires_commit_consent' };
  const track = {
    track_id: 'conditional-gate',
    invariants: ['commits'],
    nodes: [
      { id: 'memory-flush', type: 'task', skill: 'memory-flush', depends_on: [], blocks: ['grant-commit'], can_parallel: false, needs_user: false },
      gc,
      { id: 'commit', type: 'task', skill: 'commit', depends_on: ['grant-commit'], blocks: [], can_parallel: false, needs_user: false },
    ],
  };
  allTracks.set('conditional-gate', track);
  Object.defineProperty(track, '_allTracks', { value: allTracks, enumerable: false });
  return track;
}

describe('materializeTaskList — requires_commit_consent condition (AC-003)', () => {
  it('test_when_ctx_resolves_no_commit_consent_then_grant_commit_omitted_and_commit_rewired', () => {
    const tasks = materializer.materializeTaskList(trackWithConditionalGrantCommit(), {
      slug: 'demo', ctx: { commitConsentRequired: false },
    });
    assert.equal(tasks.length, 2, 'grant-commit node omitted under autonomous landing');
    assert.equal(tasks[0].subject, 'Run /memory-flush for demo');
    assert.equal(tasks[1].subject, 'Run /commit for demo');
    assert.deepEqual(tasks[1].blockedBy, [1], "commit rewired to grant-commit's predecessor");
  });

  it('test_when_ctx_missing_or_nonboolean_then_grant_commit_included', () => {
    for (const ctx of [undefined, {}, { commitConsentRequired: 'yes' }]) {
      const tasks = materializer.materializeTaskList(trackWithConditionalGrantCommit(), { slug: 'demo', ctx });
      assert.equal(tasks.length, 3, `ctx=${JSON.stringify(ctx)} → fail-safe include`);
      assert.equal(tasks[1].subject, 'Wait for /grant-commit');
      assert.equal(tasks[1].needs_user, true);
      assert.deepEqual(tasks[2].blockedBy, [2], 'commit still blocked by the gate');
    }
  });

  it('test_when_ctx_requires_consent_true_then_output_identical_to_unannotated_track', () => {
    const annotated = materializer.materializeTaskList(trackWithConditionalGrantCommit(), {
      slug: 'demo', ctx: { commitConsentRequired: true },
    });
    const plain = materializer.materializeTaskList(trackWithConditionalGrantCommit({ annotate: false }), {
      slug: 'demo', ctx: { commitConsentRequired: true },
    });
    assert.deepEqual(annotated, plain, 'consent-required resolution is byte-identical to the unannotated track');
  });
});

describe('materializeTaskList — freeform track (live workflows.jsonl)', () => {
  it('test_when_freeform_track_materialized_then_three_task_chain_with_consent_gate', async () => {
    const livePath = path.join(REPO_ROOT, '.claude/workflows.jsonl');
    const validation = await validator.validateWorkflowsJsonl(livePath);
    assert.equal(validation.ok, true, `live workflows.jsonl must validate: ${JSON.stringify(validation.errors)}`);
    const freeform = validation.tracks.find((t) => t.track_id === 'freeform');
    assert.ok(freeform, 'live workflows.jsonl must declare freeform track');
    assert.deepEqual(freeform.invariants, ['commits'], 'freeform invariants must be exactly [commits]');
    const tasks = materializer.materializeTaskList(freeform, { slug: 'sample' });
    assert.equal(tasks.length, 3, 'freeform DAG: memory-flush → grant-commit → commit');
    assert.equal(tasks[0].subject, 'Run /memory-flush for sample');
    assert.equal(tasks[0].needs_user, false);
    assert.deepEqual(tasks[0].blockedBy, []);
    assert.equal(tasks[1].subject, 'Wait for /grant-commit');
    assert.equal(tasks[1].needs_user, true, 'grant-commit is the consent gate');
    assert.deepEqual(tasks[1].blockedBy, [1]);
    assert.equal(tasks[2].subject, 'Run /commit for sample');
    assert.deepEqual(tasks[2].blockedBy, [2]);
  });
});
