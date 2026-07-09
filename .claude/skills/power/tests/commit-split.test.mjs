// commit-split.test.mjs — the power commit phase groups the working tree into ordered
// Conventional Commits with the closing workflow.json+backlog stamp on the FINAL commit
// (closure-atomicity guard requires closure-last). Run:
//   node --test .claude/skills/power/tests/commit-split.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planCommits } from '../commit-split.mjs';

// Fixture: the dirty-tree shape [{path, status}] that commit-planner/inventory.mjs consumes.
const ENTRIES = [
  { path: '.claude/project.json', status: 'M' },
  { path: '.claude/hooks/lib/consent-decision.mjs', status: 'M' },
  { path: '.claude/hooks/tests/git_commit_guard_consent.test.mjs', status: 'M' },
  { path: 'docs/adr/0033-workflow-scoped-commit-consent.md', status: 'A' },
  { path: '.claude/state/workflow.json', status: 'M' },
  { path: '.claude/memory/backlog.md', status: 'M' },
];

describe('planCommits', () => {
  it('returns an ordered list of Conventional-Commit groups', () => {
    const groups = planCommits(ENTRIES);
    assert.ok(Array.isArray(groups) && groups.length >= 2);
    for (const g of groups) {
      assert.match(g.subject, /^(feat|fix|docs|test|build|chore|refactor)(\(.+\))?: /, `Conventional subject: ${g.subject}`);
      assert.ok(Array.isArray(g.paths) && g.paths.length > 0);
    }
  });

  it('places the closing workflow.json + backlog stamp on the FINAL commit', () => {
    const groups = planCommits(ENTRIES);
    const last = groups[groups.length - 1];
    assert.equal(last.isClosure, true, 'final group is the closure commit');
    const lastPaths = last.paths.join(' ');
    assert.match(lastPaths, /workflow\.json/);
    assert.match(lastPaths, /backlog\.md/);
    // no earlier group may carry the closing workflow.json (atomicity)
    for (let i = 0; i < groups.length - 1; i++) {
      assert.ok(!groups[i].paths.some((p) => p.endsWith('workflow.json')), 'closure not split into an earlier commit');
    }
  });

  it('orders config/build before implementation before docs', () => {
    const groups = planCommits(ENTRIES);
    const rankOf = (needle) => groups.findIndex((g) => g.paths.some((p) => p.includes(needle)));
    assert.ok(rankOf('project.json') <= rankOf('consent-decision.mjs'), 'config before impl');
    assert.ok(rankOf('consent-decision.mjs') <= rankOf('0033-'), 'impl before docs');
  });

  it('tolerates an empty or non-array input', () => {
    assert.deepEqual(planCommits([]), []);
    assert.deepEqual(planCommits(undefined), []);
  });
});
