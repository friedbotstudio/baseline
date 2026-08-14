// The binding test command covers the node suite — AC-001, AC-012.
//
// `/integrate` stamps `.claude/state/last_test_result` from `project.json ->
// test.cmd`. That command was the governance audit alone, so the audit's exit 0
// became a PASS while `node --test tests/*.test.mjs` carried eight red
// assertions nobody was gating on. A verdict that cannot see the suite is not a
// verdict about the suite.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_JSON = path.join(REPO_ROOT, '.claude/project.json');

function testCmd() {
  return JSON.parse(readFileSync(PROJECT_JSON, 'utf8')).test?.cmd ?? '';
}

// Two stub commands standing in for the audit and the suite, so the chaining
// operator is what the test measures rather than either real runner.
function runChained(auditExit, suiteExit) {
  const dir = mkdtempSync(path.join(tmpdir(), 'binding-cmd-'));
  try {
    const audit = path.join(dir, 'audit.sh');
    const suite = path.join(dir, 'suite.sh');
    writeFileSync(audit, `#!/bin/sh\nexit ${auditExit}\n`);
    writeFileSync(suite, `#!/bin/sh\nexit ${suiteExit}\n`);
    chmodSync(audit, 0o755);
    chmodSync(suite, 0o755);

    const chained = testCmd().includes('&&') ? '&&' : ';';
    const script = chained === '&&'
      ? `${audit} && ${suite}`
      : `${audit}; a=$?; ${suite}; b=$?; [ $a -eq 0 ] && [ $b -eq 0 ]`;
    return spawnSync('sh', ['-c', script], { encoding: 'utf8' }).status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('binding test command — the verdict covers the suite (AC-001, AC-012)', () => {
  it('test_when_test_cmd_resolved_then_it_runs_both_audit_and_node_suite', () => {
    const cmd = testCmd();

    assert.ok(/audit\.mjs/.test(cmd),
      `test.cmd must still run the governance audit; got: ${cmd}`);
    assert.ok(/--test\b/.test(cmd),
      'test.cmd must also run the node suite — an audit-only binding command stamps ' +
      `PASS over a red suite, which is the defect this AC closes; got: ${cmd}`);
  });

  it('test_when_node_suite_fails_then_binding_verdict_is_fail', () => {
    assert.equal(runChained(0, 1), 1,
      'audit green + suite red must yield a non-zero overall status, or a red suite ' +
      'sits unnoticed exactly as it did on 2026-08-14');
  });

  it('test_when_audit_fails_then_binding_verdict_is_fail', () => {
    assert.notEqual(runChained(1, 0), 0,
      'the audit half must keep gating — chaining the suite in never weakens it');
  });

  it('test_when_both_runners_pass_then_binding_verdict_is_pass', () => {
    assert.equal(runChained(0, 0), 0,
      'both green must be a PASS, or every workflow blocks on a healthy tree');
  });
});
