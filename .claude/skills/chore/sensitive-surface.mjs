#!/usr/bin/env node
// Does this chore's diff touch a security-sensitive surface?
//
// The rightsize-gate was deliberately built to NEVER skip security. The chore track
// quietly violated that principle: it has no security node and had no security
// trigger, so a chore touching `.claude/hooks/**` shipped with no security review BY
// CONSTRUCTION. This is the predicate that closes the gap.
//
// Advisory by contract: it fails safe to `false` and the CLI always exits 0. A
// helper that can block a commit is a helper that will eventually block the wrong one.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchAnyGlob } from '../../hooks/lib/common.mjs';

export function touchesSensitiveSurface(changedPaths, sensitiveGlobs) {
  if (!Array.isArray(changedPaths) || !Array.isArray(sensitiveGlobs)) return false;
  return changedPaths.some((path) => typeof path === 'string' && matchAnyGlob(path, sensitiveGlobs));
}

function matchedSensitivePaths(changedPaths, sensitiveGlobs) {
  if (!Array.isArray(changedPaths) || !Array.isArray(sensitiveGlobs)) return [];
  return changedPaths.filter((path) => typeof path === 'string' && matchAnyGlob(path, sensitiveGlobs));
}

// Never parse human-readable porcelain (D15c). `line.slice(3)` on `git status
// --porcelain` yields "docs/a.md -> .claude/hooks/injected.mjs" as ONE string for a
// rename, and keeps git's literal quotes around paths with spaces or non-ASCII.
// Neither matches a glob, so a chore that ADDS A HOOK by moving a file reported
// not-sensitive and skipped security review entirely — the exact gap this helper
// exists to close, defeated by a routine `git mv`.
//
// These two commands emit raw NUL-separated paths instead: no quoting, no rename
// ambiguity (`--name-only` gives the NEW path). Each is guarded independently — a
// repo with no commits has no HEAD, and that must not cost us the untracked files.
function gitPaths(repoRoot, args) {
  try {
    // stdio pipe: on a non-git dir git dumps its whole usage screen to stderr, and an
    // advisory helper has no business spraying that at the operator.
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0')
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function changedPathsFromGit(repoRoot = process.cwd()) {
  return [
    ...gitPaths(repoRoot, ['diff', '--name-only', '-z', 'HEAD']),
    ...gitPaths(repoRoot, ['ls-files', '-o', '--exclude-standard', '-z']),
  ];
}

function sensitiveGlobsFromProject() {
  const project = JSON.parse(readFileSync('.claude/project.json', 'utf8'));
  return project?.security?.sensitive_globs ?? [];
}

function main() {
  let matched = [];
  try {
    matched = matchedSensitivePaths(changedPathsFromGit(), sensitiveGlobsFromProject());
  } catch (e) {
    process.stderr.write(`sensitive-surface: probe failed, reporting not-sensitive: ${e.message}\n`);
  }
  process.stdout.write(JSON.stringify({ sensitive: matched.length > 0, matched }) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
