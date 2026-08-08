// Foundation — invoke a shipped skill dispatcher the way a SOP does.
//
// Why this exists: 24 assertions across four test files need the same three
// primitives — a dispatcher's exit status, its stdout, and its stderr. Inlining
// spawnSync at each site would put a raw child-process primitive next to the
// claims that consume it, which is the shape tests/helpers/css-tokens.mjs was
// extracted to avoid.
//
// Deliberately NOT part of memory-git-fixtures.mjs. That module's runners
// (runPreToolUseHook, runTestFile) are git- and hook-scoped: they own a
// CLAUDE_PROJECT_DIR and a JSON-on-stdin protocol this one has no use for. Same
// file type, different question — the css-tokens/html-ancestry split again.
//
// `missing` is the load-bearing field. A dispatcher that does not exist yet makes
// node exit 1, which is also the exit code an unknown subcommand must produce. A
// test asserting `status === 1` would pass VACUOUSLY against an absent file and
// stay green forever. Every assertion here opens by proving the file is there.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './memory-fixtures.mjs';

export const DISPATCHERS = {
  workspace: '.claude/skills/workspace/cli.mjs',
  'memory-flush': '.claude/skills/memory-flush/cli.mjs',
  'system-reconcile': '.claude/skills/system-reconcile/cli.mjs',
  'memory-index': '.claude/skills/memory-index/cli.mjs',
};

export const ARGV_LIB = '.claude/skills/lib/argv.mjs';

export function dispatcherPath(name) {
  return join(REPO_ROOT, DISPATCHERS[name] ?? name);
}

export function runCli(name, args = [], { cwd = REPO_ROOT, env = {} } = {}) {
  const file = dispatcherPath(name);
  if (!existsSync(file)) {
    return { missing: true, rel: DISPATCHERS[name] ?? name, status: null, stdout: '', stderr: '', out: '' };
  }
  const res = spawnSync(process.execPath, [file, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  const stdout = res.stdout ?? '';
  const stderr = res.stderr ?? '';
  return { missing: false, rel: DISPATCHERS[name] ?? name, status: res.status, stdout, stderr, out: stdout + stderr };
}

// Parses stdout as JSON. `json` stays null on unparseable output so a test can
// distinguish "emitted nothing" from "emitted malformed JSON" without a throw
// swallowing the exit status that explains why.
export function runCliJson(name, args = [], opts = {}) {
  const res = runCli(name, args, opts);
  if (res.missing) return { ...res, json: null };
  try {
    return { ...res, json: JSON.parse(res.stdout) };
  } catch {
    return { ...res, json: null };
  }
}

// The house RED shape (scenario MEMORY.md: tryImport yields one legible failure
// naming the missing module rather than an opaque stack). Same idea, one layer out.
export function assertPresent(assert, res) {
  assert.ok(!res.missing, `${res.rel} must exist and be executable — the dispatcher this AC pins`);
}
