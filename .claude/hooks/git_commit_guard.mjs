#!/usr/bin/env node
// Git Commit Guard — PreToolUse(Bash) and PreToolUse(Write|Edit|MultiEdit)
//
// JS port of git_commit_guard.sh, adding branch-aware consent policy:
//
//   1. Bash matcher — branch-aware:
//        - `git push` is no longer in FORBIDDEN_RE (was an unconditional
//          hard-block; now policy-driven).
//        - `git commit` and `git push` both consult `git rev-parse
//          --abbrev-ref HEAD`. Detached HEAD ("HEAD") → DENY explicitly.
//        - On a branch matched by project.json → git.protected_branches
//          (or when that key is null/absent → every branch protected),
//          commits require fresh commit_consent (900s) and pushes require
//          fresh push_consent (300s).
//        - When git.branch_pattern is set and the current branch does NOT
//          match the regex, commits are denied with the pattern surfaced.
//        - On a non-protected branch, commits and pushes proceed without
//          consent.
//
//   2. Write matcher — unchanged behavior plus an arm for push_consent:
//        - Blocks Claude from writing the marker files (commit/push_consent_grant).
//        - Gates writes to commit_consent on a fresh commit-consent marker.
//        - Gates writes to push_consent on a fresh push-consent marker.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import {
  readPayload,
  payloadGet,
  projectGet,
  emitBlock,
  emitAllow,
  logLine,
  canonicalRel,
  canonicalSlug,
  validateConsentMarker,
  blockMarkerSelfWrite,
  matchAnyGlob,
  gitSubcommandInvoked,
  gitSegments,
  resolveWorkflowModel,
  isPrimaryWorkTree,
  CLAUDE_PROJECT_ROOT,
  STATE_DIR,
  CONSENT_MARKER_COMMIT,
  CONSENT_MARKER_COMMIT_REL,
  CONSENT_MARKER_PUSH,
  CONSENT_MARKER_PUSH_REL,
} from './lib/common.mjs';
import { evaluateClosure } from './lib/closure-check.mjs';

const HOOK = 'git_commit_guard';

// Hard-blocks that apply regardless of consent or branch.
// NOTE: `git push` was previously included; removed in the branch-aware
// policy. The remaining ops are still flat-out forbidden because they
// rewrite history, skip safety, or sweep paths.
const FORBIDDEN_RE = new RegExp(
  '(' +
    '\\bgit\\s+commit\\b[^|&;]*--amend' +
    '|--no-verify' +
    '|--no-gpg-sign' +
    '|\\bgit\\s+reset\\s+--hard\\b' +
    '|\\bgit\\s+clean\\s+-[a-zA-Z]*f\\b' +
    '|\\bgit\\s+checkout\\s+--\\s' +
    '|\\bgit\\s+branch\\s+-D\\b' +
    '|\\bgit\\s+config\\b' +
    '|\\bgit\\s+rebase\\s+-i\\b' +
    '|\\bgit\\s+add\\s+-i\\b' +
    '|\\bgit\\s+add\\s+(-A|\\.)(?![A-Za-z0-9_/.\\-])' +
  ')'
);

function currentBranch() {
  try {
    const out = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd: CLAUDE_PROJECT_ROOT });
    return out.trim();
  } catch {
    return null;
  }
}

function isInsideWorkTree() {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore', cwd: CLAUDE_PROJECT_ROOT });
    return true;
  } catch {
    return false;
  }
}

// Returns: { protected: bool, patternViolation: string|null, detached: bool, branch: string|null }
function branchPolicy() {
  const branch = currentBranch();
  if (branch === null) return { protected: false, patternViolation: null, detached: false, branch: null, notGit: true };
  if (branch === 'HEAD') return { protected: false, patternViolation: null, detached: true, branch, notGit: false };

  // protected_branches: null/absent → every branch protected; else glob match.
  const globs = projectGet('.git.protected_branches');
  let isProtected;
  if (globs == null) {
    isProtected = true;
  } else if (Array.isArray(globs)) {
    isProtected = matchAnyGlob(branch, globs);
  } else {
    isProtected = true; // invalid type → fail-safe to protected
  }

  // branch_pattern: null/absent → no check; string → must match.
  const pattern = projectGet('.git.branch_pattern');
  let patternViolation = null;
  if (typeof pattern === 'string' && pattern.length > 0) {
    try {
      if (!new RegExp(pattern).test(branch)) patternViolation = pattern;
    } catch {
      // invalid regex → treat as no pattern, warn via log
      logLine(HOOK, `WARN invalid git.branch_pattern regex: ${pattern}`);
    }
  }

  return { protected: isProtected, patternViolation, detached: false, branch, notGit: false };
}

// Topology policy: does the current branch contradict the declared workflow
// model? Pure decision returning { block, reason, remediation }. `ask` and a
// non-primary (linked) worktree both yield a non-blocking result. A non-blocking
// result FALLS THROUGH in handleBash to the existing branch/consent policy —
// topology composes with consent, it does not replace it.
function topologyDecision({ model, branch, releaseBranches, isPrimary }) {
  if (model === 'ask' || !isPrimary) {
    return { block: false, reason: null, remediation: null };
  }
  const releaseSet = (Array.isArray(releaseBranches) && releaseBranches.length) ? releaseBranches : ['main'];
  const inRelease = matchAnyGlob(branch, releaseSet);
  if (model === 'direct-to-main') {
    if (inRelease) return { block: false, reason: null, remediation: null };
    return {
      block: true,
      reason: 'commit belongs on a release branch under the direct-to-main model',
      remediation: `git checkout ${releaseSet[0]} && git merge --ff-only ${branch}`,
    };
  }
  if (model === 'github-flow') {
    if (inRelease) {
      return {
        block: true,
        reason: 'github-flow: commits do not belong on the release branch — create a feature branch first',
        remediation: 'git checkout -b <feature-branch>',
      };
    }
    return { block: false, reason: null, remediation: null };
  }
  return { block: false, reason: null, remediation: null };
}

function validateConsentToken(file, ttlKey, defaultTtl, gateLabel, cmdHint) {
  let ttl = projectGet(ttlKey);
  if (typeof ttl !== 'number' || !Number.isFinite(ttl)) ttl = defaultTtl;
  if (!existsSync(file)) {
    logLine(HOOK, `BLOCKED no consent file: ${file}`);
    emitBlock(`${gateLabel}: no consent granted. The user must run \`${cmdHint}\` before a ${cmdHint.includes('push') ? 'push' : 'commit'} is allowed. Consent is valid for ${ttl}s.`);
  }
  let grantedAt;
  try {
    grantedAt = readFileSync(file, 'utf8').split(/\r?\n/)[0].trim();
  } catch {
    grantedAt = '';
  }
  if (!/^\d+$/.test(grantedAt)) {
    logLine(HOOK, `BLOCKED malformed consent file: ${file}`);
    emitBlock(`${gateLabel}: consent file is malformed. Ask the user to re-run \`${cmdHint}\`.`);
  }
  const now = Math.floor(Date.now() / 1000);
  const age = now - parseInt(grantedAt, 10);
  if (age > ttl) {
    logLine(HOOK, `BLOCKED consent expired age=${age}s ttl=${ttl}s file=${file}`);
    emitBlock(`${gateLabel}: consent expired (${age}s old, TTL ${ttl}s). Ask the user to re-run \`${cmdHint}\`.`);
  }
  logLine(HOOK, `ALLOWED age=${age}s file=${file}`);
}

function gitCapture(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], cwd: CLAUDE_PROJECT_ROOT });
  } catch {
    return null;
  }
}

// Read the staged index (never the message — spec D2) and decide whether this
// commit's closure obligation is satisfied. Pure logic lives in closure-check.
function stagedClosureDecision() {
  const names = gitCapture(['diff', '--cached', '--name-only']);
  if (names === null) return { block: false, unsatisfied: [], reason: null };
  const stagedPaths = names.split('\n').map((s) => s.trim()).filter(Boolean);
  const readStaged = (path) => gitCapture(['show', `:${path}`]);
  return evaluateClosure({ stagedPaths, readStaged });
}

function handleBash(cmd) {
  if (!cmd) emitAllow();

  // Classify by ACTUAL git invocation segments, not naive substring (Q-003).
  // A command that merely mentions "git commit" in a grep pattern, an echo, or
  // a quoted string has no git segment and is allowed through here.
  const segs = gitSegments(cmd);
  if (segs.length === 0) emitAllow();

  // Hard-blocks — checked only WITHIN actual git segments so a forbidden flag
  // appearing in an unrelated command or a string can't false-trip. Push is
  // NOT in this set anymore.
  if (segs.some((seg) => FORBIDDEN_RE.test(seg))) {
    logLine(HOOK, `BLOCKED forbidden git op: ${cmd}`);
    emitBlock('Git Commit Guard: forbidden git operation detected. seed.md forbids `git commit --amend`, `--no-verify`, `--no-gpg-sign`, `git reset --hard`, `git clean -f`, `git checkout -- `, `git branch -D`, `git config`, `git rebase -i`, `git add -i`, `git add -A|.` regardless of consent or branch. Ask the user to approve by stating the exact command.');
  }

  const isCommit = gitSubcommandInvoked(cmd, 'commit');
  const isPush = gitSubcommandInvoked(cmd, 'push');
  if (!isCommit && !isPush) emitAllow();

  // Article VII applicability: gate operations require git.
  if (!isInsideWorkTree()) {
    logLine(HOOK, `ALLOWED not-a-git-repo cmd=${cmd}`);
    emitAllow();
  }

  // Closure obligation (precedes consent/branch): a commit that stages a closing
  // workflow.json (non-empty source_backlog_keys) MUST stage backlog.md with each
  // key stamped picked-up + superseded-at, in this same commit. Index-only.
  if (isCommit) {
    const closure = stagedClosureDecision();
    if (closure.block) {
      logLine(HOOK, `BLOCKED closure obligation keys=[${closure.unsatisfied.join(',')}]`);
      emitBlock(`Git Commit Guard: ${closure.reason}. The closing commit must stage \`.claude/memory/backlog.md\` with each \`source_backlog_keys\` entry stamped \`picked-up\` + \`superseded-at\` in the SAME commit (no split). \`/commit\` stamps pre-stage.`);
    }
  }

  const policy = branchPolicy();
  if (policy.detached) {
    logLine(HOOK, `BLOCKED detached HEAD cmd=${cmd}`);
    emitBlock(`Git Commit Guard: detached HEAD. Check out a branch first. Branch-aware policy needs a named branch to evaluate \`git.protected_branches\` and \`git.branch_pattern\`.`);
  }

  // Topology enforcement (declared git.workflow_model) — after the detached
  // deny, before the consent/pattern checks. Only commits carry a topology
  // obligation; a PASS falls through so consent/pattern still apply.
  if (isCommit) {
    const model = resolveWorkflowModel(projectGet('.git.workflow_model'));
    if (model !== 'ask') {
      const decision = topologyDecision({
        model,
        branch: policy.branch,
        releaseBranches: projectGet('.git.release_branches'),
        isPrimary: isPrimaryWorkTree(),
      });
      if (decision.block) {
        logLine(HOOK, `BLOCKED topology model=${model} branch=${policy.branch}`);
        emitBlock(`Git Commit Guard: ${decision.reason}. Remediation: ${decision.remediation}`);
      }
      logLine(HOOK, `ALLOWED topology PASS model=${model} branch=${policy.branch}`);
    }
  }

  if (isCommit && policy.patternViolation) {
    logLine(HOOK, `BLOCKED branch_pattern violation branch=${policy.branch} pattern=${policy.patternViolation}`);
    emitBlock(`Git Commit Guard: branch '${policy.branch}' does not match \`git.branch_pattern\` (\`${policy.patternViolation}\`). Rename the branch to conform, or set \`git.branch_pattern\` to null in project.json to disable naming enforcement.`);
  }

  if (!policy.protected) {
    logLine(HOOK, `ALLOWED unprotected-branch branch=${policy.branch} cmd=${cmd}`);
    emitAllow();
  }

  // Protected — require the matching consent token.
  if (isCommit) {
    validateConsentToken(`${STATE_DIR}/commit_consent`, '.consent.commit_ttl_seconds', 900, 'Git Commit Guard', '/grant-commit');
  } else {
    validateConsentToken(`${STATE_DIR}/push_consent`, '.consent.push_ttl_seconds', 300, 'Git Commit Guard', '/grant-push');
  }
  emitAllow();
}

function handleWrite(payload) {
  const filePath = payloadGet(payload, '.tool_input.file_path');
  if (!filePath) emitAllow();
  const rel = canonicalRel(filePath);
  if (!rel) emitAllow();

  // Block self-write of the commit / push markers (Claude can never forge them).
  blockMarkerSelfWrite(rel, CONSENT_MARKER_COMMIT_REL, 'Git Commit Guard', '/grant-commit');
  blockMarkerSelfWrite(rel, CONSENT_MARKER_PUSH_REL, 'Git Commit Guard', '/grant-push');

  // Gate writes to the consent state files on a fresh marker.
  if (rel === '.claude/state/commit_consent') {
    validateConsentMarker(CONSENT_MARKER_COMMIT, 'Git Commit Guard', '/grant-commit');
  } else if (rel === '.claude/state/push_consent') {
    validateConsentMarker(CONSENT_MARKER_PUSH, 'Git Commit Guard', '/grant-push');
  }
  emitAllow();
}

async function main() {
  const payload = await readPayload();
  const tool = payloadGet(payload, '.tool_name');
  if (tool === 'Bash') {
    const cmd = payloadGet(payload, '.tool_input.command');
    handleBash(cmd);
  } else if (tool === 'Write' || tool === 'Edit' || tool === 'MultiEdit') {
    handleWrite(payload);
  } else {
    emitAllow();
  }
}

main().catch((err) => {
  logLine(HOOK, `ERROR ${err && err.message ? err.message : String(err)}`);
  emitAllow();
});
