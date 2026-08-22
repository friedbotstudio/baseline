// Foundation: resolve the coordination channel's state root.
//
// Every peer in a repository must reach ONE store, or they coordinate over separate
// files and never see each other — silently, because each store looks healthy. The
// old derivation used `process.cwd()`, which answers differently in every linked
// worktree, so a swarm worker and its lead were already split.
//
// `git rev-parse --git-common-dir` names the primary tree's `.git` from anywhere in
// the repository — that is the one directory every worktree agrees on. Its parent is
// the primary tree, and the store hangs off that.
//
// There is deliberately NO environment override. `CLAUDE_PROJECT_DIR` names the tree
// the session runs in, which for a swarm worker IS the linked worktree; honouring it
// would reinstate the split this module exists to remove. Compare `sock-path.mjs`,
// which does honour an override because its rendezvous lives outside every clone.
//
// Failure is loud. A private fallback store is the failure mode being removed, so a
// caller that cannot resolve gets a named error instead of a plausible wrong answer.
// node stdlib only — this file stays SDK-free like the rest of lib/.

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

const SPRINT_SEGMENTS = ['.claude', 'state', 'sprint'];

export class StateRootError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'StateRootError';
  }
}

const isUnder = (child, parent) => child === parent || child.startsWith(parent + sep);

/**
 * The pure half: turn git's answer into a state root, or refuse it.
 *
 * The checks below sanity-check an answer git itself produced; they are not a trust
 * boundary against a hostile filesystem. What they do catch is the case that matters
 * in practice — a `.git` gitdir pointer, which is repository-controlled content,
 * naming somewhere that is not this repository's common directory.
 *
 * @param {{gitCommonDir: string, cwd: string}} input
 * @returns {string} absolute path to the channel state root
 */
export function deriveStateRoot({ gitCommonDir, cwd } = {}) {
  return join(derivePrimaryTree({ gitCommonDir, cwd }), ...SPRINT_SEGMENTS);
}

/**
 * The primary working tree the store hangs off. Callers that need the project
 * directory itself take it from here rather than walking back up the store path.
 *
 * @param {{gitCommonDir: string, cwd: string}} input
 * @returns {string} absolute path to the primary working tree
 */
export function derivePrimaryTree({ gitCommonDir, cwd } = {}) {
  if (typeof gitCommonDir !== 'string' || gitCommonDir.trim() === '') {
    throw new StateRootError('cannot resolve state root: git named no common directory');
  }
  if (typeof cwd !== 'string' || cwd.trim() === '') {
    throw new StateRootError('cannot resolve state root: no working directory given');
  }

  const answer = gitCommonDir.trim();
  const commonDir = isAbsolute(answer) ? answer : resolve(cwd, answer);

  if (basename(commonDir) !== '.git') {
    throw new StateRootError(`cannot resolve state root: common directory is not a .git directory (${commonDir})`);
  }
  if (!existsSync(commonDir) || !statSync(commonDir).isDirectory()) {
    throw new StateRootError(`cannot resolve state root: common directory does not exist (${commonDir})`);
  }

  const primary = dirname(commonDir);
  if (primary === commonDir || primary === sep) {
    throw new StateRootError(`cannot resolve state root: common directory has no working tree (${commonDir})`);
  }

  // An ordinary checkout sits inside its primary tree. A linked worktree does not —
  // it is a sibling — so the tree that hosts it must say so by carrying `worktrees/`.
  // Anything else means cwd does not belong to this common directory.
  if (!isUnder(resolve(cwd), primary) && !existsSync(join(commonDir, 'worktrees'))) {
    throw new StateRootError(
      `cannot resolve state root: ${cwd} lies outside the repository at ${primary}`,
    );
  }

  return primary;
}

/**
 * Ask git where the repository's common directory is, then derive the store from it.
 *
 * @param {{cwd?: string}} [input]
 * @returns {string} absolute path to the channel state root
 */
export function resolveStateRoot({ cwd = process.cwd() } = {}) {
  return join(resolvePrimaryTree({ cwd }), ...SPRINT_SEGMENTS);
}

/**
 * Ask git for the repository's common directory, then name its working tree.
 *
 * @param {{cwd?: string}} [input]
 * @returns {string} absolute path to the primary working tree
 */
export function resolvePrimaryTree({ cwd = process.cwd() } = {}) {
  let answer;
  try {
    answer = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    throw new StateRootError(`cannot resolve state root: ${cwd} is not inside a git repository`, { cause });
  }
  return derivePrimaryTree({ gitCommonDir: answer, cwd });
}
