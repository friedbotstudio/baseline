// Tests for src/cli/tui/upgrade.js — branded upgrade flow.
// Mirror of tests/tui-install.test.mjs shape (stub @clack/prompts via a
// `prompts` arg; capture stdout to assert on the wordmark header).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

let tuiUpgrade;
try {
  tuiUpgrade = await import('../src/cli/tui/upgrade.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/tui/upgrade.js: ${err.message}`);
}

async function makeTemplateFixture() {
  const tplDir = await mkdtemp(join(tmpdir(), 'tui-upgrade-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, 'CLAUDE.md'), '# baseline\n');
  await writeFile(join(tplDir, '.mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2) + '\n');
  await writeFile(join(tplDir, '.claude/project.json'), JSON.stringify({ configured: false }) + '\n');
  return tplDir;
}

async function makeTargetWithPriorInstall(tplDir) {
  const target = await mkdtemp(join(tmpdir(), 'tui-upgrade-target-'));
  await mkdir(join(target, '.claude'));
  // Write a minimal v2 manifest so isLegacyManifest evaluates and the upgrade
  // flow proceeds past the "no baseline manifest" early-exit.
  const claudeMdSha = createHash('sha256').update('# baseline\n').digest('hex');
  await writeFile(
    join(target, '.claude/.baseline-manifest.json'),
    JSON.stringify({
      manifest_version: 2,
      generated_at: '2026-01-01T00:00:00Z',
      files: { 'CLAUDE.md': claudeMdSha },
    }, null, 2) + '\n',
  );
  await writeFile(join(target, 'CLAUDE.md'), '# baseline\n');
  return target;
}

function makePromptsStub() {
  const calls = [];
  return {
    calls,
    stub: {
      intro: (msg) => calls.push({ kind: 'intro', msg }),
      outro: (msg) => calls.push({ kind: 'outro', msg }),
      cancel: (msg) => calls.push({ kind: 'cancel', msg }),
      log: {
        info: (msg) => calls.push({ kind: 'log.info', msg }),
        warn: (msg) => calls.push({ kind: 'log.warn', msg }),
        error: (msg) => calls.push({ kind: 'log.error', msg }),
        step: (msg) => calls.push({ kind: 'log.step', msg }),
        success: (msg) => calls.push({ kind: 'log.success', msg }),
      },
      spinner: () => ({
        start: () => {}, message: () => {}, stop: () => {}, error: () => {},
      }),
      select: async () => 'keep-mine',
      isCancel: () => false,
    },
  };
}

function captureStdout(fn) {
  const captured = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk) => { captured.push(String(chunk)); return true; };
  return Promise.resolve(fn()).finally(() => {
    process.stdout.write = original;
  }).then((result) => ({ result, captured: captured.join('') }));
}

describe('tui/upgrade', () => {
  it('test_when_upgrade_in_tty_then_stdout_contains_wordmark', async () => {
    const tpl = await makeTemplateFixture();
    const target = await makeTargetWithPriorInstall(tpl);
    const { stub } = makePromptsStub();

    const { captured } = await captureStdout(() =>
      tuiUpgrade.run({
        target,
        opts: { templateDir: tpl },
        prompts: stub,
      })
    );

    assert.ok(/██████/.test(captured),
      `upgrade TTY output must include the BASELINE wordmark; got first 200 chars: ${captured.slice(0, 200)}`);
  });
});
