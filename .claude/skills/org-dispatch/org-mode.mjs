// Foundation: the org-team charter's decision helpers (graduated from sprint-mode.mjs).
// Org mode is opt-in and OFF by default. Unlike the sprint sandbox, a peer DECIDES its
// own in-lane implementation choices in its own main context (Article X); only
// cross-lane or un-decidable forks escalate. These pure helpers carry that distinction.

export function isOrgModeEnabled(project) {
  return project?.velocity?.org_mode?.enabled === true;
}

// Preflight: org-dispatch refuses unless org mode is on AND the tree is a git repo
// (worktree isolation requires git). Returns a named reason so the refusal is legible.
export function orgDispatchGate({ project, isGitRepo }) {
  if (!isOrgModeEnabled(project)) {
    return { ok: false, reason: 'org mode is OFF (velocity.org_mode.enabled); refusing' };
  }
  if (!isGitRepo) {
    return { ok: false, reason: 'org mode requires git (worktree isolation); refusing' };
  }
  return { ok: true };
}

// Decompose a spec's lanes into claim-any channel tasks. A lane carries a domain tag
// the claiming peer inherits (its in-lane decision latitude), the write_set it owns,
// and its dependency edges — no peer is pre-assigned (the pod is flat).
export function toLaneTasks(lanes) {
  return lanes.map((lane) => {
    if (!lane.id || !lane.lane) throw new Error(`lane missing id/lane: ${JSON.stringify(lane)}`);
    return {
      id: lane.id,
      lane: lane.lane,
      write_set: Array.isArray(lane.write_set) ? lane.write_set : [],
      depends_on: Array.isArray(lane.depends_on) ? lane.depends_on : [],
    };
  });
}

// The charter's load-bearing rule: an in-lane implementation choice is the peer's to
// decide; a cross-lane or un-decidable (design/scope/abstraction) fork escalates to
// the lead (who may escalate to the human). Anything not explicitly in-lane escalates.
export function classifyFork(fork) {
  return fork?.scope === 'in-lane-impl' ? 'decide' : 'escalate';
}

// ─── entry point (spec dispatcher-sweep, Pattern B) ───
//
// The inline block this replaces was the longest in the sweep: it read
// project.json, shelled out to detect a git repo, and only then called the gate.
// All three of those are the gathering the gate's own front door should own — and
// the SOP reader had to get the git detection right by hand every time.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const USAGE = `usage: node .claude/skills/org-dispatch/org-mode.mjs gate [--root <dir>]

subcommands:
  gate    whether org mode may dispatch here, and why not when it may not

flags:
  --root <dir>  project root (default: cwd)
  --json        emit machine-readable output
`;

function readProject(root) {
  try {
    return JSON.parse(readFileSync(join(root, '.claude', 'project.json'), 'utf8'));
  } catch {
    // An unreadable config is an un-opted-in project, never an exception: org mode
    // is off by default, so "cannot read the flag" and "the flag is false" are the
    // same answer.
    return {};
  }
}

function isGitRepo(root) {
  return spawnSync('git', ['-C', root, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' }).status === 0;
}

function main(argv) {
  const subcommand = argv[0];
  if (!subcommand || subcommand === '--help') { process.stdout.write(USAGE); return 0; }
  if (subcommand !== 'gate') { process.stderr.write(`unknown subcommand \`${subcommand}\`\n\n${USAGE}`); return 1; }

  const rootIndex = argv.indexOf('--root');
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd();
  const verdict = orgDispatchGate({ project: readProject(root), isGitRepo: isGitRepo(root) });

  if (argv.includes('--json')) { process.stdout.write(JSON.stringify(verdict, null, 2) + '\n'); return 0; }
  process.stdout.write(`${verdict.allowed ? 'allowed' : 'refused'}${verdict.reason ? `: ${verdict.reason}` : ''}\n`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
