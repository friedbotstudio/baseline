#!/usr/bin/env node
// epic_close.mjs — actuates the epic-close fold (seed §18.9; spec epic-close-bundle-archival).
//
// CLI:
//   node epic_close.mjs <epic>
//
// When every child of <epic> is `committed` and the epic is not already closed,
// archives the live discovery bundle into docs/archive/<UTC-date>/<epic>/ (by
// delegating to the shipped archive.sh — git mv for tracked files) and merges
// closed:true + closed_at into the gitignored epic state file. It NEVER creates
// a commit: the commit skill's last-child fold lets the staged move ride that
// commit, and the standalone recovery path asks the maintainer to /grant-commit
// then /commit. `approved` is never written; the state file is retained.
//
// Exit codes:
//   0  acted, or a clean no-op (absent epic / in flight / already closed)
//   1  archive.sh refused (e.g. archive target already exists) — nothing closed
//   2  bad invocation (missing slug) or unparseable epic state JSON

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_SCRIPT = path.join(HERE, '..', 'archive', 'archive.sh');

function resolveRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function epicStatePath(root, epic) {
  return path.join(root, '.claude/state/epic', `${epic}.json`);
}

function readState(statePath) {
  const raw = fs.readFileSync(statePath, 'utf8');
  return JSON.parse(raw);
}

function openChildren(state) {
  const children = Array.isArray(state.children) ? state.children : [];
  return children.filter((c) => c.status !== 'committed');
}

function archiveBundle(root, epic) {
  execFileSync('bash', [ARCHIVE_SCRIPT, epic], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    stdio: 'inherit',
  });
}

function markClosed(statePath, state) {
  const now = Math.floor(Date.now() / 1000);
  const closed = { ...state, closed: true, closed_at: now, updated_at: now };
  fs.writeFileSync(statePath, JSON.stringify(closed, null, 2) + '\n');
}

function closeEpic(root, epic, statePath, state) {
  archiveBundle(root, epic);
  markClosed(statePath, state);
  console.log(
    `epic-close: closed ${epic}; discovery bundle archived and staged — ` +
      `run /grant-commit then /commit to land it`,
  );
}

function main(argv) {
  const epic = argv[2];
  if (!epic) {
    console.error('usage: epic_close.mjs <epic>');
    return 2;
  }

  const root = resolveRoot();
  const statePath = epicStatePath(root, epic);

  if (!fs.existsSync(statePath)) {
    console.log(`epic-close: no such epic ${epic}`);
    return 0;
  }

  let state;
  try {
    state = readState(statePath);
  } catch {
    console.error(`epic-close: malformed epic state JSON at ${statePath}`);
    return 2;
  }

  if (state.closed === true) {
    console.log(`epic-close: epic ${epic} already closed`);
    return 0;
  }

  const children = Array.isArray(state.children) ? state.children : [];
  const open = openChildren(state);
  if (children.length === 0 || open.length > 0) {
    console.log(
      `epic-close: epic ${epic} still in flight: ${open.length} of ${children.length} children open`,
    );
    return 0;
  }

  try {
    closeEpic(root, epic, statePath, state);
  } catch (e) {
    console.error(`epic-close: archive refused for ${epic}: ${e.message}`);
    return 1;
  }
  return 0;
}

process.exit(main(process.argv));
