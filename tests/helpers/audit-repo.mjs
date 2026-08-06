// Shared test helper: run audit-baseline against the live repo and, when it
// fails, keep the evidence.
//
// Why: the audit-spawning tests used bare execFileSync, which throws an Error
// whose stdout/stderr the test reporter truncates. When the suite's intermittent
// 3-test audit failure fired (backlog:
// full-suite-intermittently-fails-three-audit-spawning-tests), the audit's own
// complaint was lost with it, and two occurrences produced no attributable
// cause. This helper writes the full payload to disk before throwing, so the
// next occurrence is diagnosable from the log rather than from memory.
//
// A spawn that never ran (EAGAIN / ENOMEM under peak process pressure) is
// recorded too: spawnSync reports it as status null + an `error` field, which is
// otherwise indistinguishable from a clean non-zero exit in the thrown message.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT_SCRIPT = join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs');
const DEFAULT_LOG_DIR = join(REPO_ROOT, '.claude/state/logs');

function failRowsOf(stdout) {
  const rows = (stdout || '').split('\n').filter((line) => /\bFAIL\b/.test(line));
  return rows.length ? rows.join('\n') : '(no FAIL row in stdout — the audit may not have run)';
}

function writeCaptureLog({ label, logDir, command, args, cwd, result }) {
  const logPath = join(logDir, `audit-failure-${label}.log`);
  mkdirSync(logDir, { recursive: true });
  writeFileSync(
    logPath,
    [
      `command: ${command} ${args.join(' ')}`,
      `cwd:     ${cwd}`,
      `status:  ${result.status}`,
      `signal:  ${result.signal ?? '(none)'}`,
      `error:   ${result.error ? result.error.message : '(none)'}`,
      '--- stdout ---',
      result.stdout || '(empty)',
      '--- stderr ---',
      result.stderr || '(empty)',
      '',
    ].join('\n'),
  );
  return logPath;
}

// Returns the audit's stdout on exit 0; throws with the FAIL rows and the
// capture-log path otherwise. `command`/`args`/`cwd`/`logDir` are injectable so
// the capture path itself is testable without a real audit failure.
export function runRepoAudit({
  label,
  command = process.execPath,
  args = [AUDIT_SCRIPT],
  cwd = REPO_ROOT,
  logDir = DEFAULT_LOG_DIR,
} = {}) {
  if (!label) throw new Error('runRepoAudit needs a label — it names the capture log');

  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status === 0) return result.stdout;

  const logPath = writeCaptureLog({ label, logDir, command, args, cwd, result });
  throw new Error(
    `audit-baseline must exit 0; got status=${result.status}` +
      `${result.error ? ` (spawn error: ${result.error.message})` : ''}\n` +
      `${failRowsOf(result.stdout)}\n` +
      `full stdout+stderr captured at ${logPath}`,
  );
}
