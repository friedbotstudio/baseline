// Epic 13 (baseline-mcp) Slice B — the channel state root is worktree-safe.
//
// Covers AC-001, AC-002, AC-003, AC-004 of docs/specs/baseline-mcp.md.
//
// The defect: both servers derived the state root from `process.cwd()`, so a session
// running in a linked worktree got its OWN `.claude/state/sprint`. Two peers in two
// worktrees of the same repository therefore coordinated over two different stores
// and never saw each other — silently, because each store looked perfectly healthy.
// `git rev-parse --git-common-dir` names the primary tree's `.git` from anywhere in
// the repository, so its parent is the one directory every worktree agrees on.
//
// Why there is no CLAUDE_PROJECT_DIR override: Claude Code sets that variable to the
// tree the session is running in, which in a swarm worker IS the linked worktree.
// Honouring it would reinstate the exact bug this slice removes.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPRINT_SEGMENTS = ['.claude', 'state', 'sprint'];

const { resolveStateRoot, deriveStateRoot, StateRootError } = await import(
  '../.claude/mcp/baseline/lib/root.mjs'
);

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function makeRepo() {
  // realpath: on macOS the tmpdir is a symlink, and git reports the resolved path.
  const dir = realpathSync(await mkdtemp(join(tmpdir(), 'baseline-root-')));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'user.name', 'Test');
  await writeFile(join(dir, 'seed.txt'), 'seed\n');
  git(dir, 'add', 'seed.txt');
  git(dir, 'commit', '-qm', 'seed');
  return dir;
}

describe('Slice B — the state root anchors on the primary tree', () => {
  it('test_when_cwd_is_a_linked_worktree_then_root_is_the_primary_trees_sprint_dir', async () => {
    // AC-001. The whole point: two trees, one store.
    const primary = await makeRepo();
    const linked = join(dirname(primary), `${primary.split(sep).pop()}-wt`);
    git(primary, 'worktree', 'add', '-q', linked, '-b', 'wt');

    const fromLinked = resolveStateRoot({ cwd: linked });
    const fromPrimary = resolveStateRoot({ cwd: primary });

    assert.equal(fromLinked, join(primary, ...SPRINT_SEGMENTS), 'a linked worktree must anchor on the primary tree');
    assert.equal(fromLinked, fromPrimary, 'both trees must resolve to the same store, or peers cannot see each other');
  });

  it('test_when_cwd_is_a_subdirectory_of_a_worktree_then_the_root_is_unchanged', async () => {
    // AC-001 boundary. A server started from a nested directory must not walk to a
    // different answer than one started at the tree root.
    const primary = await makeRepo();
    const linked = join(dirname(primary), `${primary.split(sep).pop()}-wt2`);
    git(primary, 'worktree', 'add', '-q', linked, '-b', 'wt2');
    const nested = join(linked, 'a', 'b');
    await mkdir(nested, { recursive: true });

    assert.equal(resolveStateRoot({ cwd: nested }), join(primary, ...SPRINT_SEGMENTS));
  });

  it('test_when_cwd_is_an_ordinary_checkout_then_the_path_equals_todays_path', async () => {
    // AC-003. The regression trap: the fix must be invisible to everyone not using
    // worktrees, or it trades one silent breakage for another.
    const repo = await makeRepo();
    const nested = join(repo, 'src', 'deep');
    await mkdir(nested, { recursive: true });

    assert.equal(resolveStateRoot({ cwd: repo }), join(repo, ...SPRINT_SEGMENTS));
    assert.equal(resolveStateRoot({ cwd: nested }), join(repo, ...SPRINT_SEGMENTS));
  });

  it('test_when_cwd_is_not_a_git_tree_then_it_throws_and_creates_nothing', async () => {
    // AC-002, first half. A private fallback store is the failure mode being removed,
    // so the absence of git must be loud rather than survivable.
    const plain = realpathSync(await mkdtemp(join(tmpdir(), 'baseline-root-plain-')));

    assert.throws(
      () => resolveStateRoot({ cwd: plain }),
      (err) => err instanceof StateRootError && /state root/i.test(err.message),
      'a non-git directory must raise the named error, never fall back to cwd',
    );
    assert.equal(existsSync(join(plain, ...SPRINT_SEGMENTS)), false, 'the failed call must leave no store behind');
  });

  it('test_when_the_git_answer_escapes_the_repository_then_it_throws', async () => {
    // AC-002, second half. `--git-common-dir` is answered by git, but a `.git` file
    // is repository-controlled content: a crafted gitdir pointer can name a directory
    // outside the tree, and the store would then be written somewhere nobody expects.
    const repo = await makeRepo();

    assert.throws(
      () => deriveStateRoot({ gitCommonDir: join(tmpdir(), 'elsewhere', '.git'), cwd: repo }),
      (err) => err instanceof StateRootError,
      'a common dir outside the working tree must be refused',
    );
    assert.throws(
      () => deriveStateRoot({ gitCommonDir: '', cwd: repo }),
      (err) => err instanceof StateRootError,
      'an empty answer is a failure, not a relative path',
    );
  });

  it('test_when_the_common_dir_is_relative_then_it_resolves_against_cwd', async () => {
    // Boundary. `git rev-parse --git-common-dir` answers a bare `.git` when run at the
    // tree root, so the pure half must accept a relative answer.
    const repo = await makeRepo();
    assert.equal(deriveStateRoot({ gitCommonDir: '.git', cwd: repo }), join(repo, ...SPRINT_SEGMENTS));
  });
});

describe('Slice B — every server resolves through the one helper', () => {
  it('test_when_both_servers_are_read_then_neither_derives_a_root_from_cwd', async () => {
    // AC-004. A half-repaired fix is worse than none: two servers would then
    // disagree about where the store lives, which is the same silent split by
    // another route. Slice D retired the second server, so the list is one long —
    // it stays a list because the next server added has to satisfy this too.
    const targets = ['.claude/mcp/baseline/server.mjs'];
    for (const rel of targets) {
      const src = await readFile(join(ROOT, rel), 'utf8');
      assert.ok(/resolveStateRoot/.test(src), `${rel} must resolve through the shared helper`);
      assert.ok(
        !/CLAUDE_PROJECT_DIR\s*\|\|\s*process\.cwd\(\)/.test(src),
        `${rel} must not derive a state root from cwd — that is the defect`,
      );
    }
  });

  it('test_when_the_helper_is_called_twice_then_it_returns_the_same_path', async () => {
    // The servers resolve lazily, so the answer has to be stable across calls.
    const repo = await makeRepo();
    assert.equal(resolveStateRoot({ cwd: repo }), resolveStateRoot({ cwd: repo }));
  });
});
