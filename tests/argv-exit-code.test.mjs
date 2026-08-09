// T-012 — the dispatcher can express "print the body AND exit non-zero".
//
// The gap this closes: `dispatch` ended every successful handler with an
// unconditional `process.exit(EXIT_OK)`, so a verb whose EXIT CODE IS ITS VERDICT
// had nowhere to put that verdict. Only the catch path could exit non-zero, and it
// prints error.message to stderr instead of the JSON body — the opposite of what a
// CI caller needs.
//
// Two verbs in this batch need it. `audit-baseline report` must exit 1 on a FAIL
// verdict (that is the CI contract, AC-006) and `spec review` must exit 2 on
// BLOCKED (AC-007). Both are SUCCESSFUL runs that report bad news; neither is an
// error. Without this the only options were a field nobody reads or two verbs each
// bypassing `emit` with their own process.exit — the duplication AC-014 forbids.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = process.cwd();
const ARGV = join(REPO, '.claude/skills/lib/argv.mjs');

// A throwaway dispatcher whose handlers return the exit codes under test. Built as
// a real file and run as a real process because the behaviour under test IS
// process exit — asserting it in-process would need process.exit stubbed, which is
// mocking the thing being measured.
function makeHarness() {
  const dir = mkdtempSync(join(tmpdir(), 'argv-exit-'));
  const file = join(dir, 'probe.mjs');
  writeFileSync(file, `
import { dispatch, lines } from ${JSON.stringify(ARGV)};

await dispatch({
  name: 'probe',
  subcommands: {
    clean:    { summary: 'no exitCode field at all', run: () => ({ data: { verdict: 'CLEAN' }, text: lines(['clean']) }) },
    zero:     { summary: 'explicit zero',            run: () => ({ data: { verdict: 'CLEAN' }, text: lines(['clean']), exitCode: 0 }) },
    blocked:  { summary: 'exit 2 with a body',       run: () => ({ data: { verdict: 'BLOCKED' }, text: lines(['blocked']), exitCode: 2 }) },
    failed:   { summary: 'exit 1 with a body',       run: () => ({ data: { verdict: 'FAIL' }, text: lines(['failed']), exitCode: 1 }) },
    thrower:  { summary: 'still an error path',      run: () => { throw new Error('boom'); } },
  },
});
`, 'utf8');
  return file;
}

function run(file, args) {
  try {
    const stdout = execFileSync('node', [file, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout ? String(e.stdout) : '', stderr: e.stderr ? String(e.stderr) : '' };
  }
}

describe('T-012 — a handler-returned exit code is honoured', () => {
  const probe = makeHarness();

  it('test_when_handler_returns_exit_code_two_then_process_exits_two_and_body_is_printed', () => {
    const r = run(probe, ['blocked', '--json']);

    assert.equal(r.code, 2, 'the handler-returned code reaches the process');
    const body = JSON.parse(r.stdout);
    assert.equal(body.verdict, 'BLOCKED', 'the body is still printed — this is the whole point');
  });

  it('test_when_handler_returns_exit_code_one_then_process_exits_one_and_body_is_printed', () => {
    const r = run(probe, ['failed', '--json']);

    assert.equal(r.code, 1);
    assert.equal(JSON.parse(r.stdout).verdict, 'FAIL');
  });

  it('test_when_handler_returns_no_exit_code_then_the_zero_default_is_unchanged', () => {
    const r = run(probe, ['clean', '--json']);

    assert.equal(r.code, 0, 'every existing verb returns no exitCode and must keep exiting 0');
    assert.equal(JSON.parse(r.stdout).verdict, 'CLEAN');
  });

  it('test_when_handler_returns_exit_code_zero_then_it_exits_zero', () => {
    assert.equal(run(probe, ['zero', '--json']).code, 0, 'an explicit 0 is not confused with absent');
  });

  it('test_when_exit_code_honoured_then_the_text_path_prints_too', () => {
    const r = run(probe, ['blocked']);

    assert.equal(r.code, 2);
    assert.match(r.stdout, /blocked/, 'the human-readable path is not suppressed by the non-zero exit');
  });

  it('test_when_handler_throws_then_the_error_path_is_unchanged', () => {
    const r = run(probe, ['thrower']);

    assert.equal(r.code, 1, 'a thrown error still maps through exitCodeFor');
    assert.match(r.stderr, /boom/, 'and still reports on stderr, not stdout');
    assert.equal(r.stdout, '', 'a throw prints no body');
  });

  it('test_when_unknown_subcommand_then_usage_exit_is_unchanged', () => {
    const r = run(probe, ['nope']);

    assert.equal(r.code, 1);
    assert.match(r.stderr, /unknown subcommand/i);
  });
});
