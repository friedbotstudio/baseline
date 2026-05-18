// Tests for src/cli/tui/upgrade.js — branded upgrade flow with interactive conflict resolution.
// RED until the module exists.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshInstall } from '../src/cli/install.js';

let tuiUpgrade;
try {
  tuiUpgrade = await import('../src/cli/tui/upgrade.js');
} catch (err) {
  throw new Error(`Cannot import src/cli/tui/upgrade.js: ${err.message}`);
}

const CANCEL_SENTINEL = Symbol.for('clack:cancel');

async function makeTemplateFixture(claudeBody = '# baseline v1\n') {
  const tplDir = await mkdtemp(join(tmpdir(), 'tui-upgrade-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, 'CLAUDE.md'), claudeBody);
  await writeFile(join(tplDir, '.mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2) + '\n');
  await writeFile(join(tplDir, '.claude/project.json'), JSON.stringify({ configured: false }) + '\n');
  await mkdir(join(tplDir, 'docs/init'), { recursive: true });
  await writeFile(join(tplDir, 'docs/init/seed.md'), '# seed\n');
  return tplDir;
}

async function installedTargetWithCustomization() {
  const tpl = await makeTemplateFixture('# baseline v1\n');
  const target = await mkdtemp(join(tmpdir(), 'tui-upgrade-target-'));
  await freshInstall(tpl, target);
  // customize CLAUDE.md so it diverges from the manifest hash
  await writeFile(join(target, 'CLAUDE.md'), '# customized by user\n');
  // ship a new template version — same path, different content → SKIP_CUSTOMIZED in upgrade
  const newTpl = await makeTemplateFixture('# baseline v2\n');
  return { newTpl, target };
}

function makePromptsStub(selectAnswers) {
  // selectAnswers: array of values, one per select prompt in encounter order.
  // CANCEL_SENTINEL triggers isCancel(v) === true on consumption.
  const calls = [];
  let answerIdx = 0;
  return {
    calls,
    stub: {
      intro: (msg) => calls.push({ kind: 'intro', msg }),
      outro: (msg) => calls.push({ kind: 'outro', msg }),
      cancel: (msg) => calls.push({ kind: 'cancel', msg }),
      log: {
        info: (m) => calls.push({ kind: 'log.info', m }),
        warn: (m) => calls.push({ kind: 'log.warn', m }),
        error: (m) => calls.push({ kind: 'log.error', m }),
        success: (m) => calls.push({ kind: 'log.success', m }),
        step: (m) => calls.push({ kind: 'log.step', m }),
      },
      spinner: () => ({ start() {}, message() {}, stop() {}, error() {} }),
      select: async (opts) => {
        calls.push({ kind: 'select', message: opts?.message });
        const v = selectAnswers[answerIdx++];
        return v;
      },
      isCancel: (v) => v === CANCEL_SENTINEL,
    },
  };
}

describe('tui/upgrade', () => {
  it('test_when_upgrade_in_tty_with_customized_stale_and_user_picks_take_theirs_then_file_overwritten', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const { calls, stub } = makePromptsStub(['take-theirs']);

    const exitCode = await tuiUpgrade.run({
      target,
      opts: { templateDir: newTpl },
      prompts: stub,
    });

    assert.equal(exitCode, 0, 'upgrade with take-theirs on the one conflict should exit 0');
    const finalClaude = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    assert.equal(finalClaude, '# baseline v2\n', 'CLAUDE.md should now match new template content');
    assert.ok(
      calls.some((c) => c.kind === 'select' && /CLAUDE\.md/i.test(c.message || '')),
      'expected one prompts.select for the customized CLAUDE.md path'
    );
  });

  it('test_when_upgrade_in_tty_and_user_picks_abort_then_exit_1_and_tree_unchanged', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const before = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    const { calls, stub } = makePromptsStub(['abort']);

    const exitCode = await tuiUpgrade.run({
      target,
      opts: { templateDir: newTpl },
      prompts: stub,
    });

    assert.equal(exitCode, 1, 'abort on first conflict should exit 1');
    const after = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    assert.equal(after, before, 'target file must be untouched when user aborts');
    assert.ok(
      calls.some((c) => c.kind === 'cancel'),
      'expected prompts.cancel to be invoked on abort'
    );
  });

  it('test_when_upgrade_ctrl_c_mid_prompt_then_cancel_runs_and_exit_1', async () => {
    const { newTpl, target } = await installedTargetWithCustomization();
    const before = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    const { calls, stub } = makePromptsStub([CANCEL_SENTINEL]);

    const exitCode = await tuiUpgrade.run({
      target,
      opts: { templateDir: newTpl },
      prompts: stub,
    });

    assert.equal(exitCode, 1, 'isCancel-positive return must result in exit 1');
    const after = await readFile(join(target, 'CLAUDE.md'), 'utf8');
    assert.equal(after, before, 'Ctrl+C must leave target unchanged');
    assert.ok(
      calls.some((c) => c.kind === 'cancel'),
      'expected prompts.cancel after isCancel-positive answer'
    );
  });
});
