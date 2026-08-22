#!/usr/bin/env node
// epic_close.mjs — actuates the epic-close fold (seed §18.9; spec epic-close-bundle-archival).
//
// CLI:
//   node epic_close.mjs <epic>
//
// When every declared slice of <epic> is covered by a CLOSED child — committed,
// or superseded by work that made the slice unnecessary — and the
// epic is not already closed, archives the live discovery bundle into
// docs/archive/<UTC-date>/<epic>/ (by delegating to the shipped archive.sh — git
// mv for tracked files) and merges closed:true + closed_at into the gitignored
// epic state file. It NEVER creates a commit: the commit skill's last-child fold
// lets the staged move ride that commit, and the standalone recovery path asks
// the maintainer to /grant-commit then /commit. `approved` is never written; the
// state file is retained.
//
// Completion is gated on slices[] coverage, not on the registered-children set:
// children register lazily (one per epic-child /triage), so an "all registered
// children closed" test fires on the FIRST slice and closes the epic
// prematurely. A slice is covered only when it has a closed child. Legacy
// epics that carry no slices[] fall back to the registered-children gate.
//
// Exit codes:
//   0  acted, or a clean no-op (absent epic / in flight / already closed)
//   1  archive.sh refused (e.g. archive target already exists) — nothing closed
//   2  bad invocation (missing slug) or unparseable epic state JSON

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARCHIVE_SCRIPT = path.join(HERE, '..', 'archive', 'archive.sh');

/**
 * A slice is finished when it landed OR when something else made it unnecessary.
 *
 * Counting only `committed` left a superseded slice open forever, which kept its
 * whole epic open and hid every genuinely open row behind it. Superseded work is
 * a decision that was made and recorded, not work still waiting.
 */
export const CLOSED_STATUSES = Object.freeze(['committed', 'superseded']);

export function isClosed(status) {
  return typeof status === 'string' && CLOSED_STATUSES.includes(status);
}

/**
 * Register a batch of slices as closed children, so a power batch can close its
 * epic the way a chain of epic-children does.
 *
 * An epic-child flips exactly one child on its way to a commit. A power batch
 * lands every slice in one cycle and has no per-slice commit to hang that flip
 * on, so without this the epic keeps zero registered children forever while its
 * roadmap rows read done.
 *
 * Two things it will not do. It never overwrites a slice that is already closed:
 * a superseded slice carries the reason it closed, and restamping it `committed`
 * would claim a commit that never happened. And it refuses a slice the epic never
 * declared, because registering one would close an epic against work outside its
 * own plan — the mis-close this epic's record already suffered once.
 */
export function registerClosedChildren({ rootDir, epic, slices }) {
  if (typeof epic !== 'string' || !/^[A-Za-z0-9_-]+$/.test(epic)) {
    return { ok: false, registered: [], reason: `invalid epic slug: ${JSON.stringify(epic)}` };
  }
  const wanted = Array.isArray(slices) ? slices.filter(Boolean) : [];
  if (wanted.length === 0) return { ok: false, registered: [], reason: 'no slices given to register' };

  const statePath = epicStatePath(rootDir || resolveRoot(), epic);
  let state;
  try {
    state = readState(statePath);
  } catch (err) {
    return { ok: false, registered: [], reason: `epic ${epic}: state unreadable at ${statePath} (${err.message})` };
  }

  const declared = new Set((Array.isArray(state.slices) ? state.slices : []).map((sl) => sl.id));
  const undeclared = wanted.filter((id) => !declared.has(id));
  if (undeclared.length > 0) {
    return {
      ok: false,
      registered: [],
      reason: `epic ${epic} does not declare slice(s): ${undeclared.sort().join(', ')}`,
    };
  }

  const children = Array.isArray(state.children) ? state.children.map((c) => ({ ...c })) : [];
  const registered = [];
  for (const id of wanted) {
    const existing = children.find((c) => c.slice === id);
    if (existing && isClosed(existing.status)) continue;
    if (existing) existing.status = 'committed';
    else children.push({ slice: id, status: 'committed' });
    registered.push(id);
  }

  if (registered.length === 0) return { ok: true, registered: [], reason: null };

  const now = Math.floor(Date.now() / 1000);
  fs.writeFileSync(statePath, JSON.stringify({ ...state, children, updated_at: now }, null, 2) + '\n');
  return { ok: true, registered, reason: null };
}

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
  return children.filter((c) => !isClosed(c.status));
}

function committedSliceIds(state) {
  const children = Array.isArray(state.children) ? state.children : [];
  return new Set(children.filter((c) => isClosed(c.status)).map((c) => c.slice));
}

function uncoveredSlices(state) {
  const slices = Array.isArray(state.slices) ? state.slices : [];
  const committed = committedSliceIds(state);
  return slices.filter((s) => !committed.has(s.id));
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

  // Completion is gated on slices[] coverage, not on the registered-children
  // set: children register lazily (one per epic-child /triage), so an
  // all-registered-children-committed test fires on the FIRST slice and closes
  // the epic prematurely. A slice is covered only when it has a committed child.
  const slices = Array.isArray(state.slices) ? state.slices : [];
  if (slices.length > 0) {
    const uncovered = uncoveredSlices(state);
    if (uncovered.length > 0) {
      console.log(
        `epic-close: epic ${epic} still in flight: ${uncovered.length} of ${slices.length} slices uncommitted`,
      );
      return 0;
    }
  } else {
    // Legacy / no-slice epics carry no authoritative slice set; fall back to
    // the registered-children gate.
    const children = Array.isArray(state.children) ? state.children : [];
    const open = openChildren(state);
    if (children.length === 0 || open.length > 0) {
      console.log(
        `epic-close: epic ${epic} still in flight: ${open.length} of ${children.length} children open`,
      );
      return 0;
    }
  }

  try {
    closeEpic(root, epic, statePath, state);
  } catch (e) {
    console.error(`epic-close: archive refused for ${epic}: ${e.message}`);
    return 1;
  }
  return 0;
}

// Guarded so CLOSED_STATUSES and isClosed can be imported without the CLI running
// and exiting the importing process.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.exit(main(process.argv));
}
