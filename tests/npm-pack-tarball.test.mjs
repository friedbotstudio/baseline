// Regression trap: the published tarball must never include site/ sources.
// Runs in the DEFAULT tier. Uses `--ignore-scripts` so `npm pack` does NOT run
// prepack → build-template.sh (which would rebuild the live obj/template and
// race parallel readers). --dry-run still reports the file list from the
// already-built tree on disk, so this is both deterministic and cheap (no rsync,
// no rebuild). See packaging-smoke-isolated.test.mjs for the fuller file-list smoke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

test('test_npm_pack_excludes_site', () => {
  const output = execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch (err) {
    assert.fail(`npm pack --dry-run --json returned non-parseable JSON: ${err.message}`);
  }

  assert.ok(Array.isArray(parsed), 'npm pack --dry-run --json must return a JSON array');
  assert.ok(parsed.length > 0, 'npm pack --dry-run --json array must be non-empty');

  const files = parsed[0].files ?? [];
  const siteFiles = files.filter(
    (f) => f.path.startsWith('site/') || f.path.startsWith('site\\')
  );

  assert.equal(
    siteFiles.length,
    0,
    `npm pack tarball must not include any site/ files — found: ${siteFiles.map((f) => f.path).join(', ')}`
  );
});
