// Orchestration (CLI) — /commit Phase 11 closure preflight.
// Runs BEFORE `git commit` to give a friendly error before the hard-block
// git_commit_guard fires, and to enforce the message-dependent `Closes <key>`
// reconciliation (AI-04) that is deliberately kept OUT of the guard (spec D2).
// Pure stamp logic is delegated to .claude/hooks/lib/closure-check.mjs (D3).
//
// Usage:
//   node closure-precommit-check.mjs --memory-dir <d> --backlog-keys <csv> \
//        --staged-file <path> [--message-file <path>]
// Exit: 0 ok · 1 violation · 2 usage. JSON report on stdout.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { unsatisfiedKeys } from '../../hooks/lib/closure-check.mjs';

const BACKLOG_REL = '.claude/memory/backlog.md';
const CLOSES_RE = /\bCloses\s+(?:backlog\s+)?([a-z0-9][a-z0-9-]*-[0-9a-f]{4})\b/gi;

function closesKeys(message) {
  const found = new Set();
  for (const m of String(message || '').matchAll(CLOSES_RE)) found.add(m[1].toLowerCase());
  return [...found];
}

function readStagedList(path) {
  return readFileSync(path, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function main(argv) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        'memory-dir': { type: 'string' },
        'backlog-keys': { type: 'string' },
        'staged-file': { type: 'string' },
        'message-file': { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    process.stderr.write(`closure-precommit-check: ${err.message}\n`);
    return 2;
  }
  for (const req of ['memory-dir', 'backlog-keys', 'staged-file']) {
    if (values[req] === undefined) {
      process.stderr.write(`closure-precommit-check: --${req} is required\n`);
      return 2;
    }
  }

  const keys = values['backlog-keys'].split(',').map((k) => k.trim()).filter(Boolean);
  const stagedPaths = readStagedList(values['staged-file']);
  const memdir = resolve(values['memory-dir']);
  const message = values['message-file'] !== undefined ? readFileSync(values['message-file'], 'utf8') : '';

  // Check both shapes unconditionally, per key — never branch on which shape the
  // store "is". A migrated store can carry a leftover empty `backlog.md` stub
  // alongside the real `backlog/` shard directory, and a single either/or guess
  // (`!existsSync(flat) && existsSync(sharded)`) reads flat in that case and looks
  // for the entry in the stub, where it can never be. This mirrors
  // `evaluateClosure` in closure-check.mjs (D3, the guard's own source of truth),
  // which never chose a shape either — see landmine
  // closure-preflight-guesses-a-store-shape-the-guard-never-does.
  const flatPath = join(memdir, 'backlog.md');
  const shardedDir = join(memdir, 'backlog');
  const flatText = existsSync(flatPath) ? readFileSync(flatPath, 'utf8') : '';

  const byKey = {};
  if (existsSync(shardedDir)) {
    for (const f of readdirSync(shardedDir).filter((n) => n.endsWith('.md'))) {
      const text = readFileSync(join(shardedDir, f), 'utf8');
      const m = /^key:\s*(.+)$/m.exec(text);
      if (m) byKey[m[1].trim()] = { rel: `.claude/memory/backlog/${f}`, text };
    }
  }
  const shardedStamped = (k) => byKey[k]
    && /^status:\s*picked-up\s*$/m.test(byKey[k].text)
    && /^superseded-at:\s*\S/m.test(byKey[k].text);
  const shardedStaged = (k) => Boolean(byKey[k]) && stagedPaths.includes(byKey[k].rel);
  const flatHasEntry = (k) => new RegExp(`^##\\s+${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(flatText);
  const flatStamped = (k) => flatHasEntry(k) && unsatisfiedKeys(flatText, [k]).length === 0;
  const flatStaged = stagedPaths.includes(BACKLOG_REL);

  const stamped = (k) => shardedStamped(k) || flatStamped(k);
  const staged = (k) => shardedStaged(k) || (flatStaged && flatHasEntry(k));

  const unstamped = keys.filter((k) => !stamped(k));
  const backlogStaged = keys.length > 0 && keys.every((k) => staged(k));
  const unreconciledCloses = closesKeys(message).filter((k) => !keys.includes(k) || !stamped(k));

  const ok = keys.length === 0
    ? unreconciledCloses.length === 0
    : unstamped.length === 0 && backlogStaged && unreconciledCloses.length === 0;

  process.stdout.write(JSON.stringify({ ok, unstamped, unstaged: !backlogStaged, unreconciledCloses }) + '\n');
  return ok ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
