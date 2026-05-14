import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = 'bin/cli.js';

function runCli(args, opts = {}) {
  const env = { ...process.env, CREATE_BASELINE_TEST_MODE: '1', ...opts.env };
  return spawnSync('node', [CLI, ...args], {
    env,
    encoding: 'utf8',
    input: opts.input,
  });
}

async function makeTemplateFixture() {
  const tplDir = await mkdtemp(join(tmpdir(), 'cli-tpl-'));
  await mkdir(join(tplDir, '.claude'));
  await writeFile(join(tplDir, 'CLAUDE.md'), '# baseline\n');
  await writeFile(join(tplDir, '.mcp.json'), JSON.stringify({
    mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
  }, null, 2) + '\n');
  await writeFile(join(tplDir, '.claude/project.json'), JSON.stringify({ configured: false }) + '\n');
  await mkdir(join(tplDir, 'docs/init'), { recursive: true });
  await writeFile(join(tplDir, 'docs/init/seed.md'), '# seed\n');
  return tplDir;
}

describe('cli — argv + mode routing', () => {
  it('--help exits 0 and prints usage', () => {
    const r = runCli(['--help']);
    assert.equal(r.status, 0);
    assert.ok(/usage|create-baseline/i.test(r.stdout + r.stderr));
  });

  it('test_when_cli_invoked_with_help_then_help_text_documents_with_npmrc', () => {
    const r = runCli(['--help']);
    assert.equal(r.status, 0);
    assert.match(
      r.stdout + r.stderr,
      /--with-npmrc/,
      'HELP_TEXT must document the --with-npmrc opt-in flag (regression guard against the documentation falling out of sync with the flag)'
    );
  });

  it('--version exits 0 and prints a version string', () => {
    const r = runCli(['--version']);
    assert.equal(r.status, 0);
    assert.ok(/\d+\.\d+\.\d+/.test(r.stdout));
  });

  it('unknown flag exits 2', () => {
    const r = runCli(['--unknown-flag', '/tmp/scratch']);
    assert.equal(r.status, 2);
  });

  it('missing target arg exits 2', () => {
    const r = runCli([]);
    assert.equal(r.status, 2);
  });

  it('--force and --merge together exits 2 (mutually exclusive)', () => {
    const r = runCli(['--force', '--merge', '/tmp/scratch']);
    assert.equal(r.status, 2);
  });

  it('--no-plantuml and --require-plantuml together exits 2', () => {
    const r = runCli(['--no-plantuml', '--require-plantuml', '/tmp/scratch']);
    assert.equal(r.status, 2);
  });

  it('fresh install on empty target with --no-plantuml exits 0', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'cli-target-'));
    const r = runCli([target, '--no-plantuml'], {
      env: { CREATE_BASELINE_TEMPLATE_DIR: tpl },
    });
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    await access(join(target, 'CLAUDE.md'));
    await access(join(target, '.claude/.baseline-manifest.json'));
  });

  it('refuses on conflict without --force or --merge (exits 1)', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'cli-target-'));
    await writeFile(join(target, 'CLAUDE.md'), 'existing');
    const r = runCli([target, '--no-plantuml'], {
      env: { CREATE_BASELINE_TEMPLATE_DIR: tpl },
    });
    assert.equal(r.status, 1);
  });

  it('--force in non-TTY context exits 2', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'cli-target-'));
    await writeFile(join(target, 'CLAUDE.md'), 'existing');
    const r = runCli([target, '--force', '--no-plantuml'], {
      env: { CREATE_BASELINE_TEMPLATE_DIR: tpl },
    });
    assert.equal(r.status, 2);
  });

  it('--dry-run on conflict prints intent and exits 0', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'cli-target-'));
    await writeFile(join(target, 'CLAUDE.md'), 'existing');
    const r = runCli([target, '--merge', '--dry-run', '--no-plantuml'], {
      env: { CREATE_BASELINE_TEMPLATE_DIR: tpl },
    });
    assert.equal(r.status, 0);
  });
});
