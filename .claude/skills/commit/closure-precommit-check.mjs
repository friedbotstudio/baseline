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

  const flatPath = join(memdir, 'backlog.md');
  const shardedDir = join(memdir, 'backlog');
  const sharded = !existsSync(flatPath) && existsSync(shardedDir);

  let unstamped;
  let backlogStaged;
  let unreconciledCloses;

  if (sharded) {
    // Sharded store: each backlog entry is `backlog/<slug>.md`; the stamp lives in
    // frontmatter and the staged path is the fact file, not a flat `backlog.md`.
    const byKey = {};
    for (const f of readdirSync(shardedDir).filter((n) => n.endsWith('.md'))) {
      const text = readFileSync(join(shardedDir, f), 'utf8');
      const m = /^key:\s*(.+)$/m.exec(text);
      if (m) byKey[m[1].trim()] = { rel: `.claude/memory/backlog/${f}`, text };
    }
    const stamped = (k) => byKey[k]
      && /^status:\s*picked-up\s*$/m.test(byKey[k].text)
      && /^superseded-at:\s*\S/m.test(byKey[k].text);
    unstamped = keys.filter((k) => !stamped(k));
    backlogStaged = keys.length > 0 && keys.every((k) => byKey[k] && stagedPaths.includes(byKey[k].rel));
    unreconciledCloses = closesKeys(message).filter((k) => !keys.includes(k) || !stamped(k));
  } else {
    const backlogText = readFileSync(flatPath, 'utf8');
    unstamped = unsatisfiedKeys(backlogText, keys);
    backlogStaged = stagedPaths.includes(BACKLOG_REL);
    unreconciledCloses = closesKeys(message).filter(
      (k) => !keys.includes(k) || unsatisfiedKeys(backlogText, [k]).length > 0,
    );
  }

  const ok = keys.length === 0
    ? unreconciledCloses.length === 0
    : unstamped.length === 0 && backlogStaged && unreconciledCloses.length === 0;

  process.stdout.write(JSON.stringify({ ok, unstamped, unstaged: !backlogStaged, unreconciledCloses }) + '\n');
  return ok ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
