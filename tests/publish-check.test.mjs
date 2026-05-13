import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const PUBLISH_CHECK = path.join(REPO_ROOT, 'scripts/publish-check.sh');
const CHECK_FILES_DIFF = path.join(REPO_ROOT, 'scripts/check-files-diff.mjs');
const SMOKE_TARBALL = path.join(REPO_ROOT, 'scripts/smoke-tarball.mjs');

describe('publish:check — orchestrator (AC-001, AC-008)', () => {
  it('test_when_publish_check_runs_on_current_tree_then_exits_zero_with_pass_summary', () => {
    if (!existsSync(PUBLISH_CHECK)) {
      assert.fail(`scripts/publish-check.sh does not exist yet — implement worker must create it`);
    }
    const result = spawnSync('bash', [PUBLISH_CHECK], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 90_000,
    });
    assert.equal(
      result.status,
      0,
      `publish-check.sh must exit 0 on current tree; got status=${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
    const combined = (result.stdout || '') + (result.stderr || '');
    assert.match(
      combined,
      /PASS:.*(precheck|files-diff|smoke)/i,
      `summary must name at least one PASSED sub-check; got: ${combined.slice(-500)}`
    );
  });

  it('test_when_orchestrator_sub_check_fails_then_summary_names_failing_sub_check', () => {
    if (!existsSync(PUBLISH_CHECK)) {
      assert.fail(`scripts/publish-check.sh does not exist yet — implement worker must create it`);
    }
    const result = spawnSync('bash', [PUBLISH_CHECK], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, PUBLISH_CHECK_SIMULATE_FAIL: 'files-diff' },
    });
    assert.notEqual(
      result.status,
      0,
      `orchestrator must exit non-zero when PUBLISH_CHECK_SIMULATE_FAIL=files-diff; got status=${result.status}`
    );
    const combined = (result.stdout || '') + (result.stderr || '');
    assert.match(
      combined,
      /FAIL:\s*files-diff/i,
      `summary must name the failing sub-check (files-diff); got: ${combined.slice(-500)}`
    );
  });
});

describe('check-files-diff (AC-002, AC-007)', () => {
  it('test_when_check_files_diff_runs_on_current_tree_then_reports_symmetric_clean', () => {
    if (!existsSync(CHECK_FILES_DIFF)) {
      assert.fail(`scripts/check-files-diff.mjs does not exist yet — implement worker must create it`);
    }
    const result = spawnSync('node', [CHECK_FILES_DIFF], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(
      result.status,
      0,
      `check-files-diff.mjs must exit 0 on current tree; got status=${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
    );
    assert.match(
      result.stdout,
      /files-diff:\s*clean\s*\(\d+\s*declared/i,
      `clean output must name declared prefix count; got: ${result.stdout}`
    );
  });

  it('test_when_files_diff_sees_declared_prefix_with_zero_packed_matches_then_exits_one_with_named_violation', async () => {
    if (!existsSync(CHECK_FILES_DIFF)) {
      assert.fail(`scripts/check-files-diff.mjs does not exist yet — implement worker must create it`);
    }
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'files-diff-declared-'));
    try {
      await fs.writeFile(
        path.join(tmp, 'package.json'),
        JSON.stringify(
          {
            name: 'synth-pkg',
            version: '0.0.0',
            files: ['bin/', 'foobar-does-not-exist/'],
          },
          null,
          2
        )
      );
      await fs.mkdir(path.join(tmp, 'bin'), { recursive: true });
      await fs.writeFile(path.join(tmp, 'bin/cli.js'), '#!/usr/bin/env node\n');
      const result = spawnSync('node', [CHECK_FILES_DIFF], {
        cwd: tmp,
        encoding: 'utf8',
        timeout: 30_000,
      });
      assert.notEqual(result.status, 0, 'must exit non-zero when a declared prefix has no packed files');
      const combined = (result.stdout || '') + (result.stderr || '');
      assert.match(
        combined,
        /DECLARED-NOT-PACKED.*foobar-does-not-exist/i,
        `must name the offending prefix; got: ${combined.slice(-500)}`
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_files_diff_sees_packed_path_outside_declared_prefixes_then_exits_one_with_named_violation', async () => {
    if (!existsSync(CHECK_FILES_DIFF)) {
      assert.fail(`scripts/check-files-diff.mjs does not exist yet — implement worker must create it`);
    }
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'files-diff-packed-'));
    try {
      await fs.writeFile(
        path.join(tmp, 'package.json'),
        JSON.stringify(
          {
            name: 'synth-pkg',
            version: '0.0.0',
            files: ['README.md'],
          },
          null,
          2
        )
      );
      await fs.writeFile(path.join(tmp, 'README.md'), '# synth\n');
      await fs.mkdir(path.join(tmp, 'bin'), { recursive: true });
      await fs.writeFile(path.join(tmp, 'bin/cli.js'), '#!/usr/bin/env node\n');
      await fs.chmod(path.join(tmp, 'bin/cli.js'), 0o755);
      await fs.writeFile(
        path.join(tmp, 'package.json'),
        JSON.stringify(
          {
            name: 'synth-pkg',
            version: '0.0.0',
            bin: { 'synth-cli': 'bin/cli.js' },
            files: ['README.md'],
          },
          null,
          2
        )
      );
      const result = spawnSync('node', [CHECK_FILES_DIFF], {
        cwd: tmp,
        encoding: 'utf8',
        timeout: 30_000,
      });
      assert.notEqual(
        result.status,
        0,
        'must exit non-zero when a packed file is not covered by any declared prefix'
      );
      const combined = (result.stdout || '') + (result.stderr || '');
      assert.match(
        combined,
        /PACKED-NOT-DECLARED/i,
        `must report PACKED-NOT-DECLARED violation; got: ${combined.slice(-500)}`
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('smoke-tarball (AC-006, AC-003)', () => {
  it('test_when_smoke_tarball_runs_on_current_tree_then_installs_and_assertions_pass', () => {
    if (!existsSync(SMOKE_TARBALL)) {
      assert.fail(`scripts/smoke-tarball.mjs does not exist yet — implement worker must create it`);
    }
    const result = spawnSync('node', [SMOKE_TARBALL], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 180_000,
    });
    assert.equal(
      result.status,
      0,
      `smoke-tarball.mjs must exit 0 on current tree; got status=${result.status}\nstdout (last 1k): ${(result.stdout || '').slice(-1000)}\nstderr (last 1k): ${(result.stderr || '').slice(-1000)}`
    );
    assert.match(
      result.stdout,
      /phase=pack/i,
      `smoke must emit phase=pack log line; got: ${result.stdout.slice(-500)}`
    );
    assert.match(
      result.stdout,
      /phase=assert/i,
      `smoke must emit phase=assert log line; got: ${result.stdout.slice(-500)}`
    );
  });

  it('test_when_smoke_runs_against_tarball_missing_manifest_then_exits_with_named_missing_file', async () => {
    if (!existsSync(SMOKE_TARBALL)) {
      assert.fail(`scripts/smoke-tarball.mjs does not exist yet — implement worker must create it`);
    }
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-broken-'));
    try {
      execFileSync('npm', ['pack', '--pack-destination', workDir], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 120_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const tarballs = (await fs.readdir(workDir)).filter((f) => f.endsWith('.tgz'));
      assert.ok(tarballs.length === 1, `expected exactly one tarball, got: ${tarballs.join(', ')}`);
      const tarball = path.join(workDir, tarballs[0]);
      const extractDir = path.join(workDir, 'extracted');
      await fs.mkdir(extractDir);
      execFileSync('tar', ['-xzf', tarball, '-C', extractDir], { timeout: 30_000 });
      await fs.rm(path.join(extractDir, 'package/obj/template/manifest.json'), { force: true });
      const brokenTarball = path.join(workDir, 'broken.tgz');
      execFileSync('tar', ['-czf', brokenTarball, '-C', extractDir, 'package'], { timeout: 30_000 });

      const result = spawnSync('node', [SMOKE_TARBALL], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 180_000,
        env: { ...process.env, BROKEN_TARBALL: brokenTarball },
      });
      assert.notEqual(
        result.status,
        0,
        `smoke must exit non-zero against a tarball missing obj/template/manifest.json; got status=${result.status}\nstdout: ${(result.stdout || '').slice(-500)}\nstderr: ${(result.stderr || '').slice(-500)}`
      );
      const combined = (result.stdout || '') + (result.stderr || '');
      assert.match(
        combined,
        /obj\/template\/manifest\.json/,
        `smoke error must name the missing file (obj/template/manifest.json); got: ${combined.slice(-500)}`
      );
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  });
});

describe('regression — existing publish-adjacent test (AC-008 trap)', () => {
  it('test_when_existing_npm_pack_tarball_test_still_runs_then_passes', async () => {
    const existing = path.join(REPO_ROOT, 'tests/npm-pack-tarball.test.mjs');
    assert.ok(
      existsSync(existing),
      'tests/npm-pack-tarball.test.mjs must continue to exist (regression trap)'
    );
    const content = await fs.readFile(existing, 'utf8');
    assert.match(
      content,
      /test_npm_pack_excludes_site/,
      'tests/npm-pack-tarball.test.mjs must continue to assert the site/ exclusion (regression trap)'
    );
  });
});

// =============================================================================
// supply-chain-hardening — Tier 1: check-files-diff hardening (AC-001..AC-005)
// =============================================================================

async function withSyntheticPkg(pkg, body) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cfd-synth-'));
  try {
    await fs.writeFile(path.join(tmp, 'package.json'), JSON.stringify(pkg, null, 2));
    return await body(tmp);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

function spawnCheckFilesDiff(cwd) {
  return spawnSync('node', [CHECK_FILES_DIFF], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

function combinedOutput(result) {
  return (result.stdout || '') + (result.stderr || '');
}

describe('check-files-diff — package.json integrity (AC-001)', () => {
  it('test_when_synthetic_pkg_has_optional_dependencies_then_files_diff_fails', async () => {
    await withSyntheticPkg(
      {
        name: 'synth-pkg',
        version: '0.0.0',
        files: ['README.md'],
        dependencies: {},
        optionalDependencies: { '@evil/x': 'github:foo/bar' },
      },
      async (tmp) => {
        await fs.writeFile(path.join(tmp, 'README.md'), '# synth\n');
        const result = spawnCheckFilesDiff(tmp);
        assert.notEqual(result.status, 0, 'must exit non-zero when optionalDependencies present');
        assert.match(
          combinedOutput(result),
          /OPTIONAL_DEPS_FORBIDDEN[\s\S]*@evil\/x/,
          `must name the offending optionalDependencies key; got: ${combinedOutput(result).slice(-500)}`
        );
      }
    );
  });
});

describe('check-files-diff — script hook allowlist (AC-002)', () => {
  for (const hook of ['postinstall', 'preinstall', 'install']) {
    it(`test_when_synthetic_pkg_has_${hook}_script_then_files_diff_fails`, async () => {
      await withSyntheticPkg(
        {
          name: 'synth-pkg',
          version: '0.0.0',
          files: ['README.md'],
          scripts: { [hook]: 'node evil.js' },
        },
        async (tmp) => {
          await fs.writeFile(path.join(tmp, 'README.md'), '# synth\n');
          const result = spawnCheckFilesDiff(tmp);
          assert.notEqual(result.status, 0, `must exit non-zero when scripts.${hook} is present`);
          assert.match(
            combinedOutput(result),
            new RegExp(`SCRIPT_HOOK_FORBIDDEN[\\s\\S]*${hook}`),
            `must name the offending script hook (${hook}); got: ${combinedOutput(result).slice(-500)}`
          );
        }
      );
    });
  }

  it('test_when_synthetic_pkg_has_prepare_not_allowlisted_then_files_diff_fails', async () => {
    await withSyntheticPkg(
      {
        name: 'synth-pkg',
        version: '0.0.0',
        files: ['README.md'],
        scripts: { prepare: 'node evil.js' },
      },
      async (tmp) => {
        await fs.writeFile(path.join(tmp, 'README.md'), '# synth\n');
        const result = spawnCheckFilesDiff(tmp);
        assert.notEqual(result.status, 0, 'must exit non-zero when prepare script != allowlisted value');
        assert.match(
          combinedOutput(result),
          /PREPARE_NOT_ALLOWLISTED/,
          `must report PREPARE_NOT_ALLOWLISTED; got: ${combinedOutput(result).slice(-500)}`
        );
      }
    );
  });

  it('test_when_synthetic_pkg_has_prepare_allowlisted_then_files_diff_does_not_flag_prepare', async () => {
    await withSyntheticPkg(
      {
        name: 'synth-pkg',
        version: '0.0.0',
        files: ['README.md'],
        scripts: { prepare: 'bash scripts/build-template.sh' },
      },
      async (tmp) => {
        await fs.writeFile(path.join(tmp, 'README.md'), '# synth\n');
        const result = spawnCheckFilesDiff(tmp);
        const out = combinedOutput(result);
        assert.ok(
          !out.includes('PREPARE_NOT_ALLOWLISTED'),
          `allowlisted prepare value MUST NOT trip PREPARE_NOT_ALLOWLISTED; got: ${out.slice(-500)}`
        );
      }
    );
  });
});

describe('check-files-diff — executable allowlist (AC-003)', () => {
  it('test_when_repo_has_surprise_executable_then_files_diff_fails', async () => {
    const injected = path.join(REPO_ROOT, 'obj/template/.claude/router_runtime.js');
    await fs.mkdir(path.dirname(injected), { recursive: true });
    await fs.writeFile(injected, '#!/usr/bin/env node\nconsole.log("simulated injection");\n');
    await fs.chmod(injected, 0o755);
    try {
      const result = spawnCheckFilesDiff(REPO_ROOT);
      assert.notEqual(
        result.status,
        0,
        `must exit non-zero when an executable file lands outside the allowlist; got status=${result.status}\nstdout: ${(result.stdout || '').slice(-500)}\nstderr: ${(result.stderr || '').slice(-500)}`
      );
      assert.match(
        combinedOutput(result),
        /SURPRISE-EXECUTABLE[\s\S]*router_runtime\.js/,
        `must name the offending executable; got: ${combinedOutput(result).slice(-500)}`
      );
    } finally {
      await fs.rm(injected, { force: true });
    }
  });
});

describe('check-files-diff — devDependencies pin discipline (AC-005)', () => {
  for (const [label, range] of [
    ['caret', '^1.0.0'],
    ['tilde', '~1.0.0'],
    ['star', '*'],
    ['x-range', '1.x'],
    ['gt', '>=1.0.0'],
  ]) {
    it(`test_when_synthetic_pkg_has_${label}_devdep_then_files_diff_fails_with_range_forbidden`, async () => {
      await withSyntheticPkg(
        {
          name: 'synth-pkg',
          version: '0.0.0',
          files: ['README.md'],
          devDependencies: { 'some-tool': range },
        },
        async (tmp) => {
          await fs.writeFile(path.join(tmp, 'README.md'), '# synth\n');
          const result = spawnCheckFilesDiff(tmp);
          assert.notEqual(result.status, 0, `must exit non-zero for devDep range "${range}"`);
          assert.match(
            combinedOutput(result),
            /DEVDEP_RANGE_FORBIDDEN/,
            `must report DEVDEP_RANGE_FORBIDDEN for "${range}"; got: ${combinedOutput(result).slice(-500)}`
          );
        }
      );
    });
  }

  it('test_when_synthetic_pkg_has_git_devdep_then_files_diff_fails_with_non_registry', async () => {
    await withSyntheticPkg(
      {
        name: 'synth-pkg',
        version: '0.0.0',
        files: ['README.md'],
        devDependencies: { 'some-tool': 'github:foo/bar' },
      },
      async (tmp) => {
        await fs.writeFile(path.join(tmp, 'README.md'), '# synth\n');
        const result = spawnCheckFilesDiff(tmp);
        assert.notEqual(result.status, 0, 'must exit non-zero for non-registry devDep');
        assert.match(
          combinedOutput(result),
          /DEVDEP_NON_REGISTRY/,
          `must report DEVDEP_NON_REGISTRY; got: ${combinedOutput(result).slice(-500)}`
        );
      }
    );
  });

  it('test_when_synthetic_pkg_has_exact_devdep_then_files_diff_does_not_flag_devdep', async () => {
    await withSyntheticPkg(
      {
        name: 'synth-pkg',
        version: '0.0.0',
        files: ['README.md'],
        devDependencies: { 'some-tool': '3.1.5' },
      },
      async (tmp) => {
        await fs.writeFile(path.join(tmp, 'README.md'), '# synth\n');
        const result = spawnCheckFilesDiff(tmp);
        const out = combinedOutput(result);
        assert.ok(
          !out.includes('DEVDEP_RANGE_FORBIDDEN'),
          `exact-pin devDep MUST NOT trip DEVDEP_RANGE_FORBIDDEN; got: ${out.slice(-500)}`
        );
        assert.ok(
          !out.includes('DEVDEP_NON_REGISTRY'),
          `exact-pin devDep MUST NOT trip DEVDEP_NON_REGISTRY; got: ${out.slice(-500)}`
        );
      }
    );
  });
});

// =============================================================================
// supply-chain-hardening — Tier 1: smoke-tarball hash verify (AC-004)
// =============================================================================

describe('smoke-tarball — installed-tree hash verify (AC-004)', () => {
  it('test_when_tampered_tarball_then_smoke_hash_verify_fails', async () => {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-tampered-'));
    try {
      execFileSync('npm', ['pack', '--pack-destination', workDir], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 120_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const tarballs = (await fs.readdir(workDir)).filter((f) => f.endsWith('.tgz'));
      assert.ok(tarballs.length === 1, `expected one tarball, got: ${tarballs.join(', ')}`);
      const tarball = path.join(workDir, tarballs[0]);

      const extractDir = path.join(workDir, 'extracted');
      await fs.mkdir(extractDir);
      execFileSync('tar', ['-xzf', tarball, '-C', extractDir], { timeout: 30_000 });

      const target = path.join(extractDir, 'package/obj/template/CLAUDE.md');
      const original = await fs.readFile(target);
      // Mutate exactly one byte (flip the last byte's low bit).
      const mutated = Buffer.from(original);
      mutated[mutated.length - 1] = mutated[mutated.length - 1] ^ 0x01;
      await fs.writeFile(target, mutated);

      const tampered = path.join(workDir, 'tampered.tgz');
      execFileSync('tar', ['-czf', tampered, '-C', extractDir, 'package'], { timeout: 30_000 });

      const result = spawnSync('node', [SMOKE_TARBALL], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 180_000,
        env: { ...process.env, TAMPERED_TARBALL: tampered },
      });
      assert.notEqual(
        result.status,
        0,
        `smoke must exit non-zero against a hash-tampered tarball; got status=${result.status}\nstdout: ${(result.stdout || '').slice(-800)}\nstderr: ${(result.stderr || '').slice(-800)}`
      );
      assert.match(
        combinedOutput(result),
        /HASH_MISMATCH[\s\S]*obj\/template\/CLAUDE\.md/,
        `smoke error must name HASH_MISMATCH for obj/template/CLAUDE.md; got: ${combinedOutput(result).slice(-800)}`
      );
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  });
});
