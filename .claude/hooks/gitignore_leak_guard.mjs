#!/usr/bin/env node
// gitignore_leak_guard — PreToolUse(Bash) hook. Enforces CLAUDE.md Article VII /
// the gitignore-setup spec: a `git commit` is hard-blocked when it stages a path
// that must be ignored, and a non-blocking advisory is surfaced for a latent gap
// (a baseline must-ignore path that exists in the tree but isn't ignored).
//
// Offline only — never touches the network. Composes with git_commit_guard on the
// same Bash boundary; both are independent denials. Fails CLOSED on an inspection
// error for an unambiguous commit; fails OPEN when the baseline data is absent.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  readPayload, payloadGet, projectGet, emitBlock, emitAllow, emitInfo, logLine,
  gitSubcommandInvoked, CLAUDE_PROJECT_ROOT, CLAUDE_DOTDIR,
} from './lib/common.mjs';

const HOOK = 'gitignore_leak_guard';
const DATA_PATH = join(CLAUDE_DOTDIR, 'skills/gitignore/baseline-ignores.json');

function loadEffectiveSet() {
  let patterns = [];
  try {
    const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
    patterns = (data.entries || []).map((e) => e.pattern).filter(Boolean);
  } catch {
    return null; // missing/unreadable baseline data -> caller fails OPEN
  }
  const extra = projectGet('.gitignore.extra_must_ignore');
  if (Array.isArray(extra)) patterns = patterns.concat(extra.filter((p) => typeof p === 'string' && p));
  return patterns;
}

// Does a repo-relative path fall under a must-ignore pattern (our set, not the
// repo's .gitignore — a missing rule is exactly the leak we catch).
function matchesPattern(path, pattern) {
  if (pattern.endsWith('/')) {
    const dir = pattern.slice(0, -1);
    return path === dir || path.startsWith(`${dir}/`);
  }
  if (pattern.includes('*')) {
    return globMatch(path, pattern) || globMatch(basename(path), pattern);
  }
  return path === pattern || basename(path) === pattern || path.endsWith(`/${pattern}`);
}

function globMatch(name, glob) {
  const re = new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
  return re.test(name);
}

function stagedPaths() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only'], {
    cwd: CLAUDE_PROJECT_ROOT, encoding: 'utf8',
  });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

// A concrete (non-glob) pattern that exists in the tree but git does not ignore.
function latentGaps(patterns) {
  const gaps = [];
  for (const p of patterns) {
    if (p.includes('*')) continue;
    const rel = p.endsWith('/') ? p.slice(0, -1) : p;
    if (!existsSync(join(CLAUDE_PROJECT_ROOT, rel))) continue;
    let ignored = false;
    try {
      execFileSync('git', ['check-ignore', '-q', rel], { cwd: CLAUDE_PROJECT_ROOT });
      ignored = true;
    } catch { ignored = false; }
    if (!ignored) gaps.push(p);
  }
  return gaps;
}

function handleCommit() {
  const patterns = loadEffectiveSet();
  if (patterns === null || patterns.length === 0) emitAllow(); // fail OPEN on missing data

  let staged;
  try {
    staged = stagedPaths();
  } catch (err) {
    // Inspection failed on an unambiguous commit -> fail CLOSED.
    logLine(HOOK, `BLOCKED inspection error: ${err && err.message ? err.message : String(err)}`);
    emitBlock('Gitignore Leak Guard: could not inspect staged paths for a git commit (git error). Failing closed to prevent an unverified leak. Run the commit inside a valid git work tree.');
  }

  const leaks = staged.filter((path) => patterns.some((p) => matchesPattern(path, p)));
  if (leaks.length) {
    logLine(HOOK, `BLOCKED staged must-ignore leak: ${leaks.join(', ')}`);
    emitBlock(`Gitignore Leak Guard: these staged paths must be ignored, not committed: ${leaks.join(', ')}. Remove them from the index (git rm --cached <path>) and ensure .gitignore covers them. Run the gitignore skill to repair .gitignore.`);
  }

  const gaps = latentGaps(patterns);
  if (gaps.length) {
    emitInfo(`Gitignore Leak Guard advisory: latent gap — these baseline must-ignore paths exist but are not ignored: ${gaps.join(', ')}. Not blocking this commit, but run the gitignore skill to add them to .gitignore.`);
  }
  emitAllow();
}

async function main() {
  const payload = await readPayload();
  if (payloadGet(payload, '.tool_name') !== 'Bash') emitAllow();
  const cmd = payloadGet(payload, '.tool_input.command');
  if (!cmd || !gitSubcommandInvoked(cmd, 'commit')) emitAllow();
  handleCommit();
}

main().catch((err) => {
  logLine(HOOK, `ERROR ${err && err.message ? err.message : String(err)}`);
  emitAllow();
});
