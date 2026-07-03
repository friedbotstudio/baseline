#!/usr/bin/env node
// branch_guard.mjs — PreToolUse(Edit|Write|MultiEdit)
//
// Blocks CREATION of .claude/state/workflow.json when the declared git model is
// PR-based (github-flow) and the current branch is a release branch — so a
// workflow cannot start on `main` under PR-to-main discipline (CLAUDE.md Art. IV
// work-start + Art. VII branch topology). It is an EARLY-WARNING at work-start;
// `git_commit_guard` is the enforcing backstop at commit time (and catches a
// Bash-driven write this hook does not see).
//
// Composes the topology primitives already single-sourced in lib/common.mjs
// (resolveWorkflowModel / matchAnyGlob / isPrimaryWorkTree / currentBranch) — no
// new abstraction, so the creation-gate cannot drift from the commit-gate.
//
// Fail-open on anything ambiguous: not-in-scope, not-a-creation (file exists),
// configured:false, non-github-flow model, linked worktree, non-git, detached
// HEAD, or any read error. It never bricks editing.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  readPayload,
  payloadGet,
  projectGet,
  emitAllow,
  emitBlock,
  logLine,
  canonicalRel,
  resolveWorkflowModel,
  matchAnyGlob,
  isPrimaryWorkTree,
  currentBranch,
  CLAUDE_PROJECT_ROOT,
} from './lib/common.mjs';

const HOOK = 'branch_guard';
const WORKFLOW_REL = '.claude/state/workflow.json';

// Pure decision. Every conjunct must hold to block; any false ⇒ allow.
// Exported for unit testing (see tests/branch-guard.test.mjs).
export function decide({ inScopeCreation, configured, model, isPrimary, branch, releaseBranches }) {
  if (!inScopeCreation) return { allow: true };
  if (!configured) return { allow: true };
  if (model !== 'github-flow') return { allow: true };
  if (!isPrimary) return { allow: true };
  if (branch === null || branch === undefined || branch === 'HEAD') return { allow: true };
  const release = Array.isArray(releaseBranches) && releaseBranches.length ? releaseBranches : ['main'];
  if (matchAnyGlob(branch, release)) {
    return {
      allow: false,
      message:
        `branch_guard: workflow start blocked — you are on release branch '${branch}' and git ` +
        `model 'github-flow' requires work on a feature branch (PR-to-main). Create one first: ` +
        `git switch -c <type>/<slug>  (e.g. chore/my-task), then re-run.`,
    };
  }
  return { allow: true };
}

async function main() {
  const payload = await readPayload();
  const filePath = payloadGet(payload, '.tool_input.file_path');
  if (!filePath) return emitAllow();

  const rel = canonicalRel(filePath);
  const inScopeCreation =
    rel === WORKFLOW_REL && !existsSync(join(CLAUDE_PROJECT_ROOT, WORKFLOW_REL));
  if (!inScopeCreation) return emitAllow();

  const branch = currentBranch();
  const d = decide({
    inScopeCreation: true,
    configured: projectGet('.configured') === true,
    model: resolveWorkflowModel(projectGet('.git.workflow_model')),
    isPrimary: isPrimaryWorkTree(),
    branch,
    releaseBranches: projectGet('.git.release_branches'),
  });

  if (d.allow) {
    logLine(HOOK, `ALLOW ${rel} branch=${branch}`);
    return emitAllow();
  }
  logLine(HOOK, `BLOCK ${rel} branch=${branch}`);
  return emitBlock(d.message);
}

// Run main() only when executed directly as a hook — not when the test imports
// decide(). Fail-open on any unexpected error so editing is never bricked.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => emitAllow());
}
