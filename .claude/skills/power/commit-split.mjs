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

function isClosurePath(path) {
  return path.endsWith('workflow.json') || path.endsWith('backlog.md');
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
