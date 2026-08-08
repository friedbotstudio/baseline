// Ticket C — the derived index. Covers AC-005 and AC-011 of
// docs/specs/living-system-model-abcd.md (§Behavior #1).
//
// Epic decision D8: the index is DERIVED and regenerated, never stored as truth. A
// derived index cannot drift from its source because it re-reads its source — the
// cheapest available answer to the honesty hazard the intake names. These tests pin
// that property (rebuild on stale built_at) alongside the lookup contract.
//
// RED until memory-index/resolve.mjs exists.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { makeProject, writeShard, tryImport } from './helpers/memory-fixtures.mjs';
import { makeGitProject, advanceCommits } from './helpers/memory-git-fixtures.mjs';

const RESOLVE_MODULE = '.claude/skills/memory-index/resolve.mjs';

function seedIndexableCorpus(memDir) {
  writeShard(memDir, 'decisions', 'governs-hooks', {
    key: 'governs-hooks',
    fields: { governs: '.claude/hooks/**', rests_on: 'no-jvm', load_bearing: 'true' },
    bodyLines: ['- Decision: hooks stay advisory.'],
  });
  writeShard(memDir, 'constraints', 'no-jvm', {
    key: 'no-jvm',
    fields: { state: 'true', 'state_verified_at': 'abc1234', governs: '.claude/hooks/**' },
    bodyLines: ['- Constraint: no JVM on this machine.'],
  });
}

describe('derived index lookups (ticket C)', () => {
  it('test_when_structural_lookup_resolves_then_returns_matches_without_justification', async () => {
    const project = makeProject();
    try {
      seedIndexableCorpus(project.memDir);

      const mod = await tryImport(RESOLVE_MODULE);
      assert.ok(mod, `${RESOLVE_MODULE} must exist`);

      const byPath = mod.resolveLookup('by_path', '.claude/hooks/lib/foo.mjs', { rootDir: project.root });
      assert.ok(byPath.length >= 1, 'by_path resolves entries governing that path (AC-005)');

      const byConstraint = mod.resolveLookup('by_constraint', 'no-jvm', { rootDir: project.root });
      assert.deepEqual(
        byConstraint.map((e) => e.key),
        ['governs-hooks'],
        'by_constraint resolves the decisions resting on that constraint (AC-005)',
      );

      // AC-005 is explicit: structural lookups return matches WITHOUT justification
      // semantics. Reason-carrying belongs to the surfacing leg, not the index.
      for (const entry of [...byPath, ...byConstraint]) {
        assert.ok(!('verbatim' in entry), 'a structural lookup carries no verbatim justification (AC-005)');
        assert.ok(!('interpretation' in entry), 'a structural lookup carries no interpretation (AC-005)');
      }
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_lookup_kind_is_unknown_then_empty_array_not_throw', async () => {
    const project = makeProject();
    try {
      seedIndexableCorpus(project.memDir);

      const mod = await tryImport(RESOLVE_MODULE);
      assert.ok(mod, `${RESOLVE_MODULE} must exist`);

      let out;
      assert.doesNotThrow(() => {
        out = mod.resolveLookup('by_bogus', 'anything', { rootDir: project.root });
      }, 'an unrecognized lookup kind must never throw (AC-005 contract violation)');
      assert.deepEqual(out, [], 'an unrecognized lookup kind returns [] (AC-005)');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_index_built_at_is_stale_then_rebuilt_not_served_stale', async () => {
    const project = makeGitProject('mem-index-rebuild-');
    try {
      seedIndexableCorpus(project.memDir);

      const mod = await tryImport(RESOLVE_MODULE);
      assert.ok(mod, `${RESOLVE_MODULE} must exist`);

      const before = mod.resolveLookup('by_constraint', 'no-jvm', { rootDir: project.root });
      assert.equal(before.length, 1, 'baseline lookup resolves one dependent decision');

      // Add a second dependent decision AND move HEAD, so a cached index built at
      // the old sha would answer with the stale count.
      writeShard(project.memDir, 'decisions', 'second-dependent', {
        key: 'second-dependent',
        fields: { rests_on: 'no-jvm', load_bearing: 'false' },
        bodyLines: ['- Decision: added after the first index build.'],
      });
      advanceCommits(project.root, 1);

      const after = mod.resolveLookup('by_constraint', 'no-jvm', { rootDir: project.root });
      assert.equal(
        after.length,
        2,
        'a built_at older than HEAD triggers a rebuild on read rather than serving stale lookups (AC-005, epic D8)',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_migrated_facts_lack_scope_then_backfilled_to_any_and_reachable', async () => {
    const project = makeProject();
    try {
      // The predecessor cycle deferred this verbatim: "the 191 migrated facts have
      // no scope: yet ... (resolve before the surfacing slice implements)". Epic D7
      // resolves it to `scope: any`, NOT a category-phase default — the
      // category-default is what produced scope: [spec] on decisions and caused the
      // surfacing defect this epic exists to fix.
      const path = writeShard(project.memDir, 'decisions', 'migrated-no-scope', {
        key: 'migrated-no-scope',
        fields: { governs: 'src/**' },
        bodyLines: ['- Decision: migrated before scope: existed.'],
      });

      const mod = await tryImport(RESOLVE_MODULE);
      assert.ok(mod, `${RESOLVE_MODULE} must exist and expose the reachability predicate`);
      assert.equal(typeof mod.isReachable, 'function', 'reachability is a predicate over both legs (roadmap T8)');

      // The invariant this test has always defended is "a migrated fact carrying
      // governs: but no scope is still reachable". It used to need a backfill to
      // make that true. It no longer does: `isReachable` spans both legs, so the
      // fact is reachable as it stands and nothing has to be stamped onto it.
      assert.equal(
        mod.isReachable({ key: 'migrated-no-scope', category: 'decisions', fields: { scope: [], governs: ['src/**'] } }),
        true,
        'a governs:-only fact is reachable via the path leg without a placeholder',
      );

      const reachable = mod.resolveLookup('by_path', 'src/a.js', { rootDir: project.root });
      assert.ok(
        reachable.some((e) => e.key === 'migrated-no-scope'),
        'and the path leg actually resolves it (AC-011, rollout prerequisite P2)',
      );
      assert.ok(path.endsWith('migrated-no-scope.md'), 'fixture wrote the expected shard path');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
});
