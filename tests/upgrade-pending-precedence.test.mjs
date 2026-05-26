// AC-006 — A pending stage at .claude/state/upgrade/<ts>/ takes precedence over
// the version-aware fast-path. Even when oldManifest.baseline_version equals the
// running CLI version, the CLI emits the existing pending-stage message and exits
// 5; checkVersionFastPath is NOT invoked (no "already on baseline" line).
//
// Spec: docs/specs/upgrade-version-aware-noop.md §Behavior #6.
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

async function makeTemplateFixture() {
  const tplDir = await mkdtemp(join(tmpdir(), 'baseline-pend-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, 'CLAUDE.md'), '# baseline v1\n');
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

describe('upgrade — pending stage precedence over fast-path (AC-006)', () => {
  it('test_when_pending_stage_exists_then_pending_message_wins_over_fast_path', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'baseline-pend-target-'));
    await install.freshInstall(tpl, target);

    // Confirm install stamped baseline_version so the version-match condition
    // for fast-path holds.
    const currentVersion = await readPackageJsonVersion();
    const m = JSON.parse(await readFile(join(target, '.claude/.baseline-manifest.json'), 'utf8'));
    assert.equal(m.baseline_version, currentVersion,
      `precondition (AC-001): install stamps baseline_version === ${currentVersion}`);

    // Seed a pending stage at .claude/state/upgrade/<ts>/ with a PENDING file.
    const stageDir = join(target, '.claude/state/upgrade/2026-05-27T10-00-00Z');
    await mkdir(stageDir, { recursive: true });
    await writeFile(join(stageDir, 'manifest.json'), JSON.stringify({
      stage_version: 1,
      slug: 'pending-precedence-test',
      created_at: '2026-05-27T10:00:00.000Z',
      baseline_version_from: '0.0.0',
      baseline_version_to: currentVersion,
      files: [{
        rel: 'docs/init/seed.md',
        base_sha256: 'a'.repeat(64),
        incoming_sha256: 'b'.repeat(64),
        local_sha256: 'c'.repeat(64),
        status: 'PENDING',
      }],
    }, null, 2) + '\n');

    const { calls, stub } = makePromptsStub();
    const exitCode = await tuiUpgrade.run({ target, opts: { templateDir: tpl }, prompts: stub });

    assert.equal(exitCode, 5,
      'pending stage must take precedence and exit 5, even when fast-path conditions would otherwise hold');

    const messages = calls.map((c) => JSON.stringify(c)).join('\n');
    assert.ok(
      /upgrade-project/i.test(messages),
      `pending-stage path must reprint the /upgrade-project pointer; calls were:\n${messages}`,
    );
    assert.ok(
      !/already on baseline/i.test(messages),
      `fast-path message must NOT appear when a pending stage exists; calls were:\n${messages}`,
    );
  });
});
