// Total coverage over the governed surface (AC-004, AC-009, AC-010).
//
// D2 is the stopping rule the prior cycle lacked: coverage is total over the
// governed surface, at the coarsest anchor that still routes. "Every governed file
// resolves to at least one element" is a test rather than a judgment re-litigated
// each cycle — which is the whole reason to state it mechanically.
//
// The governed surface is OUR code. Third-party-authored trees are excluded: the
// baseline ships and hash-protects them (seed.md Step 5), but they are not ours to
// model, and modelling them would mean maintaining data structures for a system we
// do not own.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport, REPO_ROOT } from './helpers/memory-fixtures.mjs';

const COVERAGE = '.claude/skills/workspace/coverage.mjs';
const MATERIALIZE = '.claude/skills/workspace/materialize.mjs';
const STALE = '.claude/skills/memory-flush/stale-elements.mjs';

async function materializedCorpus() {
  const materialize = await tryImport(MATERIALIZE);
  if (!materialize) return null;
  const { root, memDir } = makeProject();
  materialize.materialize({ memDir, rootDir: REPO_ROOT });
  return { root, memDir };
}

describe('governed-surface coverage', () => {
  it('test_when_governed_surface_scanned_then_no_coverage_gaps', async () => {
    const coverage = await tryImport(COVERAGE);
    assert.ok(coverage, `${COVERAGE} does not exist yet`);
    const ctx = await materializedCorpus();
    assert.ok(ctx, `${MATERIALIZE} does not exist yet`);

    const gaps = coverage.findGaps({ memDir: ctx.memDir, rootDir: REPO_ROOT });

    assert.deepEqual(gaps.map((g) => g.path), [],
      'a governed file routing to no element is a question the map cannot answer');
  });

  it('test_when_third_party_tree_scanned_then_it_is_not_governed', async () => {
    const coverage = await tryImport(COVERAGE);
    assert.ok(coverage, `${COVERAGE} does not exist yet`);

    const governed = coverage.governedFiles({ rootDir: REPO_ROOT });

    const vendored = governed.filter((f) => f.startsWith('.claude/skills/impeccable/'));
    assert.deepEqual(vendored, [], 'impeccable is third-party-authored; the map models our system only');
  });

  it('test_when_prose_and_fixtures_scanned_then_they_are_not_governed', async () => {
    const coverage = await tryImport(COVERAGE);
    assert.ok(coverage, `${COVERAGE} does not exist yet`);

    const governed = coverage.governedFiles({ rootDir: REPO_ROOT });

    assert.ok(!governed.some((f) => f.endsWith('/SKILL.md')), 'SKILL.md is prose, with no interface to digest');
    assert.ok(!governed.some((f) => /(^|\/)fixtures\//.test(f)), 'fixtures are test data, not modelled subjects');
    assert.ok(governed.some((f) => f === '.claude/hooks/git_commit_guard.mjs'), 'real code IS governed');
  });

  it('test_when_corpus_materialized_then_zero_dangling', async () => {
    const ctx = await materializedCorpus();
    assert.ok(ctx, `${MATERIALIZE} does not exist yet`);
    const reconcile = await tryImport('.claude/skills/workspace/reconcile.mjs');
    assert.ok(reconcile, 'reconcile.mjs does not exist yet');

    const verdicts = reconcile.classify(ctx.memDir, { rootDir: REPO_ROOT });
    const dangling = verdicts.filter((v) => v.state === 'dangling').map((v) => v.element_id);

    assert.deepEqual(dangling, [], 'rollout prerequisite 1: no dangling anchor before any consumer reads the layer');
  });

  it('test_when_flag_off_then_stale_listing_is_empty', async () => {
    const stale = await tryImport(STALE);
    assert.ok(stale, `${STALE} does not exist yet`);
    const { root, memDir } = makeProject();
    writeFileSync(join(root, '.claude', 'project.json'),
      JSON.stringify({ memory: { architecture_map: { enabled: false } } }), 'utf8');

    assert.deepEqual(stale.listStale({ memDir, rootDir: root }), [],
      'flag off is byte-identical to pre-backfill behaviour');
  });
});
