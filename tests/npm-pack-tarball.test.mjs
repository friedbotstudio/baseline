import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

test('test_npm_pack_excludes_site', () => {
  const output = execSync('npm pack --dry-run --json', {
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
