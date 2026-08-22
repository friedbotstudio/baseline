// Domain: one git worktree per org peer.
//
// Article X lets up to four peer sessions work one repository at once. Sharing a
// checkout between them does not work: each peer's `git status` shows every other
// peer's half-finished edits as its own, and whoever commits first carries all of
// them. A worktree gives each peer its own working directory and its own branch
// off the same object store, which is what makes "in-lane" mean anything.
//
// Isolation is a gate rather than a nicety. When a worktree cannot be created the
// caller must stop, because the alternative — running the pod in the primary tree —
// is exactly the failure the worktree prevents. Every refusal therefore carries a
// reason and hands back no path, so a caller cannot accidentally use one.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// The same charset the channel's ids use. A peer id becomes a directory name and
// a branch name here, so `..` or a separator would reach outside both.
const SAFE_PEER_ID = /^[A-Za-z0-9_-]{1,128}$/;

const WORKTREE_PARENT = '.claude/state/org/worktrees';

const git = (cwd, args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

const refuse = (reason) => ({ ok: false, reason, path: null, branch: null });

/** Where a given peer's tree lives. Pure — it builds a path and touches nothing. */
export function peerWorktreePath({ rootDir, peer_id }) {
  return join(resolve(rootDir), WORKTREE_PARENT, peer_id);
}

function peerBranchName(peer_id) {
  return `org/${peer_id}`;
}

function isGitRepo(rootDir) {
  const r = git(rootDir, ['rev-parse', '--is-inside-work-tree']);
  return r.status === 0 && r.stdout.trim() === 'true';
}

/**
 * Give a peer its own tree, or refuse and say why.
 *
 * Re-running for a peer that already has one returns the same path rather than
 * failing: a dispatch that resumes must not have to tear down live work first.
 */
export function createPeerWorktree({ rootDir, peer_id }) {
  if (typeof peer_id !== 'string' || !SAFE_PEER_ID.test(peer_id)) {
    return refuse(`invalid peer_id: ${JSON.stringify(peer_id)} (expected [A-Za-z0-9_-])`);
  }
  if (typeof rootDir !== 'string' || !existsSync(rootDir)) {
    return refuse(`cannot isolate peer ${peer_id}: no directory at ${String(rootDir)}`);
  }
  if (!isGitRepo(rootDir)) {
    return refuse(`cannot isolate peer ${peer_id}: ${rootDir} is not a git repository, and worktree isolation requires git`);
  }

  const path = peerWorktreePath({ rootDir, peer_id });
  const branch = peerBranchName(peer_id);
  if (existsSync(path)) return { ok: true, path, branch, reused: true };

  // -B so a branch left behind by a previous pod is re-pointed at HEAD rather
  // than colliding. The worktree itself is the state that matters; a stale branch
  // ref is not worth a refusal.
  const add = git(rootDir, ['worktree', 'add', '-B', branch, path, 'HEAD']);
  if (add.status !== 0) {
    return refuse(`cannot isolate peer ${peer_id}: git worktree add failed: ${(add.stderr || '').trim()}`);
  }
  return { ok: true, path, branch, reused: false };
}

/**
 * Take a peer's tree away once its work has landed. Removing nothing is a
 * success, not an error — a pod that refused isolation still runs teardown.
 */
export function removePeerWorktree({ rootDir, peer_id }) {
  if (typeof peer_id !== 'string' || !SAFE_PEER_ID.test(peer_id)) {
    return { ok: false, removed: false, reason: `invalid peer_id: ${JSON.stringify(peer_id)}` };
  }
  const path = peerWorktreePath({ rootDir, peer_id });
  if (!existsSync(path)) return { ok: true, removed: false, reason: 'no worktree for this peer' };

  // --force because a peer's tree legitimately holds uncommitted work: the diff
  // has already been applied to the primary tree by the time we remove it, and
  // git would otherwise refuse on the dirty state we just landed.
  const rm = git(rootDir, ['worktree', 'remove', '--force', path]);
  if (rm.status !== 0) {
    return { ok: false, removed: false, reason: `git worktree remove failed: ${(rm.stderr || '').trim()}` };
  }
  return { ok: true, removed: true, reason: null };
}
