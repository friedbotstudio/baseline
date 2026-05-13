// Companion test file for scripts/smoke-tarball.mjs.
// The behavioral tests live in tests/publish-check.test.mjs (one unified suite
// covers all three publish-check scripts). This file is a regression trap.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('test_smoke_tarball_script_exists', async () => {
  const p = path.join(REPO_ROOT, 'scripts/smoke-tarball.mjs');
  assert.ok(existsSync(p), `scripts/smoke-tarball.mjs must exist (companion to tests/publish-check.test.mjs)`);
});
