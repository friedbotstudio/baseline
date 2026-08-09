// T6 — code generation routes through swarm-worker by default (AC-017..AC-020).
//
// Two edit sites, and the first test exists because the second one is easy to
// miss: project.json -> swarm.min_tasks_worth_swarming is a config knob the
// harness SOP reads, but workflows.jsonl's implementation selector carries its
// own `requires_min_components` argument as a LITERAL. Lowering the config alone
// is a no-op for the selector path, so both are asserted together.
//
// D-1 (spec, engineer's call): swarm.isolation stays "shared". The last test is
// the recorded consequence — with no worktree between workers, swarm_boundary_guard
// is the only collision barrier, so it is tested as the load-bearing thing it now is.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport, readFileSync } from './helpers/memory-fixtures.mjs';
import { runPreToolUseHook, writeEditPayload } from './helpers/memory-git-fixtures.mjs';

const TRACKS_FILE = '.claude/workflows.jsonl';
const CONFIG = '.claude/project.json';
const CONFIG_TEMPLATE = 'src/project.template.json';
const INVARIANTS = 'src/cli/workflows-validator-invariants.js';
const MATERIALIZER = 'src/cli/track-tasklist-materializer.js';
const BOUNDARY_GUARD = '.claude/hooks/swarm_boundary_guard.mjs';

const WIDENED_TRACKS = ['power', 'epic-child', 'tdd-quickfix'];
const SWARM_NODE_IDS = ['swarm-plan', 'approve-swarm', 'swarm-dispatch'];

function tracks() {
  return readFileSync(join(REPO_ROOT, TRACKS_FILE), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function trackById(id) {
  const found = tracks().find((t) => t.track_id === id);
  assert.ok(found, `track \`${id}\` must exist in ${TRACKS_FILE}`);
  return found;
}

function selectorOf(track) {
  return track.nodes.find((n) => n.type === 'selector' && n.id === 'implementation');
}

describe('swarm as the default code-generation route', () => {
  // AC-017 — both edit sites.
  it('test_when_config_and_tracks_read_then_min_tasks_is_one_and_every_predicate_argument_is_one', () => {
    for (const rel of [CONFIG, CONFIG_TEMPLATE]) {
      const cfg = JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8'));
      assert.equal(
        cfg?.swarm?.min_tasks_worth_swarming,
        1,
        `${rel} -> swarm.min_tasks_worth_swarming must be 1`,
      );
    }

    const args = [];
    for (const track of tracks()) {
      for (const node of track.nodes ?? []) {
        for (const alt of node.alternates ?? []) {
          for (const pre of alt.preconditions ?? []) {
            if (pre.name === 'requires_min_components') args.push({ track: track.track_id, argument: pre.argument });
          }
        }
      }
    }

    assert.ok(args.length > 0, 'at least one requires_min_components predicate must exist');
    for (const { track, argument } of args) {
      assert.equal(
        argument,
        '1',
        `track ${track} still gates the swarm branch on ${argument} components — the config knob does NOT reach this literal, so lowering project.json alone leaves the selector unchanged`,
      );
    }
  });

  // AC-018
  it('test_when_three_tracks_parsed_then_each_carries_an_implementation_selector_with_two_sub_track_alternates', () => {
    for (const id of WIDENED_TRACKS) {
      const selector = selectorOf(trackById(id));
      assert.ok(selector, `track \`${id}\` must carry an \`implementation\` selector node`);
      assert.equal(selector.alternates?.length, 2, `track \`${id}\` selector must offer exactly two alternates`);

      const subTracks = selector.alternates.map((a) => a.sub_track);
      assert.ok(subTracks.includes('swarm-implementation'), `track \`${id}\` must offer the swarm alternate`);
      assert.ok(subTracks.includes('tdd-worker-chain'), `track \`${id}\` must keep the solo fallback`);
      assert.ok(
        selector.alternates.every((a) => typeof a.sub_track === 'string' && a.skill === undefined),
        `track \`${id}\` alternates must all be sub_track shaped — I10 requires congruent alternates`,
      );
    }
  });

  // AC-019
  it('test_when_spec_has_components_then_materializer_emits_swarm_nodes_else_the_solo_chain', async () => {
    const mod = await tryImport(MATERIALIZER);
    assert.ok(mod, `${MATERIALIZER} must be importable`);
    assert.equal(typeof mod.materializeTaskList, 'function', 'expected named export `materializeTaskList`');

    // `_allTracks` is attached to the TRACK, not passed in ctx — the validator
    // normally does it, so a test calling the materializer directly must too, or
    // every sub_track reference fails to expand.
    const all = new Map(tracks().map((t) => [t.track_id, t]));
    const track = { ...trackById('power'), _allTracks: all };
    const base = { isGit: true, knownSkills: new Set(), completed: [], commitConsentRequired: true };
    const materialize = (componentCount) =>
      mod.materializeTaskList(track, { slug: 'fixture', ctx: { ...base, componentCount } });

    const swarmed = materialize(2);
    const swarmPhases = swarmed.map((t) => t?.metadata?.phase);
    for (const id of SWARM_NODE_IDS) {
      assert.ok(swarmPhases.includes(id), `componentCount 2 must materialize \`${id}\`; got ${JSON.stringify(swarmPhases)}`);
    }

    const solo = materialize(0);
    const soloPhases = solo.map((t) => t?.metadata?.phase);
    assert.ok(!soloPhases.includes('swarm-dispatch'), 'componentCount 0 must fall through to the solo chain');
    assert.ok(soloPhases.includes('tdd'), `the solo chain must still carry tdd; got ${JSON.stringify(soloPhases)}`);
  });

  // AC-020
  it('test_when_all_tracks_validated_then_i1_to_i11_pass', async () => {
    const mod = await tryImport(INVARIANTS);
    assert.ok(mod, `${INVARIANTS} must be importable`);
    assert.equal(typeof mod.checkAllInvariants, 'function', 'expected named export `checkAllInvariants`');

    const knownSkills = new Set(tracks().flatMap((t) => (t.nodes ?? []).map((n) => n.skill).filter(Boolean)));
    const errors = mod.checkAllInvariants(tracks(), { knownSkills });
    assert.deepEqual(errors, [], `every track must satisfy I1..I11 after the T6 edits; got:\n  ${(errors ?? []).join('\n  ')}`);
  });

  // AC-018, AC-020 — contract violation.
  it('test_when_selector_alternates_mix_skill_and_sub_track_then_i10_fails', async () => {
    const mod = await tryImport(INVARIANTS);
    assert.ok(mod, `${INVARIANTS} must be importable`);
    assert.equal(typeof mod.checkI10_alternatesCongruent, 'function', 'expected named export `checkI10_alternatesCongruent`');

    const malformed = [{
      track_id: 'mixed',
      selectable: true,
      nodes: [{
        id: 'implementation',
        type: 'selector',
        alternates: [{ sub_track: 'swarm-implementation' }, { skill: 'tdd' }],
        depends_on: [],
      }],
    }];

    const errors = mod.checkI10_alternatesCongruent(malformed);
    assert.ok(
      Array.isArray(errors) && errors.length > 0,
      'a selector mixing skill and sub_track alternates must fail I10 — interchangeable alternates are the whole point of a selector',
    );
    assert.match(
      JSON.stringify(errors),
      /mixed|implementation|alternate/i,
      `the error must name the offending track or node; got ${JSON.stringify(errors)}`,
    );
  });

  // AC-019 — D-1's accepted risk, made a test rather than a hope.
  it('test_when_two_wave_tasks_overlap_write_set_on_shared_isolation_then_boundary_guard_denies', () => {
    const root = mkdtempSync(join(tmpdir(), 'swarm-shared-'));
    try {
      mkdirSync(join(root, '.claude/state/swarm'), { recursive: true });
      mkdirSync(join(root, 'src'), { recursive: true });
      writeFileSync(join(root, '.claude/project.json'), JSON.stringify({
        configured: true,
        swarm: { isolation: 'shared', min_tasks_worth_swarming: 1, enforced_path_prefixes: ['src/'], exempt_path_prefixes: ['.claude/'] },
      }));
      writeFileSync(join(root, '.claude/state/swarm/active_wave.json'), JSON.stringify({
        slug: 'fixture',
        wave: 1,
        write_sets: [{ task_id: 'task-a', files: ['src/alpha.mjs'] }],
      }));

      // emitAllow() exits 0 writing NOTHING; only a denial emits decision JSON.
      // Asserting "not deny" on an empty stdout is the whole contract here.
      const owned = runPreToolUseHook(BOUNDARY_GUARD, writeEditPayload(join(root, 'src/alpha.mjs')), root);
      assert.equal(
        owned.stdout.trim(),
        '',
        'the task that DECLARED the file must still be able to write it — a guard that denies everything is not a barrier, it is a stoppage',
      );

      const foreign = runPreToolUseHook(BOUNDARY_GUARD, writeEditPayload(join(root, 'src/beta.mjs')), root);
      assert.ok(foreign.stdout.trim(), 'a write outside every declared write_set must produce a decision, not silence');
      assert.equal(
        JSON.parse(foreign.stdout).hookSpecificOutput.permissionDecision,
        'deny',
        'under shared isolation the boundary guard is the ONLY barrier between two workers in one tree; a write outside every declared write_set must be denied, never silently applied',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
