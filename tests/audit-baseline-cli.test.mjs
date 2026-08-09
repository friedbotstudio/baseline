// read-front-door-sweep — audit-baseline CLI front door (T-010, AC-006/011/012/014)
//
// audit.mjs was script-shaped: it did its work at module top level, driven by
// a bare `for (const arg of process.argv.slice(2))` loop, and never exposed a
// callable entry point. This locks in the extracted named export
// `runAudit({rootDir})` -> `{verdict, checks, failures}` (never throws), the
// new `cli.mjs` single-verb `report` dispatcher over it, and the CI exit-code
// contract from spec §Behavior #6: exit 1 on a FAIL verdict, which overrides
// the shared dispatcher's usual EXIT_OK-on-every-successful-handler path.
//
// Fixtures are isolated copies of the live repo's .claude/src/scripts/docs
// trees (the same shape tests/build-audit-gate.test.mjs's
// makeIsolatedRepoCopy uses), deliberately WITHOUT obj/template/ — with
// obj/template/.claude/manifest.json present, checks/skill-ownership.mjs
// hashes live skill files, and this shared working tree has sibling swarm
// workers concurrently editing other skills right now, which would make a
// "clean" fixture flaky through no fault of the file under test. Without a
// manifest, that check WARNs "manifest missing" instead of hash-checking, so
// PASS/FAIL here depends only on files this test file itself controls.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const AUDIT = join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs');
const CLI = join(REPO_ROOT, '.claude/skills/audit-baseline/cli.mjs');

async function makeIsolatedRepoCopy() {
  const root = await mkdtemp(join(tmpdir(), 'audit-cli-fixture-'));
  for (const entry of ['.claude', 'src', 'scripts', 'docs']) {
    const from = join(REPO_ROOT, entry);
    if (existsSync(from)) await cp(from, join(root, entry), { recursive: true });
  }
  for (const entry of ['.mcp.json', 'CLAUDE.md', 'README.md']) {
    const from = join(REPO_ROOT, entry);
    if (existsSync(from)) await cp(from, join(root, entry));
  }
  return root;
}

function run(command, args, opts = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...opts });
}

describe('audit-baseline CLI front door (T-010)', () => {
  let cleanRoot;
  let dirtyRoot;

  before(async () => {
    cleanRoot = await makeIsolatedRepoCopy();
    dirtyRoot = await makeIsolatedRepoCopy();
    // Seed drift: delete one baseline hook file. checks/counts.mjs's "hooks
    // names match seed §4.1" reports a FAIL row naming exactly this hook —
    // deterministic, cheap, and needs no manifest or build step.
    await unlink(join(dirtyRoot, '.claude/hooks/setup_guard.mjs'));
  });

  after(async () => {
    if (cleanRoot) await rm(cleanRoot, { recursive: true, force: true });
    if (dirtyRoot) await rm(dirtyRoot, { recursive: true, force: true });
  });

  it('test_when_run_audit_imported_then_named_export_returns_verdict_data', async () => {
    const mod = await import(pathToFileURL(AUDIT).href);
    assert.equal(typeof mod.runAudit, 'function', 'audit.mjs must export a named runAudit function');

    const result = mod.runAudit({ rootDir: cleanRoot });

    assert.equal(typeof result, 'object', 'runAudit must return data, not undefined');
    assert.ok(['PASS', 'FAIL'].includes(result.verdict), 'result.verdict must be PASS or FAIL');
    assert.ok(Array.isArray(result.checks), 'result.checks must be an array');
    assert.ok(Array.isArray(result.failures), 'result.failures must be an array');
    assert.equal(result.verdict, 'PASS', 'the clean fixture must audit clean');
    assert.equal(result.failures.length, 0, 'a PASS verdict must carry zero failures');
  });

  it('test_when_baseline_is_clean_then_report_emits_pass_and_exits_zero', () => {
    const result = run('node', [CLI, 'report', '--json', '--root', cleanRoot]);

    assert.equal(result.status, 0, `expected exit 0, got ${result.status}. stderr: ${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.verdict, 'PASS');
    assert.deepEqual(parsed.failures, []);
  });

  it('test_when_a_check_fails_then_report_emits_fail_lists_failures_and_exits_one', () => {
    const result = run('node', [CLI, 'report', '--json', '--root', dirtyRoot]);

    assert.equal(result.status, 1, `expected exit 1 on a FAIL verdict, got ${result.status}`);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.verdict, 'FAIL');
    assert.ok(parsed.failures.length > 0, 'a FAIL verdict must list at least one failure');
    assert.ok(
      parsed.failures.some(([name]) => name === 'hooks names match seed §4.1'),
      'the seeded drift (missing setup_guard hook) must appear among the failures',
    );
  });

  it('test_when_report_runs_with_json_then_stdout_is_parseable_json_only', () => {
    const result = run('node', [CLI, 'report', '--json', '--root', dirtyRoot]);

    assert.equal(result.status, 1, 'this is the FAIL path — the interesting case for AC-011');
    assert.doesNotThrow(
      () => JSON.parse(result.stdout),
      'stdout on the non-zero-exit FAIL path must still parse as JSON, not a truncated or mixed body',
    );
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.verdict, 'FAIL');
  });

  it('test_when_audit_mjs_invoked_directly_then_original_behavior_is_unchanged', () => {
    const clean = run('node', [AUDIT], { env: { ...process.env, CLAUDE_PROJECT_DIR: cleanRoot } });
    assert.equal(clean.status, 0, `clean fixture must exit 0. stdout tail: ${clean.stdout.slice(-500)}`);
    assert.match(clean.stdout, /^check\s+status\s+detail$/m, 'the original table header must be unchanged');
    assert.match(
      clean.stdout,
      /^overall\s+PASS\s+fails=0 warns=\d+$/m,
      'the original overall PASS row must be unchanged',
    );

    const dirty = run('node', [AUDIT], { env: { ...process.env, CLAUDE_PROJECT_DIR: dirtyRoot } });
    assert.equal(dirty.status, 1, `dirty fixture must exit 1. stdout tail: ${dirty.stdout.slice(-500)}`);
    assert.match(
      dirty.stdout,
      /hooks names match seed §4\.1\s+FAIL\s+missing: \["setup_guard"\]/,
      'the original FAIL row detail text must be unchanged',
    );
    assert.match(
      dirty.stdout,
      /^overall\s+FAIL\s+fails=3 warns=\d+$/m,
      'the original overall FAIL row must be unchanged',
    );
  });

  it('test_when_audit_mjs_invoked_with_file_flag_then_test_cmd_path_still_works', () => {
    // This project's configured test.cmd is exactly this shape:
    // "node .claude/skills/audit-baseline/audit.mjs --file={file}"
    const result = run('node', [AUDIT, '--file=CLAUDE.md'], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: cleanRoot },
    });
    assert.equal(
      result.status,
      0,
      `--file= scoping on an in-scope file must still run the full audit and exit 0. stderr: ${result.stderr}`,
    );
    assert.match(result.stdout, /^overall\s+PASS/m, 'the --file= path must render the same table, not a stub');
  });

  it('test_when_unknown_subcommand_then_usage_on_stderr_and_exit_one', () => {
    const result = run('node', [CLI, 'bogus-subcommand']);

    assert.equal(result.status, 1, 'an unknown subcommand must exit 1');
    assert.equal(result.stdout, '', 'usage on an unknown subcommand must not print to stdout');
    assert.match(result.stderr, /unknown subcommand/, 'stderr must name the unknown-subcommand condition');
    assert.match(result.stderr, /usage:/, 'stderr must render the usage block');
  });

  it('test_when_verb_source_read_then_it_delegates_rather_than_reimplements', async () => {
    const src = await readFile(CLI, 'utf8');

    assert.match(
      src,
      /import\s*\{\s*runAudit\s*\}\s*from\s*['"]\.\/audit\.mjs['"]/,
      'cli.mjs must import runAudit from ./audit.mjs',
    );
    assert.doesNotMatch(
      src,
      /buildContext|from ['"]\.\/checks\//,
      'cli.mjs must not reimplement audit logic by reaching into checks/ or context.mjs directly',
    );
  });

  it('test_when_audit_verdict_is_fail_then_exit_is_one_and_body_still_prints', () => {
    const result = run('node', [CLI, 'report', '--json', '--root', dirtyRoot]);

    assert.equal(result.status, 1, `expected exit 1 on a FAIL verdict, got ${result.status}`);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.verdict, 'FAIL', 'stdout still parses as the verdict JSON');
  });

  it('test_when_audit_verdict_is_pass_then_exit_is_zero', () => {
    const result = run('node', [CLI, 'report', '--json', '--root', cleanRoot]);

    assert.equal(result.status, 0, `expected exit 0 on a PASS verdict, got ${result.status}`);
    assert.equal(JSON.parse(result.stdout).verdict, 'PASS');
  });

  it('test_when_audit_cli_source_read_then_no_process_exit_bypass_remains', async () => {
    const src = await readFile(CLI, 'utf8');

    assert.doesNotMatch(
      src,
      /process\.exit/,
      'the dispatcher owns the exit — cli.mjs must not call process.exit itself',
    );
  });
});
