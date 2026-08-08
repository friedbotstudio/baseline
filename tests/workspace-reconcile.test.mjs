// Ticket E3 — scout reconciliation (AC-006, AC-007).
//
// AC-006 is the literal upstream epic AC-008: a cycle touching one slice gets a
// DELTA, not a full re-derivation. AC-007 is the fail-open half — an absent corpus
// degrades to discovery and never throws, matching the surfaceScopedMemory contract
// every other memory consumer already honours.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport, REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { makeWorkspace, seedCorpus } from './helpers/workspace-fixtures.mjs';

const RECONCILE = '.claude/skills/workspace/reconcile.mjs';

describe('E3 — scout reconciliation', () => {
  it('test_when_slice_touches_two_of_twenty_anchors_then_delta_names_only_those_two', async () => {
    const rec = await tryImport(RECONCILE);
    assert.ok(rec, `${RECONCILE} does not exist yet`);
    const { specDir } = makeProject();
    seedCorpus(specDir, 20);

    const result = rec.reconcile({ specDir, touchedPaths: ['area-3/file.mjs', 'area-11/other.mjs'] });

    assert.equal(result.mode, 'reconcile', 'a populated corpus must reconcile, not re-derive');
    assert.deepEqual(
      [...result.delta.changed].sort(),
      ['el-11', 'el-3'],
      'the delta must name only the touched elements — this is what makes it a delta',
    );
    assert.ok(result.delta.changed.length < 20, 'a delta that names every element is a re-derivation');
  });

  it('test_when_corpus_absent_then_discovery_mode_and_never_throws', async () => {
    const rec = await tryImport(RECONCILE);
    assert.ok(rec, `${RECONCILE} does not exist yet`);

    const noDir = makeProject();
    const absent = rec.reconcile({ specDir: noDir.specDir, touchedPaths: ['anything/x.mjs'] });
    assert.equal(absent.mode, 'discovery', 'absent corpus must fall back to discovery');
    assert.equal(absent.delta, null);

    const emptyDir = makeProject();
    makeWorkspace(emptyDir.specDir);
    const empty = rec.reconcile({ specDir: emptyDir.specDir, touchedPaths: ['anything/x.mjs'] });
    assert.equal(empty.mode, 'discovery', 'empty corpus must also fall back to discovery');
  });

  it('test_when_corpus_has_zero_one_and_many_elements_then_mode_boundary_correct', async () => {
    const rec = await tryImport(RECONCILE);
    assert.ok(rec, `${RECONCILE} does not exist yet`);

    const cases = [
      { count: 0, expected: 'discovery' },
      { count: 1, expected: 'reconcile' },
      { count: 5, expected: 'reconcile' },
    ];
    for (const { count, expected } of cases) {
      const { specDir } = makeProject();
      seedCorpus(specDir, count);
      const result = rec.reconcile({ specDir, touchedPaths: ['area-0/f.mjs'] });
      assert.equal(result.mode, expected, `corpus of ${count} should resolve to ${expected}`);
    }
  });

  // @kind:wiring — the producer half. reconcile.mjs existing proves nothing if no
  // phase calls it; that is exactly how document-gate.mjs shipped as an orphan that
  // could only ever BLOCK. A green behavioural test plus an unwired consumer is the
  // documented failure shape, so the invocation itself is asserted here.
  //
  // The invocation MOVED at the dispatcher sweep: scout now calls
  // `workspace/cli.mjs reconcile   # wraps workspace/reconcile.mjs -> reconcile`.
  // The module path survives in that trailing comment, so the original regex still
  // matches — but only by way of a comment, which is a thin thread for a wiring
  // guard to hang on. The oracle accepts either spelling so the next person to
  // reword that line need not rediscover why this broke. The property is that some
  // executable step in scout's Method reaches reconcile; the module path was only
  // ever a proxy for it.
  const INVOKES_RECONCILE = /workspace\/(reconcile\.mjs|cli\.mjs\s+reconcile)/;

  it('test_when_scout_runs_then_it_invokes_reconcile_before_discovering', () => {
    const skill = readFileSync(join(REPO_ROOT, '.claude/skills/scout/SKILL.md'), 'utf8');
    assert.match(
      skill,
      INVOKES_RECONCILE,
      'scout/SKILL.md must invoke reconcile — an uninvoked module is an orphan, not a feature',
    );
    assert.match(
      skill,
      /mode:\s*"reconcile"/,
      'scout must branch on the returned mode, not merely mention the module',
    );
    const methodStart = skill.indexOf('# Method');
    assert.ok(
      skill.search(INVOKES_RECONCILE) > methodStart,
      'the reconcile call must live in the Method scout actually follows',
    );
  });

  it('test_when_docs_specs_written_then_phase_scoped_surfacing_still_fires', async () => {
    const scoped = await tryImport('.claude/hooks/lib/scoped-memory.mjs');
    assert.ok(scoped, 'scoped-memory.mjs must still exist — E3 must not disturb the phase trigger');
    assert.equal(
      typeof scoped.surfaceScopedMemory,
      'function',
      'the scope:-keyed phase trigger must survive E3 unchanged (two vocabularies, one code path)',
    );
  });
});
