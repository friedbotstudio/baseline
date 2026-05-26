// AC-001, AC-002 — install and upgrade both stamp `baseline_version` into
// <target>/.claude/.baseline-manifest.json AND <target>/.claude/project.json.
//
// Spec: docs/specs/upgrade-version-aware-noop.md §Behavior #1 + #2.
// Bug 1 reference: src/cli/tui/upgrade.js:170 (loadManifests) and bin/cli.js:260
// (runPlainUpgrade) currently call buildManifestFromDir without baseline_version.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const install = await import('../src/cli/install.js');

let tuiUpgrade;
try {
  tuiUpgrade = await import('../src/cli/tui/upgrade.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/tui/upgrade.js: ${err.message}`);
}

async function readPackageJsonVersion() {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

async function makeTemplateFixture(claudeBody = '# baseline v1\n') {
  const tplDir = await mkdtemp(join(tmpdir(), 'baseline-vstamp-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, 'CLAUDE.md'), claudeBody);
  await writeFile(join(tplDir, '.mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2) + '\n');
  await writeFile(join(tplDir, '.claude/project.json'), JSON.stringify({ configured: false }, null, 2) + '\n');
  await mkdir(join(tplDir, 'docs/init'), { recursive: true });
  await writeFile(join(tplDir, 'docs/init/seed.md'), '# seed\n');
  return tplDir;
}

function makePromptsStub() {
  const calls = [];
  return {
    calls,
    stub: {
      intro: (m) => calls.push({ kind: 'intro', m }),
      outro: (m) => calls.push({ kind: 'outro', m }),
      cancel: (m) => calls.push({ kind: 'cancel', m }),
      log: {
        info: (m) => calls.push({ kind: 'log.info', m }),
        warn: (m) => calls.push({ kind: 'log.warn', m }),
        error: (m) => calls.push({ kind: 'log.error', m }),
        step: (m) => calls.push({ kind: 'log.step', m }),
        success: (m) => calls.push({ kind: 'log.success', m }),
      },
      spinner: () => ({ start() {}, message() {}, stop() {}, error() {} }),
      select: async () => 'keep-mine',
      isCancel: () => false,
    },
  };
}

describe('upgrade-version-stamp — install path (AC-001)', () => {
  it('test_when_install_completes_then_manifest_and_project_json_carry_baseline_version', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'baseline-vstamp-target-'));
    const expected = await readPackageJsonVersion();

    await install.freshInstall(tpl, target);

    const manifest = JSON.parse(await readFile(join(target, '.claude/.baseline-manifest.json'), 'utf8'));
    assert.equal(
      manifest.baseline_version,
      expected,
      `manifest.baseline_version must equal the CLI's package.json version after freshInstall; got ${JSON.stringify(manifest.baseline_version)}, expected ${JSON.stringify(expected)}`,
    );

    const projectJson = JSON.parse(await readFile(join(target, '.claude/project.json'), 'utf8'));
    assert.equal(
      projectJson.baseline_version,
      expected,
      `project.json.baseline_version must equal the CLI's package.json version after freshInstall; got ${JSON.stringify(projectJson.baseline_version)}, expected ${JSON.stringify(expected)}`,
    );
  });
});

describe('upgrade-version-stamp — upgrade write path (AC-002)', () => {
  it('test_when_upgrade_write_path_completes_then_manifest_and_project_json_get_stamped', async () => {
    const tpl = await makeTemplateFixture('# baseline v1\n');
    const target = await mkdtemp(join(tmpdir(), 'baseline-vstamp-upgrade-target-'));
    const expected = await readPackageJsonVersion();

    // Prior install — use freshInstall first to lay down a manifest and project.json.
    await install.freshInstall(tpl, target);

    // Simulate a pre-fix saved manifest: strip baseline_version so the upgrade write
    // path is forced to re-stamp it. Same trick for project.json.
    const manifestPath = join(target, '.claude/.baseline-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    delete manifest.baseline_version;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    const pjsonPath = join(target, '.claude/project.json');
    const pjson = JSON.parse(await readFile(pjsonPath, 'utf8'));
    delete pjson.baseline_version;
    await writeFile(pjsonPath, JSON.stringify(pjson, null, 2) + '\n');

    // Ship a new template version (different CLAUDE.md content) so the upgrade
    // does real work — fast-path miss, full merge engine runs.
    const newTpl = await makeTemplateFixture('# baseline v2\n');

    const { stub } = makePromptsStub();
    const exitCode = await tuiUpgrade.run({ target, opts: { templateDir: newTpl }, prompts: stub });

    assert.ok(
      exitCode === 0 || exitCode === 3 || exitCode === 4 || exitCode === 5,
      `upgrade exit code must be one of {0, 3, 4, 5} on a real-work run; got ${exitCode}`,
    );

    const manifestAfter = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(
      manifestAfter.baseline_version,
      expected,
      `after upgrade write path, manifest.baseline_version must equal the CLI's package.json version; got ${JSON.stringify(manifestAfter.baseline_version)}`,
    );

    const pjsonAfter = JSON.parse(await readFile(pjsonPath, 'utf8'));
    assert.equal(
      pjsonAfter.baseline_version,
      expected,
      `after upgrade write path, project.json.baseline_version must equal the CLI's package.json version; got ${JSON.stringify(pjsonAfter.baseline_version)}`,
    );
  });
});
