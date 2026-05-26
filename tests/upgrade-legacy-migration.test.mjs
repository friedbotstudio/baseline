// AC-005 — Legacy manifest migration across two upgrade runs.
// (a) First upgrade against a manifest lacking baseline_version surfaces the
//     "predates version-tracked manifests" warning AND stamps baseline_version
//     into the saved newManifest.
// (b) Second upgrade against the post-fix manifest with an unchanged template
//     suppresses the warning AND hits the version-aware fast-path.
//
// Spec: docs/specs/upgrade-version-aware-noop.md §Behavior #5.
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
  const tplDir = await mkdtemp(join(tmpdir(), 'baseline-legacy-tpl-'));
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

async function makeLegacyTarget(tplDir) {
  const target = await mkdtemp(join(tmpdir(), 'baseline-legacy-target-'));
  await install.freshInstall(tplDir, target);
  // Strip baseline_version from the installed manifest to simulate a pre-fix
  // (or pre-v0.4.0) target on disk.
  const mPath = join(target, '.claude/.baseline-manifest.json');
  const m = JSON.parse(await readFile(mPath, 'utf8'));
  delete m.baseline_version;
  await writeFile(mPath, JSON.stringify(m, null, 2) + '\n');
  return target;
}

describe('upgrade — legacy manifest migration (AC-005)', () => {
  it('test_when_legacy_manifest_first_upgrade_then_warning_fires_and_baseline_version_gets_stamped', async () => {
    const tpl = await makeTemplateFixture('# baseline v1\n');
    const target = await makeLegacyTarget(tpl);
    const expectedVersion = await readPackageJsonVersion();

    // Same template content as the (now-stripped) install — fast-path is bypassed
    // because oldManifest.baseline_version is undefined. The legacy warning fires.
    const { calls, stub } = makePromptsStub();
    await tuiUpgrade.run({ target, opts: { templateDir: tpl }, prompts: stub });

    const allMessages = calls.map((c) => JSON.stringify(c)).join('\n');
    assert.ok(
      /predates version-tracked manifests/i.test(allMessages),
      `first upgrade against legacy manifest must surface the "predates version-tracked manifests" warning; calls were:\n${allMessages}`,
    );

    const manifestAfter = JSON.parse(await readFile(join(target, '.claude/.baseline-manifest.json'), 'utf8'));
    assert.equal(
      manifestAfter.baseline_version,
      expectedVersion,
      `after legacy upgrade, the saved manifest must carry baseline_version === ${expectedVersion}; got ${JSON.stringify(manifestAfter.baseline_version)}. Bug 1 fix.`,
    );
  });

  it('test_when_legacy_upgrade_followup_run_then_fast_path_hits_with_no_warning', async () => {
    const tpl = await makeTemplateFixture('# baseline v1\n');
    const target = await makeLegacyTarget(tpl);

    // First upgrade — populates baseline_version in the saved manifest.
    const first = makePromptsStub();
    await tuiUpgrade.run({ target, opts: { templateDir: tpl }, prompts: first.stub });

    // Confirm the precondition: manifest now has baseline_version.
    const manifestMid = JSON.parse(await readFile(join(target, '.claude/.baseline-manifest.json'), 'utf8'));
    assert.ok(typeof manifestMid.baseline_version === 'string' && manifestMid.baseline_version.length > 0,
      'precondition: first upgrade must stamp baseline_version (covered by AC-005a)');

    // Second upgrade — same template, version matches → fast-path must hit.
    const second = makePromptsStub();
    const exit2 = await tuiUpgrade.run({ target, opts: { templateDir: tpl }, prompts: second.stub });

    const secondMessages = second.calls.map((c) => JSON.stringify(c)).join('\n');
    assert.equal(exit2, 0, 'second upgrade against unchanged template must exit 0');
    assert.ok(
      /already on baseline/i.test(secondMessages),
      `second upgrade must surface "already on baseline X.Y.Z"; calls were:\n${secondMessages}`,
    );
    assert.ok(
      !/predates version-tracked manifests/i.test(secondMessages),
      `second upgrade must NOT re-surface the legacy warning (the manifest is no longer legacy); calls were:\n${secondMessages}`,
    );
  });
});
