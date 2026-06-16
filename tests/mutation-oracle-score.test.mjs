// tier-oracle-floor-dial — mutation-oracle score + surface tests (AC-004, AC-005).
//
// RED until scripts/mutation-oracle.mjs exports computeScore + surfaceComparison
// and emitAdvisory persists {score, floor, relation}. The advisory invariant is
// load-bearing: BELOW floor must NOT write last_test_result (piece 5 owns blocking).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORACLE = join(REPO_ROOT, 'scripts/mutation-oracle.mjs');
const load = () => import(ORACLE);

const report = (statuses) => ({ files: { 'a.mjs': { mutants: statuses.map((status) => ({ status })) } } });

describe('mutation-oracle score + surface', () => {
  it('test_when_report_has_mutants_then_score_is_killed_over_total', async () => {
    const { computeScore } = await load();
    assert.equal(computeScore(report(['Killed', 'Survived', 'Killed', 'Killed'])), 0.75);
  });

  it('test_when_report_has_zero_mutants_then_score_is_null', async () => {
    const { computeScore } = await load();
    assert.equal(computeScore({ files: {} }), null);
    assert.equal(computeScore(report([])), null);
  });

  it('test_when_score_vs_floor_then_relation_is_above_below_or_na', async () => {
    const { surfaceComparison } = await load();
    assert.deepEqual(surfaceComparison(0.90, 0.85), { score: 0.90, floor: 0.85, relation: 'ABOVE' });
    assert.equal(surfaceComparison(0.85, 0.85).relation, 'ABOVE');
    assert.equal(surfaceComparison(0.50, 0.85).relation, 'BELOW');
    assert.equal(surfaceComparison(null, 0.85).relation, 'NA');
    assert.equal(surfaceComparison(0.9, null).relation, 'NA');
  });

  it('test_when_oracle_emits_below_floor_then_advisory_no_last_test_result', async () => {
    const { emitAdvisory } = await load();
    const dir = mkdtempSync(join(tmpdir(), 'mo-'));
    try {
      const stateDir = join(dir, '.claude/state');
      const out = emitAdvisory(
        {
          scopeModule: 'x.mjs', mutantsTotal: 2,
          survivors: [{ file: 'x.mjs', line: 1, mutationKind: 'X' }],
          score: 0.5, floor: 0.85, relation: 'BELOW',
        },
        { stateDir, generatedAt: '2026-01-01T00:00:00Z' },
      );
      const written = JSON.parse(readFileSync(out, 'utf8'));
      assert.equal(written.score, 0.5);
      assert.equal(written.floor, 0.85);
      assert.equal(written.relation, 'BELOW');
      assert.equal(written.advisory, true);
      assert.equal(existsSync(join(stateDir, 'last_test_result')), false, 'advisory: never writes last_test_result');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
