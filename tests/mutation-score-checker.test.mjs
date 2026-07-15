// C5 — mutation-score checker adapter (non-ui-oracle-c5).
// RED until .claude/skills/harness/checkers/mutation-score.mjs exists.
// Covers: AC-001 (flag off -> no findings, oracle not invoked),
// AC-002 (score < mandatory floor -> BLOCKER; < non-mandatory floor -> ADVISORY;
// at/above floor -> none). Verdict model is binary on floor, severity from mandatory
// (ceiling is a rounds count, not a score band).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOD = join(REPO_ROOT, '.claude/skills/harness/checkers/mutation-score.mjs');

function tmpRootWithFlag(enabled) {
  const root = mkdtempSync(join(tmpdir(), 'mut-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude', 'project.json'),
    JSON.stringify({ velocity: { mutation_oracle: { enabled } } }));
  return root;
}

describe('C5 mutation-score verdictFromScore', () => {
  it('test_when_score_below_mandatory_floor_then_blocker', async () => {
    const { verdictFromScore } = await import(MOD);
    const f = verdictFromScore(0.2, { floor: 0.5, mandatory: true });
    assert.equal(f.severity, 'BLOCKER');
    assert.equal(f.checker, 'mutation-score');
    assert.match(f.message, /0\.2|0\.5/);
  });

  it('test_when_score_below_nonmandatory_floor_then_advisory', async () => {
    const { verdictFromScore } = await import(MOD);
    const f = verdictFromScore(0.2, { floor: 0.5, mandatory: false });
    assert.equal(f.severity, 'ADVISORY');
  });

  it('test_when_score_at_or_above_floor_then_no_finding', async () => {
    const { verdictFromScore } = await import(MOD);
    assert.equal(verdictFromScore(0.5, { floor: 0.5, mandatory: true }), null);
    assert.equal(verdictFromScore(0.95, { floor: 0.5, mandatory: true }), null);
    assert.equal(verdictFromScore(null, { floor: 0.5, mandatory: true }), null);
  });
});

describe('C5 mutation-score adapter run(ctx)', () => {
  it('test_when_mutation_flag_off_then_no_findings', async () => {
    const { mutationScoreAdapter } = await import(MOD);
    assert.equal(mutationScoreAdapter.phase, 'code-review');
    let called = false;
    const ctx = {
      rootDir: tmpRootWithFlag(false),
      changedFiles: ['.claude/skills/harness/checkers/mutation-score.mjs'],
      oracleRunner: () => { called = true; return 0.1; },
    };
    const out = await mutationScoreAdapter.run(ctx);
    assert.deepEqual(out.findings, []);
    assert.equal(called, false, 'oracle runner must not be invoked when the flag is off');
  });
});
