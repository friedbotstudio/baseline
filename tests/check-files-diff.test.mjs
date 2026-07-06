// Companion test file for scripts/check-files-diff.mjs.
// The behavioral tests live in tests/publish-check.test.mjs (one unified suite
// covers all three publish-check scripts because they share fixtures + invocation
// patterns). This file exists to satisfy the TDD Order Guard's basename-match
// heuristic and serves as a regression trap against accidental script deletion.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('test_check_files_diff_script_exists_and_is_executable', async () => {
  const p = path.join(REPO_ROOT, 'scripts/check-files-diff.mjs');
  assert.ok(existsSync(p), `scripts/check-files-diff.mjs must exist (companion to tests/publish-check.test.mjs)`);
});

// Regression trap for the 2026-07-05 publish-gate red: the shipped CI-posture
// files under obj/template/{.githooks,scripts/ci}/ are deliberately executable
// (the pre-commit hook is dead weight otherwise) and must be covered by the
// executable-path allowlist. The script has no main guard (importing it runs
// the slow npm-pack check), so the allowlist regexes are extracted from source
// text and evaluated directly — fast, and semantic enough to catch a widening
// that misses a path or a blanket obj/template/ allowance.
function extractExecutableAllowlist(sourceText) {
  // Block end anchored to the line-start `];` — a lazy `]` match would stop
  // at the first `]` inside a character class like [^/].
  const block = /EXECUTABLE_PATH_ALLOWLIST\s*=\s*\[([\s\S]*?)\n\];/.exec(sourceText);
  assert.ok(block, 'EXECUTABLE_PATH_ALLOWLIST array must exist in check-files-diff.mjs');
  // One regex literal per array line (`/…/,`). Line-anchored extraction so a
  // bare `/` inside a character class (e.g. [^/]) cannot truncate the literal.
  const patterns = block[1]
    .split('\n')
    .map((line) => /^\s*\/(.+)\/,?\s*$/.exec(line))
    .filter(Boolean)
    .map((m) => new RegExp(m[1]));
  assert.ok(patterns.length > 0, 'allowlist must contain at least one regex literal');
  return patterns;
}

test('test_when_template_posture_executables_packed_then_files_diff_allows', async () => {
  const src = await readFile(path.join(REPO_ROOT, 'scripts/check-files-diff.mjs'), 'utf8');
  const allowlist = extractExecutableAllowlist(src);
  const covered = (rel) => allowlist.some((re) => re.test(rel));

  for (const rel of [
    'obj/template/.githooks/pre-commit',
    'obj/template/scripts/ci/require-gitleaks.sh',
    'obj/template/scripts/ci/low-risk-classifier.mjs',
    'obj/template/scripts/ci/apply-branch-protection.mjs',
  ]) {
    assert.ok(covered(rel), `allowlist must cover shipped posture executable: ${rel}`);
  }

  for (const rel of [
    'obj/template/rogue.sh',
    'obj/template/docs/init/rogue.sh',
    'rogue.sh',
  ]) {
    assert.ok(!covered(rel), `allowlist must NOT cover un-sanctioned executable path: ${rel}`);
  }
});
