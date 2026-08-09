// Read-front-door sweep, T-007 — fold `document-gate.mjs` behind the `document`
// dispatcher as a `gate` verb (§Behavior #5, AC-005/011/012/014).
//
// The direct path (`node document-gate.mjs --slug S`) is the enforcement point the
// harness already calls; folding adds a caller, it never moves the entry point. So
// this suite proves TWO things side by side: the new verb agrees with the old
// direct path on the same fixture, and the direct path's own exit-code contract
// (0 clean / 1 blocked) survives the refactor untouched.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { tryImport } from './helpers/memory-fixtures.mjs';
import { runCli, runCliJson } from './helpers/cli-runner.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = '.claude/skills/document/document-gate.mjs';
const CLI_SOURCE = join(REPO_ROOT, '.claude/skills/document/cli.mjs');

// Same shape ticket E (document-routing-gate.test.mjs) uses. One surface is enough
// for this sweep — the sequencing/parity behavior is orthogonal to how many
// surfaces are configured.
const SURFACES = [
  { match: ['site-src/**'], kind: 'public-page', requires: ['technical-writer', 'copywriting'], reader_target: 11 },
];

function makeProject({ receipts = [], git = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'docgate-verb-'));
  mkdirSync(join(root, '.claude/state/document'), { recursive: true });
  mkdirSync(join(root, 'site-src'), { recursive: true });
  writeFileSync(
    join(root, '.claude/project.json'),
    JSON.stringify({ document: { surfaces: SURFACES } }, null, 2),
  );
  writeFileSync(
    join(root, '.claude/state/document/demo.json'),
    JSON.stringify({ slug: 'demo', receipts }, null, 2),
  );
  writeFileSync(join(root, 'site-src/x.njk'), 'hello\n');
  if (git) spawnSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
  return root;
}

function runDirect(root, args = ['--slug', 'demo']) {
  return spawnSync('node', [join(REPO_ROOT, GATE), ...args], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

const SATISFIED_RECEIPTS = [
  { surface: 'site-src/x.njk', delegate: 'technical-writer' },
  { surface: 'site-src/x.njk', delegate: 'copywriting' },
];

describe('document gate verb (read-front-door sweep, T-007)', () => {
  it('test_when_gate_verb_and_direct_helper_run_on_same_fixture_then_payloads_match', () => {
    const root = makeProject({ receipts: SATISFIED_RECEIPTS, git: true });
    try {
      const cli = runCliJson('document', ['gate', '--slug', 'demo', '--json', '--root', root]);
      const direct = runDirect(root);

      assert.ok(cli.json, `verb must emit parseable JSON\n${cli.stdout}${cli.stderr}`);
      assert.equal(cli.json.ok, true, 'both sides agree the fixture is satisfied');
      assert.deepEqual(cli.json.missing, [], 'nothing is missing on the satisfied fixture');
      assert.equal(cli.json.required.length, 1, 'one surface matched');
      assert.equal(direct.status, 0, 'the direct helper exits 0 on the same satisfied fixture');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_gate_verb_runs_then_stdout_is_parseable_json_only', () => {
    const root = makeProject({ receipts: SATISFIED_RECEIPTS });
    try {
      const res = runCliJson('document', ['gate', '--slug', 'demo', '--touched', 'site-src/x.njk', '--json', '--root', root]);
      assert.ok(res.json, `stdout must parse as JSON\n${res.stdout}${res.stderr}`);
      assert.equal(
        res.stdout,
        JSON.stringify(res.json, null, 2) + '\n',
        'stdout is exactly the JSON payload — nothing else is written',
      );
      assert.equal(res.stderr, '', 'a successful gate read writes nothing to stderr');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_run_gate_imported_then_named_export_exists_and_returns_data', async () => {
    const mod = await tryImport(GATE);
    assert.ok(mod, `${GATE} must exist`);
    assert.equal(typeof mod.runGate, 'function', 'document-gate.mjs must export a named runGate function');

    const root = makeProject({ receipts: SATISFIED_RECEIPTS });
    try {
      const result = mod.runGate({ slug: 'demo', paths: ['site-src/x.njk'], rootDir: root });
      assert.deepEqual(
        Object.keys(result).sort(),
        ['missing', 'ok', 'required'],
        'runGate returns {required, missing, ok} as data, not a process exit',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_document_gate_invoked_directly_then_main_guard_still_fires', () => {
    const satisfied = makeProject({ receipts: SATISFIED_RECEIPTS });
    const unsatisfied = makeProject({ receipts: [] });
    try {
      const okRes = runDirect(satisfied, ['--slug', 'demo', '--paths', 'site-src/x.njk']);
      assert.equal(okRes.status, 0, `satisfied fixture must still exit 0\n${okRes.stdout}${okRes.stderr}`);

      const blockedRes = runDirect(unsatisfied, ['--slug', 'demo', '--paths', 'site-src/x.njk']);
      assert.equal(blockedRes.status, 1, `unsatisfied fixture must still exit 1\n${blockedRes.stdout}${blockedRes.stderr}`);
    } finally {
      rmSync(satisfied, { recursive: true, force: true });
      rmSync(unsatisfied, { recursive: true, force: true });
    }
  });

  it('test_when_every_required_delegate_left_a_receipt_then_ok_is_true', async () => {
    const mod = await tryImport(GATE);
    assert.ok(mod, `${GATE} must exist`);
    const root = makeProject({ receipts: SATISFIED_RECEIPTS });
    try {
      const result = mod.runGate({ slug: 'demo', paths: ['site-src/x.njk'], rootDir: root });
      assert.equal(result.ok, true, 'every required delegate left a receipt');
      assert.deepEqual(result.missing, [], 'nothing is missing');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_a_required_delegate_receipt_is_absent_then_missing_names_it', async () => {
    const mod = await tryImport(GATE);
    assert.ok(mod, `${GATE} must exist`);
    // Only technical-writer left a receipt; copywriting did not.
    const root = makeProject({ receipts: [{ surface: 'site-src/x.njk', delegate: 'technical-writer' }] });
    try {
      const result = mod.runGate({ slug: 'demo', paths: ['site-src/x.njk'], rootDir: root });
      assert.equal(result.ok, false, 'one required delegate left no receipt');
      assert.deepEqual(
        result.missing,
        [{ surface: 'site-src/x.njk', delegate: 'copywriting' }],
        'the absent delegate is named in missing',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_slug_flag_missing_value_then_usage_error_exit_one', () => {
    const res = runCli('document', ['gate', '--slug']);
    assert.equal(res.status, 1, `a --slug with nothing behind it must exit 1\n${res.stdout}${res.stderr}`);
    assert.match(res.stderr, /--slug requires a value/, 'the usage error names the missing value');
  });

  it('test_when_verb_source_read_then_it_delegates_rather_than_reimplements', () => {
    const text = readFileSync(CLI_SOURCE, 'utf8');
    assert.match(text, /from ['"]\.\/document-gate\.mjs['"]/, 'cli.mjs must import from document-gate.mjs');
    assert.match(text, /\brunGate\b/, 'cli.mjs must use the named runGate export');
    assert.doesNotMatch(
      text,
      /requiredDelegates\(|missingReceipts\(/,
      'cli.mjs must not re-implement the required-delegate computation — it delegates to runGate',
    );
  });
});
