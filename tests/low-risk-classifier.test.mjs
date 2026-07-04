import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLASSIFIER = join(ROOT, 'scripts/ci/low-risk-classifier.mjs');

function classify(paths) {
  const r = spawnSync('node', [CLASSIFIER, ...paths], { cwd: ROOT, encoding: 'utf8' });
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    // leave null; assertions surface the raw output
  }
  return { ...r, parsed };
}

// One representative per NEVER-list rule from the approved spec (§Slice J1):
// enforcement hooks, control plane, dependency manifests, licence/SBOM,
// governance docs. Every one of these must classify not-low-risk, always.
const NEVER_LIST_REPRESENTATIVES = [
  '.githooks/pre-commit',
  '.claude/hooks/some_guard.mjs',
  '.github/workflows/auto-merge.yml',
  'scripts/ci/low-risk-classifier.mjs',
  'package.json',
  'package-lock.json',
  'LICENSE',
  'NOTICE',
  'CLAUDE.md',
  'docs/init/seed.md',
  '.claude/CONSTITUTION.md',
];

describe('ci-posture — low-risk classifier (AC-010)', () => {
  for (const neverPath of NEVER_LIST_REPRESENTATIVES) {
    it(`test_when_never_list_path_in_diff_then_classifier_returns_low_risk_false — ${neverPath}`, () => {
      const r = classify([neverPath]);
      assert.ok(r.parsed, `classifier must emit JSON on stdout, got: ${r.stdout}\n${r.stderr}`);
      assert.equal(r.parsed.low_risk, false, `${neverPath} must never classify low-risk`);
      assert.ok(
        Array.isArray(r.parsed.reasons) && r.parsed.reasons.length > 0,
        'a not-low-risk verdict must carry at least one reason naming the matched rule',
      );
      assert.equal(r.status, 1, 'exit code must be 1 for not-low-risk');
    });
  }

  it('test_when_docs_only_diff_then_classifier_returns_low_risk_true', () => {
    const r = classify(['docs/runbooks/some-runbook.md', 'site-src/index.njk']);
    assert.ok(r.parsed, `classifier must emit JSON on stdout, got: ${r.stdout}\n${r.stderr}`);
    assert.equal(r.parsed.low_risk, true, 'a docs/site-prose-only diff is low-risk');
    assert.equal(r.status, 0, 'exit code must be 0 for low-risk');
  });

  it('test_when_mixed_docs_and_never_path_then_low_risk_false', () => {
    const r = classify(['docs/runbooks/some-runbook.md', '.claude/hooks/some_guard.mjs']);
    assert.ok(r.parsed, `classifier must emit JSON on stdout, got: ${r.stdout}\n${r.stderr}`);
    assert.equal(r.parsed.low_risk, false, 'NEVER-list takes precedence over the prose allowlist');
    assert.equal(r.status, 1);
  });

  it('test_when_non_allowlisted_source_path_then_low_risk_false', () => {
    const r = classify(['src/cli/install.js']);
    assert.ok(r.parsed, `classifier must emit JSON on stdout, got: ${r.stdout}\n${r.stderr}`);
    assert.equal(
      r.parsed.low_risk,
      false,
      'low-risk is an allowlist of prose surfaces — code off the NEVER-list is still not low-risk',
    );
    assert.equal(r.status, 1);
  });

  it('test_when_empty_path_list_then_low_risk_false', () => {
    const r = classify([]);
    assert.ok(r.parsed, `classifier must emit JSON on stdout, got: ${r.stdout}\n${r.stderr}`);
    assert.equal(r.parsed.low_risk, false, 'an empty diff classifies not-low-risk (fail-safe)');
    assert.equal(r.status, 1);
  });
});
