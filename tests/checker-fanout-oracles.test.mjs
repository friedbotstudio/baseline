// C5 — the two non-UI oracles ride the checker registry (non-ui-oracle-c5).
// RED until checker-fanout.mjs registers mutation-score + ac-conformance.
// Covers: AC-005 (both registered under phase code-review), AC-006 (both flags off
// -> the two adapters contribute no findings; merged verdict CLEAN — no regression).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FANOUT = join(REPO_ROOT, '.claude/skills/harness/checker-fanout.mjs');

function tmpRootBothOff() {
  const root = mkdtempSync(join(tmpdir(), 'fanout-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude', 'project.json'), JSON.stringify({
    velocity: { mutation_oracle: { enabled: false }, ac_conformance: { enabled: false } },
  }));
  return root;
}

describe('C5 registry membership', () => {
  it('test_when_both_registered_under_code_review_then_present', async () => {
    const { DEFAULT_CHECKER_REGISTRY } = await import(FANOUT);
    for (const name of ['mutation-score', 'ac-conformance']) {
      const a = DEFAULT_CHECKER_REGISTRY[name];
      assert.ok(a, `${name} registered`);
      assert.equal(a.phase, 'code-review');
      assert.equal(typeof a.run, 'function');
    }
  });
});

describe('C5 zero-regression with both flags off', () => {
  it('test_when_both_flags_off_then_code_review_verdict_unchanged', async () => {
    const { DEFAULT_CHECKER_REGISTRY, mergeVerdicts } = await import(FANOUT);
    const root = tmpRootBothOff();
    const ctx = { rootDir: root, slug: 'x', changedFiles: [], diffContent: '' };
    const verdicts = [];
    for (const name of ['mutation-score', 'ac-conformance']) {
      verdicts.push({ checker: name, ...(await DEFAULT_CHECKER_REGISTRY[name].run(ctx)) });
    }
    const merged = mergeVerdicts(verdicts);
    assert.equal(merged.verdict, 'CLEAN');
    assert.deepEqual(merged.findings, [], 'off adapters contribute no findings');
  });
});
