// Behavior of scripts/install-smoke-verify.mjs.
//
// The script is invoked by the release workflow's install-smoke job after
// installing the published tarball and running the CLI against a target dir.
// Its job: verify every files{}-hash in the PUBLISHED manifest matches the
// corresponding entry in the MATERIALIZED manifest the CLI wrote into the
// target. Mismatch ⇒ exit non-zero + emit `HASH_MISMATCH: <path>`.
//
// Inputs (CLI args): <published-manifest-path> <materialized-manifest-path>.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/install-smoke-verify.mjs');

async function writeManifest(dir, name, files) {
  const p = join(dir, name);
  await writeFile(p, JSON.stringify({ manifest_version: 2, files }, null, 2));
  return p;
}

function runScript(...args) {
  return spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', timeout: 15_000 });
}

describe('install-smoke-verify — published vs materialized manifest hash diff', () => {
  it('test_when_all_published_keys_match_materialized_hashes_then_exits_zero', async () => {
    assert.ok(existsSync(SCRIPT), `scripts/install-smoke-verify.mjs missing at ${SCRIPT}`);
    const dir = await mkdtemp(join(tmpdir(), 'install-smoke-match-'));
    const published = await writeManifest(dir, 'published.json', {
      'a.txt': 'aaaa',
      'b.txt': 'bbbb',
    });
    const materialized = await writeManifest(dir, 'materialized.json', {
      'a.txt': 'aaaa',
      'b.txt': 'bbbb',
    });
    const result = runScript(published, materialized);
    assert.equal(result.status, 0, `expected exit 0; got ${result.status}\nstderr: ${result.stderr}`);
    assert.match(result.stdout, /install-smoke OK/, `expected success summary; got: ${result.stdout}`);
  });

  it('test_when_a_published_key_hash_differs_from_materialized_then_exits_non_zero_with_hash_mismatch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'install-smoke-mismatch-'));
    const published = await writeManifest(dir, 'published.json', {
      'a.txt': 'aaaa',
      'b.txt': 'bbbb',
    });
    const materialized = await writeManifest(dir, 'materialized.json', {
      'a.txt': 'aaaa',
      'b.txt': 'TAMPERED',
    });
    const result = runScript(published, materialized);
    assert.notEqual(result.status, 0, `expected non-zero exit on hash mismatch; got ${result.status}`);
    assert.match(
      result.stderr + result.stdout,
      /HASH_MISMATCH:\s*b\.txt/,
      `expected HASH_MISMATCH: b.txt in output; got stdout=${result.stdout} stderr=${result.stderr}`
    );
  });

  it('test_when_a_published_key_is_missing_from_materialized_then_exits_non_zero', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'install-smoke-missing-'));
    const published = await writeManifest(dir, 'published.json', {
      'a.txt': 'aaaa',
      'b.txt': 'bbbb',
    });
    const materialized = await writeManifest(dir, 'materialized.json', {
      'a.txt': 'aaaa',
      // b.txt missing entirely
    });
    const result = runScript(published, materialized);
    assert.notEqual(result.status, 0, `expected non-zero exit on missing key; got ${result.status}`);
    assert.match(
      result.stderr + result.stdout,
      /HASH_MISMATCH:\s*b\.txt/,
      'missing keys in materialized must surface as HASH_MISMATCH on that key'
    );
  });

  it('test_when_materialized_has_extra_keys_not_in_published_then_exits_zero_ignoring_extras', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'install-smoke-extras-'));
    const published = await writeManifest(dir, 'published.json', {
      'a.txt': 'aaaa',
    });
    const materialized = await writeManifest(dir, 'materialized.json', {
      'a.txt': 'aaaa',
      'c.txt': 'extra-not-published-but-present',
    });
    const result = runScript(published, materialized);
    assert.equal(
      result.status,
      0,
      `materialized may contain keys absent from published (e.g., locally-generated state); got exit ${result.status}\nstderr: ${result.stderr}`
    );
  });

  it('test_when_invoked_without_both_args_then_exits_non_zero_with_usage_message', () => {
    const result = runScript();
    assert.notEqual(result.status, 0, 'no args: expected non-zero exit');
    assert.match(
      result.stderr,
      /usage:.*install-smoke-verify/i,
      `expected usage hint; got stderr: ${result.stderr}`
    );
  });

  it('test_when_a_manifest_file_is_missing_then_exits_non_zero_with_clear_error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'install-smoke-nofile-'));
    const result = runScript(join(dir, 'does-not-exist.json'), join(dir, 'also-missing.json'));
    assert.notEqual(result.status, 0, 'missing manifest file must exit non-zero');
    assert.match(
      result.stderr,
      /(ENOENT|not found|no such file)/i,
      `expected file-not-found error; got: ${result.stderr}`
    );
  });
});
