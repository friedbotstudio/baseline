// Static-file invariants for package.json — runtime dep footprint + retired description claim.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function readPackageJson() {
  const text = await readFile(join(REPO_ROOT, 'package.json'), 'utf8');
  return JSON.parse(text);
}

describe('package.json — runtime dependency posture', () => {
  it('test_when_npm_ls_omit_dev_prod_then_only_clack_prompts_top_level', async () => {
    const pkg = await readPackageJson();
    const depKeys = Object.keys(pkg.dependencies || {});
    assert.deepEqual(
      depKeys,
      ['@clack/prompts'],
      `expected dependencies = ['@clack/prompts']; got ${JSON.stringify(depKeys)}`
    );
  });
});

describe('package.json — description', () => {
  it('test_when_package_json_description_then_no_zero_dependency_string', async () => {
    const pkg = await readPackageJson();
    assert.equal(typeof pkg.description, 'string', 'description must be a string');
    assert.ok(
      !pkg.description.toLowerCase().includes('zero-dependency'),
      `description must not claim "Zero-dependency"; got: ${pkg.description}`
    );
  });
});
