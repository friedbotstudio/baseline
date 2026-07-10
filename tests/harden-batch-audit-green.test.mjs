// harden-power-track-debt batch gate — the audit stays green after the batch lands.
//
// AC-011: the drift oracle and CI both gate on audit-baseline; assert it directly
// rather than trusting a downstream phase to notice. (AC-012, "full suite green",
// is a universal integrate invariant, not an acceptance criterion of this change —
// see spec Rollout; it is not represented as an AC here.)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

describe('the baseline audit stays green after the batch', () => {
  // AC-011
  it('test_when_audit_baseline_runs_then_it_exits_zero', () => {
    const audit = path.join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs');
    const result = spawnSync('node', [audit], { cwd: REPO_ROOT, encoding: 'utf8' });
    assert.equal(
      result.status,
      0,
      `audit-baseline must exit 0\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  });
});
