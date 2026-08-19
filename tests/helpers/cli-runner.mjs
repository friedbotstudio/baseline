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
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { REPO_ROOT } from './memory-fixtures.mjs';

export const DISPATCHERS = {
  workspace: '.claude/skills/workspace/cli.mjs',
  'memory-sync': '.claude/skills/memory-sync/cli.mjs',
  'system-reconcile': '.claude/skills/system-reconcile/cli.mjs',
  'memory-index': '.claude/skills/memory-index/cli.mjs',
  document: '.claude/skills/document/cli.mjs',
  commit: '.claude/skills/commit/cli.mjs',
  harness: '.claude/skills/harness/cli.mjs',
  standup: '.claude/skills/standup/cli.mjs',
  spec: '.claude/skills/spec/cli.mjs',
  roadmap: '.claude/skills/roadmap/cli.mjs',
};

// Pattern B (spec dispatcher-sweep D1): a single-purpose helper carrying its own
// `process.argv` entry point behind an import.meta.url main-guard, rather than a
// subcommand on a shared dispatcher.
//
// `argless` is the half that keeps the shared loop honest. Three of these six take a
// required argument — a manifest path, an input document, a file to migrate — so a
// loop firing the bare subcommand at all six would assert "exit 0" against three
// commands that SHOULD exit 1 for want of an argument. Those three are exercised by
// their own targeted tests; the loop covers what is genuinely uniform.
// workflow-migrator.js is deliberately ABSENT: it is a build mirror of
// src/cli/workflow-migrator.js, so an entry point inside it is reverted by the next
// `npm run build`. Its front door is the `harness` Pattern A dispatcher above.
export const PATTERN_B = {
  'commit-planner/inventory.mjs': { subcommand: 'group', argless: true },
  'power/commit-split.mjs': { subcommand: 'plan', argless: true },
  'org-dispatch/org-mode.mjs': { subcommand: 'gate', argless: true },
  'sprint-plan/validate-manifest.mjs': { subcommand: 'validate', argless: false },
  'sprint-planner/planner.mjs': { subcommand: 'select', argless: false },
};

export function patternBPath(rel) {
  return join('.claude/skills', rel);
}

export const ARGV_LIB = '.claude/skills/lib/argv.mjs';

// The presentation half of the shared dispatcher Foundation — usage text and the
// result writer. Split out of argv.mjs at the code-review file-length finding;
// named here rather than inlined in the test so the two halves stay addressable
// as a pair.
export const OUTPUT_LIB = '.claude/skills/lib/output.mjs';

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

// The second vacuity trap, one level in from `missing`.
//
// `assertPresent` proves the FILE is there. It cannot prove the SUBCOMMAND is,
// and an unknown subcommand exits 1 — the same code every rejection test asserts.
// So `digest --all must exit 1` passes against a dispatcher that has never heard
// of `digest`, and keeps passing no matter how the real guard is written. Three
// suites of the writer contract were green that way before this existed.
//
// Detected on the stderr banner rather than the exit code, because the exit code
// is precisely what cannot distinguish the two cases.
export function subcommandUnknown(res) {
  return /unknown subcommand/i.test(res.stderr ?? '');
}

export function assertKnownSubcommand(assert, res, subcommand) {
  assertPresent(assert, res);
  assert.ok(
    !subcommandUnknown(res),
    `\`${subcommand}\` must be a known subcommand of ${res.rel} before its behavior can be asserted — an unknown subcommand exits 1, which is also what this test expects, so without this check the assertion is vacuous`,
  );
}

// ─── write-path fixtures (spec dispatcher-sweep, W-1..W-5) ───
//
// The read subcommands in cli-workspace.test.mjs run against the LIVE corpus
// because reading it mutates nothing. The write subcommands cannot: the rule is
// "never MUTATE the live corpus", so every writer assertion needs its own root.
//
// `enabled` is a parameter rather than always-true because W-2 (a corpus writer
// no-ops when the map is off) is the one contract that can only be exercised by a
// project that never opted in.
export function makeCliProject({ enabled = true, extraConfig = {} } = {}, mkdtemp) {
  const root = mkdtemp();
  mkdirSync(join(root, '.claude'), { recursive: true });
  const config = enabled
    ? { memory: { architecture_map: { enabled: true, ...extraConfig } } }
    : { memory: { ...extraConfig } };
  writeFileSync(join(root, '.claude', 'project.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
  return { root, specDir: join(root, 'docs', 'system') };
}

// A recursive content snapshot keyed by repo-relative path. `snapshotTree` in
// memory-fixtures walks shard files under a memory dir; this walks an arbitrary
// subtree, which is what "the tree is byte-identical after a rejected write"
// needs — a rejected write that creates an empty directory must still fail.
export function snapshotDir(dir) {
  const snap = {};
  if (!existsSync(dir)) return snap;
  const walk = (current) => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) {
        snap[relative(dir, path) + '/'] = '<dir>';
        walk(path);
      } else {
        snap[relative(dir, path)] = readFileSync(path, 'utf8');
      }
    }
  };
  walk(dir);
  return snap;
}
