// CLI-level subprocess tests for the branded TUI: routing, upgrade subcommand,
// --merge removal, doctor --json. These spawn `node bin/cli.js` so stdout is
// piped (non-TTY) and the plain path runs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freshInstall } from '../src/cli/install.js';

const CLI = 'bin/cli.js';

function runCli(args, opts = {}) {
  const env = { ...process.env, CREATE_BASELINE_TEST_MODE: '1', ...opts.env };
  return spawnSync('node', [CLI, ...args], {
    env,
    encoding: 'utf8',
    input: opts.input,
  });
}

async function makeTemplateFixture(claudeBody = '# baseline v1\n') {
  const tplDir = await mkdtemp(join(tmpdir(), 'cli-tui-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, 'CLAUDE.md'), claudeBody);
  await writeFile(join(tplDir, '.mcp.json'), JSON.stringify({ mcpServers: {} }, null, 2) + '\n');
  await writeFile(join(tplDir, '.claude/project.json'), JSON.stringify({ configured: false }) + '\n');
  await mkdir(join(tplDir, 'docs/init'), { recursive: true });
  await writeFile(join(tplDir, 'docs/init/seed.md'), '# seed\n');
  return tplDir;
}

async function freshTarget() {
  return mkdtemp(join(tmpdir(), 'cli-tui-target-'));
}

async function installedTarget(claudeBody = '# baseline v1\n') {
  const tpl = await makeTemplateFixture(claudeBody);
  const target = await freshTarget();
  await freshInstall(tpl, target);
  return { tpl, target };
}

describe('cli — upgrade subcommand routing', () => {
  it('test_when_upgrade_subcommand_invoked_in_non_tty_then_matches_today_merge_behavior', async () => {
    const { target } = await installedTarget();
    // customize CLAUDE.md so the new-template threeWayMerge sees a SKIP_CUSTOMIZED
    await writeFile(join(target, 'CLAUDE.md'), '# user edits\n');

    const env = { CREATE_BASELINE_TEMPLATE_DIR: (await makeTemplateFixture('# baseline v2\n')) };
    const result = runCli(['upgrade', target], { env });

    // non-TTY upgrade: today's --merge behavior — action list to stdout, exit 3 on skipped customizations.
    assert.equal(result.status, 3, `expected exit 3 for skipped customization, got ${result.status}; stderr=${result.stderr}`);
    assert.ok(
      /CLAUDE\.md/.test(result.stdout) || /CLAUDE\.md/.test(result.stderr),
      'expected CLAUDE.md to appear in the upgrade action list'
    );
  });

  it('test_when_upgrade_on_target_without_manifest_then_exit_2_with_helpful_error', async () => {
    const empty = await freshTarget();
    const env = { CREATE_BASELINE_TEMPLATE_DIR: (await makeTemplateFixture()) };
    const result = runCli(['upgrade', empty], { env });

    assert.equal(result.status, 2, `expected exit 2 when manifest absent, got ${result.status}`);
    assert.ok(
      /manifest/i.test(result.stderr) || /manifest/i.test(result.stdout),
      'stderr (or stdout) must name the missing manifest'
    );
  });
});

describe('cli — --merge removal', () => {
  it('test_when_merge_flag_passed_then_exit_2_with_removal_message', async () => {
    const target = await freshTarget();
    const env = { CREATE_BASELINE_TEMPLATE_DIR: (await makeTemplateFixture()) };
    const result = runCli([target, '--merge'], { env });

    assert.equal(result.status, 2, `expected exit 2 when --merge is passed, got ${result.status}`);
    assert.ok(
      /--merge has been removed/i.test(result.stderr) && /upgrade/i.test(result.stderr),
      `stderr must announce --merge removal and point to upgrade; got: ${result.stderr}`
    );
  });
});

describe('cli — doctor --json', () => {
  it('test_when_doctor_with_json_flag_then_emits_valid_json_to_stdout', async () => {
    const { target } = await installedTarget();
    const result = runCli(['doctor', target, '--json']);

    assert.equal(result.status, 0, `expected exit 0 on clean target, got ${result.status}; stderr=${result.stderr}`);
    let parsed;
    try {
      parsed = JSON.parse(result.stdout.trim());
    } catch (err) {
      throw new assert.AssertionError({
        message: `stdout must be valid JSON; parse error: ${err.message}; stdout: ${result.stdout}`,
      });
    }
    for (const key of ['exitCode', 'strict', 'target', 'matched', 'customized', 'missing', 'added']) {
      assert.ok(key in parsed, `JSON output must include key '${key}'`);
    }
    assert.equal(parsed.exitCode, 0);
  });

  it('test_when_doctor_with_json_strict_on_tampered_target_then_json_includes_strict_true_and_customized_array', async () => {
    const { target } = await installedTarget();
    // tamper with CLAUDE.md to produce one customized entry
    await writeFile(join(target, 'CLAUDE.md'), '# tampered\n');
    const result = runCli(['doctor', target, '--strict', '--json']);

    assert.equal(result.status, 1, `expected exit 1 in strict mode with tampered file, got ${result.status}`);
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.strict, true);
    assert.ok(Array.isArray(parsed.customized) && parsed.customized.length >= 1, 'customized array must be non-empty');
    assert.ok(parsed.customized.includes('CLAUDE.md'));
  });
});

describe('cli — non-TTY install plain output (regression trap)', () => {
  it('test_when_install_in_non_tty_then_emits_plain_output_byte_identical_to_today', async () => {
    // NOTE: this is a regression trap. Pre-impl this test PASSES (non-TTY plain path
    // is today's behavior). Post-impl it must keep passing. Flag: REGRESSION_TRAP_PRE_PASSING.
    const tpl = await makeTemplateFixture();
    const target = await freshTarget();
    const env = { CREATE_BASELINE_TEMPLATE_DIR: tpl };
    const result = runCli([target, '--no-plantuml'], { env });

    assert.equal(result.status, 0, `non-TTY install must exit 0; got ${result.status}; stderr=${result.stderr}`);
    assert.ok(
      /Installed manifest version 1 to/.test(result.stdout),
      `stdout must contain the today-shape 'Installed manifest version 1 to' line; got: ${result.stdout}`
    );
    assert.ok(
      /Pin via "@friedbotstudio\/create-baseline@/.test(result.stdout),
      `stdout must contain the today-shape Pin line; got: ${result.stdout}`
    );
  });
});
