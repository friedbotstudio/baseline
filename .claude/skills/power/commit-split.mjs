// commit-split.mjs — Foundation: plan an ordered series of Conventional Commits from a
// dirty working tree, for the power track's amortized commit phase. Composes on
// commit-planner's groupDirtyTree (reuse, not reimplement) for the single-concern
// grouping, and adds only the power-specific concern: order the groups
// build/config -> implementation -> tests -> docs, with the closing workflow.json +
// backlog stamp on the FINAL commit (the closure-atomicity guard in git_commit_guard
// hard-blocks a closure split across commits, so it must land last).

import { groupDirtyTree } from '../commit-planner/inventory.mjs';

// groupDirtyTree emits type ∈ {src, test, docs, chore}. Map each to an ordering rank and
// a Conventional-Commit type. `src` is the mechanical placeholder for a code change; main
// context refines it to feat/fix at commit time.
const TYPE_MAP = {
  chore: { rank: 0, conventional: 'chore' }, // config/build (json/yaml/toml, root chores)
  src: { rank: 1, conventional: 'feat' },    // implementation — refine to feat/fix in main context
  test: { rank: 2, conventional: 'test' },
  docs: { rank: 3, conventional: 'docs' },
};

// A sharded backlog entry is `.claude/memory/backlog/<slug>.md`, which does NOT
// end with `backlog.md` — matching only the flat name let a closure shard be
// grouped as ordinary work and lose its last position, which git_commit_guard then
// hard-blocks (it forbids a closure split across commits).
// Anchored, not substring: repo paths are root-relative, so a path that merely
// CONTAINS the fragment (an archived bundle, a doc whose name embeds it) is not a
// closure entry and must not be reordered into the closure commit.
// Security review 2026-07-20, CWE-625.
function isClosurePath(path) {
  return path.endsWith('workflow.json')
    || path === '.claude/memory/backlog.md'
    || path.startsWith('.claude/memory/backlog/');
}

// planCommits(entries): `entries` is the dirty-tree array [{path, status}] — the same
// input commit-planner/inventory.mjs consumes. Returns an ordered list of commit groups
// (each {type, scope, paths, isClosure, subject}), closure last.
export function planCommits(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const closure = list.filter((e) => isClosurePath(e.path));
  const work = list.filter((e) => !isClosurePath(e.path));

  const groups = groupDirtyTree(work);

  const commits = groups
    .slice()
    .sort((a, b) => (TYPE_MAP[a.type]?.rank ?? 9) - (TYPE_MAP[b.type]?.rank ?? 9))
    .map((g) => {
      const conventional = TYPE_MAP[g.type]?.conventional ?? 'chore';
      const scope = g.scope || 'core';
      const n = g.paths.length;
      return {
        type: conventional,
        scope,
        paths: g.paths,
        isClosure: false,
        subject: `${conventional}(${scope}): ${scope} changes (${n} file${n > 1 ? 's' : ''})`,
      };
    });

  if (closure.length > 0) {
    commits.push({
      type: 'chore',
      scope: 'workflow',
      paths: closure.map((e) => e.path),
      isClosure: true,
      subject: 'chore(workflow): close out workflow (stamp backlog + workflow.json)',
    });
  }
  return commits;
}

// ─── entry point (spec dispatcher-sweep, Pattern B) ───
//
// Replaces two inline call sites, not one: power/SKILL.md:42 and commit/SKILL.md:26
// carried the same `node -e` block, and the comment inside it — "entries =
// [{path,status}] parsed from `git status --porcelain`" — was an instruction to the
// reader to write the parser themselves. Two copies of an unwritten parser is the
// clearest case in the sweep for a front door.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const USAGE = `usage: node .claude/skills/power/commit-split.mjs plan [--root <dir>]

subcommands:
  plan    split the dirty tree into ordered Conventional Commits, closure last

flags:
  --root <dir>  project root (default: cwd)
  --json        emit machine-readable output
`;

function statusEntries(text) {
  const entries = [];
  for (const line of String(text || '').split('\n')) {
    if (!line.trim()) continue;
    const status = line.slice(0, 2).trim();
    let path = line.slice(3).trim();
    if (path.includes(' -> ')) path = path.split(' -> ').pop().trim();
    if (path) entries.push({ path, status });
  }
  return entries;
}

function main(argv) {
  const subcommand = argv[0];
  if (!subcommand || subcommand === '--help') { process.stdout.write(USAGE); return 0; }
  if (subcommand !== 'plan') { process.stderr.write(`unknown subcommand \`${subcommand}\`\n\n${USAGE}`); return 1; }

  const rootIndex = argv.indexOf('--root');
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd();
  const status = spawnSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' });
  if (status.status !== 0) { process.stderr.write(`git status failed: ${status.stderr ?? ''}\n`); return 1; }

  const plan = planCommits(statusEntries(status.stdout));
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify(plan, null, 2) + '\n'); return 0; }
  const commits = Array.isArray(plan) ? plan : (plan.commits ?? []);
  process.stdout.write(commits.length
    ? commits.map((c, i) => `${i + 1}. ${c.type ?? 'chore'}(${c.scope ?? '-'})  ${(c.paths ?? []).length} path(s)`).join('\n') + '\n'
    : '(clean tree — nothing to split)\n');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
