// Orchestration — the front door to the CI audit contract (§Behavior #6).
//
// `runAudit` (audit.mjs) computes the verdict; this dispatcher only renders it
// and owns the exit-code contract. It never re-derives what a "clean
// baseline" is — that would be reimplementing audit.mjs's logic under a new
// name.
//
// AC-006 needs exit 1 on a FAIL verdict — a *successful* audit run that
// reports failures, not a thrown error. The shared dispatcher
// (`../lib/argv.mjs`) honours a handler-returned `exitCode` for exactly this
// case: the body still prints through the ordinary emit path, only the exit
// status differs.

import { dispatch } from '../lib/argv.mjs';
import { runAudit } from './audit.mjs';

function renderReport({ checks, failures, verdict }) {
  const nameW = Math.max(20, ...checks.map(([name]) => name.length));
  const lines = [];
  lines.push('check'.padEnd(nameW) + '  ' + 'status'.padEnd(6) + '  detail');
  lines.push('-'.repeat(nameW) + '  ' + '-'.repeat(6) + '  ' + '-'.repeat(50));
  for (const [name, status, detail] of checks) {
    lines.push(`${name.padEnd(nameW)}  ${status.padEnd(6)}  ${detail}`);
  }
  lines.push('-'.repeat(nameW) + '  ' + '-'.repeat(6));
  const warnN = checks.filter(([, status]) => status === 'WARN').length;
  lines.push(`${'overall'.padEnd(nameW)}  ${verdict.padEnd(6)}  fails=${failures.length} warns=${warnN}`);
  return lines.join('\n') + '\n';
}

function report({ flags, root }) {
  const auditResult = runAudit({ rootDir: root, skipHashCheck: flags['skip-hash-check'] === true });
  const text = renderReport(auditResult);

  return { data: auditResult, text, exitCode: auditResult.verdict === 'FAIL' ? 1 : 0 };
}

dispatch({
  name: 'audit-baseline',
  subcommands: {
    report: {
      summary: 'CI drift report: verdict PASS/FAIL, checks, failures (exit 1 on FAIL)',
      run: report,
    },
  },
});
