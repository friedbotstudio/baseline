import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, chmod, readFile } from 'node:fs/promises';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRE_GITLEAKS = join(ROOT, 'scripts/ci/require-gitleaks.sh');
const PRE_COMMIT = join(ROOT, '.githooks/pre-commit');

// gitleaks is never installed in /usr/bin or /bin (Homebrew/apt place it
// elsewhere), so this PATH simulates "binary absent" while keeping shell
// builtins and coreutils resolvable.
const PATH_WITHOUT_GITLEAKS = '/usr/bin:/bin';

function runRequireGitleaks(env) {
  return spawnSync('bash', [REQUIRE_GITLEAKS], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...env },
  });
}

describe('ci-posture — require-gitleaks.sh (AC-010)', () => {
  let stubDir;
  let captureFile;

  before(async () => {
    stubDir = await mkdtemp(join(tmpdir(), 'gitleaks-stub-'));
    captureFile = join(stubDir, 'capture.txt');
  });

  after(async () => {
    if (stubDir) await rm(stubDir, { recursive: true, force: true });
  });

  async function writeStub({ exitCode }) {
    const stubPath = join(stubDir, 'gitleaks');
    await writeFile(
      stubPath,
      `#!/bin/sh\necho "$@" > "${captureFile}"\nexit ${exitCode}\n`,
    );
    await chmod(stubPath, 0o755);
  }

  it('test_when_gitleaks_absent_then_require_gitleaks_exits_1_naming_install_cmd', () => {
    const r = runRequireGitleaks({ PATH: PATH_WITHOUT_GITLEAKS });
    assert.equal(r.status, 1, `expected hard-fail exit 1, got ${r.status}\n${r.stdout}${r.stderr}`);
    const out = r.stdout + r.stderr;
    assert.match(out, /gitleaks/i, 'failure message must name gitleaks');
    assert.match(
      out,
      /brew install gitleaks/,
      'failure message must name a concrete install command',
    );
    assert.match(
      out,
      /github\.com\/gitleaks\/gitleaks/,
      'failure message must point at the gitleaks project for non-brew platforms',
    );
  });

  it('test_when_gitleaks_present_then_staged_scan_invoked', async () => {
    await writeStub({ exitCode: 0 });
    const r = runRequireGitleaks({ PATH: `${stubDir}:${PATH_WITHOUT_GITLEAKS}` });
    assert.equal(r.status, 0, `expected exit 0 with stub gitleaks, got ${r.status}\n${r.stdout}${r.stderr}`);
    const recorded = await readFile(captureFile, 'utf8');
    assert.match(recorded, /staged/, 'gitleaks must be invoked as a staged-diff scan');
  });

  it('test_when_gitleaks_scan_fails_then_require_gitleaks_propagates_nonzero', async () => {
    await writeStub({ exitCode: 9 });
    const r = runRequireGitleaks({ PATH: `${stubDir}:${PATH_WITHOUT_GITLEAKS}` });
    assert.notEqual(r.status, 0, 'a failing gitleaks scan must hard-fail the commit');
  });

  it('test_precommit_hook_is_executable_and_delegates_to_require_gitleaks', () => {
    assert.ok(existsSync(PRE_COMMIT), '.githooks/pre-commit must exist');
    const mode = statSync(PRE_COMMIT).mode;
    assert.ok((mode & 0o111) !== 0, '.githooks/pre-commit must be executable');
    const src = readFileSync(PRE_COMMIT, 'utf8');
    assert.match(src, /require-gitleaks\.sh/, 'pre-commit must delegate to scripts/ci/require-gitleaks.sh');
    assert.match(
      src,
      /git rev-parse --show-toplevel/,
      'pre-commit must resolve the repo root (template-ready; no hardcoded repo path)',
    );
  });
});
