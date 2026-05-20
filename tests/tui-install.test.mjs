// Tests for src/cli/tui/install.js — branded install flow.
// RED until the module exists (module-level try/catch surfaces a clear failure).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tuiInstall;
try {
  tuiInstall = await import('../src/cli/tui/install.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/tui/install.js: ${err.message}`);
}

async function makeTemplateFixture() {
  const tplDir = await mkdtemp(join(tmpdir(), 'tui-install-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, 'CLAUDE.md'), '# baseline\n');
  await writeFile(join(tplDir, '.mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2) + '\n');
  await writeFile(join(tplDir, '.claude/project.json'), JSON.stringify({ configured: false }) + '\n');
  await mkdir(join(tplDir, 'docs/init'), { recursive: true });
  await writeFile(join(tplDir, 'docs/init/seed.md'), '# seed\n');
  return tplDir;
}

function makePromptsStub() {
  const calls = [];
  const spinnerState = { started: false, stopped: false, messages: [] };
  return {
    calls,
    spinnerState,
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
        start: (msg) => { spinnerState.started = true; spinnerState.messages.push({ when: 'start', msg }); },
        message: (msg) => spinnerState.messages.push({ when: 'message', msg }),
        stop: (msg) => { spinnerState.stopped = true; spinnerState.messages.push({ when: 'stop', msg }); },
        error: (msg) => spinnerState.messages.push({ when: 'error', msg }),
      }),
      isCancel: (v) => false,
    },
  };
}

describe('tui/install', () => {
  it('test_when_install_in_tty_then_emits_branded_intro_and_outro', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'tui-install-target-'));
    const { calls, stub } = makePromptsStub();

    const exitCode = await tuiInstall.run({
      target,
      opts: { templateDir: tpl, noPlantuml: true },
      prompts: stub,
    });

    assert.equal(exitCode, 0, 'tui.install.run should resolve with exit 0 on a clean install');
    assert.ok(
      calls.some((c) => c.kind === 'intro'),
      'expected at least one prompts.intro call'
    );
    assert.ok(
      calls.some((c) => c.kind === 'outro'),
      'expected at least one prompts.outro call'
    );
    const introIdx = calls.findIndex((c) => c.kind === 'intro');
    const outroIdx = calls.findIndex((c) => c.kind === 'outro');
    assert.ok(introIdx >= 0 && outroIdx > introIdx, 'intro must precede outro');

    await access(join(target, 'CLAUDE.md'));
    await access(join(target, '.claude/.baseline-manifest.json'));
    const m = JSON.parse(await readFile(join(target, '.claude/.baseline-manifest.json'), 'utf8'));
    assert.equal(m.manifest_version, 2, 'manifest must be written byte-equivalent to plain install');
    assert.ok(Object.keys(m.files).length > 0, 'manifest must contain shipped files');
  });

  it('test_when_tui_install_run_invoked_with_null_target_then_throws_synchronously', async () => {
    const { calls, stub } = makePromptsStub();
    await assert.rejects(
      () => tuiInstall.run({ target: null, opts: { noPlantuml: true }, prompts: stub }),
      /target/i,
      'tui.install.run with target=null should reject with an error naming target'
    );
    assert.equal(
      calls.length,
      0,
      'no prompts calls should fire before input validation'
    );
  });
});
