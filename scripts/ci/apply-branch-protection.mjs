#!/usr/bin/env node
// Config-as-code branch-protection applier (baseline CI posture, AC-010).
//
// Reads .github/branch-protection/<branch>.json, subset-asserts its required
// status-check contexts against the check runs observed GREEN on the live
// branch head (typo/drift protection: you cannot require a check that never
// runs), then PUTs the config via `gh api`. Maintainer-invoked; never run by
// Claude Code automation.
//
// Usage: node scripts/ci/apply-branch-protection.mjs [config-path] [--dry-run]
//        default config-path: .github/branch-protection/main.json
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PLACEHOLDER_MARKER = 'REPLACE-WITH-YOUR-CI-CHECK-CONTEXT';

export function validateConfig(config) {
  const contexts = config?.required_status_checks?.contexts;
  if (!Array.isArray(contexts) || contexts.length === 0) {
    throw new Error('config must declare a non-empty required_status_checks.contexts array');
  }
  const placeholders = contexts.filter((c) => typeof c === 'string' && c.includes(PLACEHOLDER_MARKER));
  if (placeholders.length > 0) {
    throw new Error(
      `refusing to apply a fill-in template: contexts still contain ${PLACEHOLDER_MARKER}. ` +
      'Replace the placeholder with your CI check name(s) first.',
    );
  }
  return config;
}

export function assertContextsSubset(requiredContexts, observedGreenContexts) {
  const observed = new Set(observedGreenContexts);
  const missing = requiredContexts.filter((c) => !observed.has(c));
  if (missing.length > 0) {
    throw new Error(
      `required context(s) not observed green on the branch head: ${missing.join(', ')}. ` +
      'Applying would make the branch unmergeable — fix the context name or get the check green first.',
    );
  }
}

function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', ...opts });
}

function resolveRepo() {
  return JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
}

function fetchGreenContexts(repo, branch) {
  const res = JSON.parse(gh(['api', `repos/${repo}/commits/${branch}/check-runs`]));
  return (res.check_runs ?? [])
    .filter((run) => run.conclusion === 'success')
    .map((run) => run.name);
}

function applyProtection(repo, branch, config) {
  gh(
    ['api', '-X', 'PUT', `repos/${repo}/branches/${branch}/protection`, '--input', '-'],
    { input: JSON.stringify(config) },
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const configPath = args.find((a) => !a.startsWith('--')) ?? '.github/branch-protection/main.json';
  const branch = basename(configPath).replace(/\.json$/, '');

  const config = validateConfig(JSON.parse(readFileSync(configPath, 'utf8')));
  const repo = resolveRepo();
  const green = fetchGreenContexts(repo, branch);
  assertContextsSubset(config.required_status_checks.contexts, green);

  if (dryRun) {
    process.stdout.write(`dry-run: would apply ${configPath} to ${repo}@${branch} (contexts green: ${config.required_status_checks.contexts.join(', ')})\n`);
    return;
  }
  applyProtection(repo, branch, config);
  process.stdout.write(`applied ${configPath} to ${repo}@${branch}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
