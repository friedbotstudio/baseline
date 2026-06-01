// WF-5 (governance-count-single-source) — audit cross-checks count surfaces.
//
// The audit's count engine (already comparing seed.md vs disk) is generalized
// to a per-surface table that hard-FAILs when a prose surface's literal
// disagrees with the derived count, and a byCategory-sum check that FAILs when
// the skills category breakdown does not add up to the skills total.
//
// RED until: audit.mjs exports checkSurfaceCount + checkByCategorySum
// (and guards its top-level execution so the functions are importable).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT = join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs');

function withTmpFile(name, contents, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'wf5-'));
  try {
    const p = join(dir, name);
    writeFileSync(p, contents);
    return fn(p);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('AC-003 / AC-004 — audit FAILs when a surface literal drifts from the derived count', () => {
  it('test_when_audit_surface_literal_drifts_then_FAIL', async () => {
    const { checkSurfaceCount } = await import(AUDIT);
    // A surface claiming 99 hooks while the derived truth is 22 → FAIL.
    const wrong = withTmpFile('surface.md', 'The 99 hooks enforce the constitution.\n',
      (p) => checkSurfaceCount(p, /\b(\d+|twenty-two)\s+hooks\b/i, 22));
    assert.equal(wrong.status, 'FAIL', 'mismatched literal must FAIL');

    const right = withTmpFile('surface.md', 'The 22 hooks enforce the constitution.\n',
      (p) => checkSurfaceCount(p, /\b(\d+|twenty-two)\s+hooks\b/i, 22));
    assert.equal(right.status, 'PASS', 'matching literal must PASS');
  });
});

describe('AC-008 — audit FAILs when byCategory does not sum to skills.total', () => {
  it('test_when_byCategory_sum_ne_total_then_FAIL', async () => {
    const { checkByCategorySum } = await import(AUDIT);
    const bad = checkByCategorySum({ a: 4, b: 11, c: 24 }, 40); // sums to 39
    assert.equal(bad.status, 'FAIL', 'sum 39 != total 40 must FAIL');
    const good = checkByCategorySum({ a: 4, b: 11, c: 25 }, 40); // sums to 40
    assert.equal(good.status, 'PASS', 'sum 40 == total 40 must PASS');
  });
});
