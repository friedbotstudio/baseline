// Install-time Java preflight (D1 + D3 + D4).
//
// The implement worker adds a `java -version` probe to runPlainInstall +
// runBrandedInstall. The probe is mocked via env var
// CREATE_BASELINE_JAVA_PROBE_OVERRIDE for deterministic test runs:
//   - "present" → probe behaves as if `java -version` exited 0
//   - "missing" → probe behaves as if `java -version` errored
//   - unset    → real spawnSync probe (covered by manual / CI integration)
//
// Four behavior matrices:
//   java present + no flag        → exit 0, no Java-related stderr
//   java missing + no flag        → exit 0, warning naming Java + "guide mode"
//   java missing + --require-plantuml → exit 4, error naming Java
//   java missing + --no-plantuml  → exit 0, no Java mention (user opted out)
//
// Tests are RED until /implement adds the preflight + the probe override.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = 'bin/cli.js';

async function makeTemplateFixture() {
  const tpl = await mkdtemp(join(tmpdir(), 'java-preflight-tpl-'));
  await mkdir(join(tpl, '.claude'));
  await writeFile(join(tpl, 'CLAUDE.md'), '# baseline\n');
  await writeFile(join(tpl, '.mcp.json'), JSON.stringify({
    mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
  }, null, 2) + '\n');
  await writeFile(join(tpl, '.claude/project.json'), JSON.stringify({ configured: false }) + '\n');
  await mkdir(join(tpl, 'docs/init'), { recursive: true });
  await writeFile(join(tpl, 'docs/init/seed.md'), '# seed\n');
  return tpl;
}

function runCliWithJava(args, javaState, tpl) {
  return spawnSync('node', [CLI, ...args], {
    env: {
      ...process.env,
      CREATE_BASELINE_TEST_MODE: '1',
      CREATE_BASELINE_TEMPLATE_DIR: tpl,
      CREATE_BASELINE_JAVA_PROBE_OVERRIDE: javaState,
    },
    encoding: 'utf8',
  });
}

describe('install — Java preflight (D1 + D3 + D4)', () => {
  it('test_when_install_runs_with_java_on_path_then_no_java_related_stderr_emitted', { skip: process.env.PLANTUML_TESTS ? false : 'set PLANTUML_TESTS=1 to run JVM-spawning PlantUML tests' }, async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'java-target-'));
    const r = runCliWithJava([target, '--no-plantuml'], 'present', tpl);
    assert.equal(r.status, 0, `install must exit 0 when Java is present.\nstderr: ${r.stderr}`);
    assert.equal(
      /\bjava\b/i.test(r.stderr),
      false,
      `stderr must not mention Java when the preflight passes.\nstderr: ${r.stderr}`,
    );
  });

  it('test_when_install_runs_without_java_and_no_flag_then_warns_and_exits_zero', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'java-target-'));
    const r = runCliWithJava([target], 'missing', tpl);
    assert.equal(r.status, 0, `install must exit 0 when Java is missing without flags.\nstderr: ${r.stderr}`);
    assert.match(
      r.stderr,
      /Java not found.*will be skipped/i,
      `stderr must contain the Java-missing warning naming the skip behavior.\nstderr: ${r.stderr}`,
    );
  });

  it('test_when_install_runs_without_java_and_require_plantuml_then_exits_4_with_named_error', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'java-target-'));
    const r = runCliWithJava([target, '--require-plantuml'], 'missing', tpl);
    assert.equal(r.status, 4, `install must exit 4 when Java is missing + --require-plantuml.\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /\bjava\b/i, `stderr must name Java as the missing dep.\nstderr: ${r.stderr}`);
    assert.match(
      r.stderr,
      /require-plantuml/i,
      `stderr must reference --require-plantuml as the escalating flag.\nstderr: ${r.stderr}`,
    );
  });

  it('test_when_install_runs_without_java_and_no_plantuml_then_silent_and_exits_zero', async () => {
    const tpl = await makeTemplateFixture();
    const target = await mkdtemp(join(tmpdir(), 'java-target-'));
    const r = runCliWithJava([target, '--no-plantuml'], 'missing', tpl);
    assert.equal(r.status, 0, `install must exit 0 with --no-plantuml even when Java is missing.\nstderr: ${r.stderr}`);
    assert.equal(
      /\bjava\b/i.test(r.stderr),
      false,
      `--no-plantuml is the user opt-out; stderr must not mention Java.\nstderr: ${r.stderr}`,
    );
  });
});
