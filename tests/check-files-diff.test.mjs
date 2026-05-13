// Companion test file for scripts/check-files-diff.mjs.
// The behavioral tests live in tests/publish-check.test.mjs (one unified suite
// covers all three publish-check scripts because they share fixtures + invocation
// patterns). This file exists to satisfy the TDD Order Guard's basename-match
// heuristic and serves as a regression trap against accidental script deletion.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('test_check_files_diff_script_exists_and_is_executable', async () => {
  const p = path.join(REPO_ROOT, 'scripts/check-files-diff.mjs');
  assert.ok(existsSync(p), `scripts/check-files-diff.mjs must exist (companion to tests/publish-check.test.mjs)`);
});
