// Article VII hard-blocks — the guard must forbid the *operation*, not one spelling.
//
// Pre-amendment FORBIDDEN_RE named `git clean -f` and `git checkout --` and matched
// neither `git clean -fd` (a `\b` cannot sit between `f` and `d`) nor `git restore`,
// `git checkout <tree-ish> -- <path>`, or `git checkout .`. The canonical spelling of
// the most destructive command on the list ran unblocked.
//
// This suite pins the whole spelling matrix, both directions: every destructive alias
// blocks, and every safe neighbour still passes. The allow-list half is what stops a
// future "just broaden the regex" fix from breaking `git checkout -b` or the swarm.
//
// seed.md Art. VII (amended 2026-07-09) · CLAUDE.md Art. VII · Art. VIII git_commit_guard

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(REPO_ROOT, '.claude/hooks/git_commit_guard.mjs');

// Lift the live FORBIDDEN_RE out of the guard rather than restating it here, so the
// test can never drift into asserting against its own private copy of the pattern.
function liveForbiddenRe() {
  const src = readFileSync(GUARD, 'utf8');
  const start = src.indexOf('const FORBIDDEN_RE = new RegExp(');
  assert.ok(start >= 0, 'git_commit_guard.mjs must declare FORBIDDEN_RE via new RegExp(');
  const end = src.indexOf('\n);', start);
  assert.ok(end > start, 'FORBIDDEN_RE declaration must terminate with a `\\n);` line');
  const decl = src.slice(start, end + 3);
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  return new Function(`${decl}\nreturn FORBIDDEN_RE;`).call(mod);
}

const BLOCKED = [
  // clean — every flag spelling (the -fd hole)
  ['git clean -f', 'bare force'],
  ['git clean -fd', 'canonical form — was ALLOWED'],
  ['git clean -xfd', 'force + ignored files — was ALLOWED'],
  ['git clean -df', 'flag order swapped'],
  ['git clean --force', 'long form'],

  // worktree path-discard — one operation, six spellings
  ['git checkout -- file.txt', 'the originally-named form'],
  ['git checkout HEAD -- file.txt', 'tree-ish then path — was ALLOWED'],
  ['git checkout .', 'path sweep — was ALLOWED'],
  ['git restore file.txt', 'modern alias — was ALLOWED'],
  ['git restore --worktree file.txt', 'explicit worktree discard'],
  ['git restore --source=HEAD~1 file.txt', 'discard to arbitrary source'],
  ['git restore --staged --worktree file.txt', 'unstage AND discard worktree'],

  // newly forbidden operations (seed.md amendment 2026-07-09)
  ['git switch --discard-changes main', 'discards worktree on switch'],
  ['git stash drop', 'destroys a stash'],
  ['git stash clear', 'destroys all stashes'],

  // pre-existing, must not regress
  ['git reset --hard', 'history/worktree reset'],
  ['git commit --amend -m x', 'rewrites history'],
  ['git commit -m x --no-verify', 'skips hooks'],
  ['git branch -D feat/x', 'force-deletes a branch'],
  ['git config user.email x@y.z', 'mutates config'],
  ['git rebase -i HEAD~3', 'interactive'],
  ['git add -i', 'interactive'],
  ['git add -A', 'path sweep'],
  ['git add .', 'path sweep'],
];

const ALLOWED = [
  ['git restore --staged file.txt', 'unstages only; worktree untouched'],
  ['git restore --staged -s HEAD~1 file.txt', 'index-only restore from a source'],
  ['git checkout -b feat/new-thing', 'creates a branch'],
  ['git checkout main', 'switches branch'],
  ['git switch main', 'switches branch'],
  ['git switch -c feat/new-thing', 'creates a branch'],
  ['git stash', 'saves work; destroys nothing'],
  ['git stash push -m wip', 'saves work'],
  ['git stash list', 'read-only'],
  ['git stash pop', 'restores work'],
  ['git worktree remove --force /tmp/wt', 'swarm-dispatch prescribes this (Phase 6c)'],
  ['git clean -n', 'dry run; deletes nothing'],
  ['git add src/file.txt', 'named path'],
  ['git commit -m "msg"', 'ordinary commit'],
  ['git status', 'read-only'],
  ['git diff --stat', 'read-only'],
];

describe('Article VII hard-blocks cover every spelling of each forbidden operation', () => {
  const re = liveForbiddenRe();

  for (const [cmd, why] of BLOCKED) {
    it(`test_when_cmd_is_${JSON.stringify(cmd)}_then_blocked`, () => {
      assert.ok(re.test(cmd), `must be hard-blocked (${why}): ${cmd}`);
    });
  }

  for (const [cmd, why] of ALLOWED) {
    it(`test_when_cmd_is_${JSON.stringify(cmd)}_then_allowed`, () => {
      assert.ok(!re.test(cmd), `must NOT be hard-blocked (${why}): ${cmd}`);
    });
  }
});

// Q-003, second edition. Broadening FORBIDDEN_RE to cover every spelling of a
// forbidden op re-opened the data-vs-executed false-positive: a commit message
// that DESCRIBES `git restore` is prose, not an invocation. The guard must scan
// the executable shape (sanitizeGitCommitForScan), never the payload — while an
// op hidden in an EXECUTED substitution stays visible (over-inclusion is the
// safe direction). Landmine: shell-command-guards-must-classify-wrapper-and-quote-aware.
describe('forbidden-op matching reads the executable shape, not commit prose', () => {
  // A `git commit` command has TWO independent reasons to be denied: the
  // FORBIDDEN_RE hard-block, and the branch-aware consent policy (every branch is
  // protected while git.protected_branches is null). Asserting on the decision
  // alone makes these tests depend on whether a /grant-commit token happens to be
  // fresh — green for 900s after a grant, red in CI, which never has one. Assert
  // on the REASON so the hard-block is isolated from the consent gate.
  const FORBIDDEN_REASON = /forbidden git operation/i;

  const guardReason = (command) => {
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
    const r = spawnSync('node', [GUARD], { input: payload, encoding: 'utf8' });
    if (!r.stdout || !r.stdout.trim()) return '';
    try {
      const o = JSON.parse(r.stdout);
      const h = o.hookSpecificOutput || o;
      return h.permissionDecisionReason || h.reason || '';
    } catch {
      return '';
    }
  };

  const blockedAsForbiddenOp = (cmd) => FORBIDDEN_REASON.test(guardReason(cmd));

  it('test_when_commit_heredoc_body_names_forbidden_ops_then_allowed', () => {
    const cmd = [
      "git commit -F - <<'MSG'",
      'fix(hooks): forbid worktree path-discard in every spelling',
      '',
      'Previously `git clean -fd` was allowed, and `git restore <path>` and',
      '`git checkout .` sailed through. `git switch --discard-changes`,',
      '`git stash drop` and `git stash clear` are now blocked too.',
      'MSG',
    ].join('\n');
    assert.equal(blockedAsForbiddenOp(cmd), false, 'a commit message describing forbidden ops is prose, not an invocation');
  });

  it('test_when_commit_message_arg_names_forbidden_op_then_allowed', () => {
    assert.equal(blockedAsForbiddenOp('git commit -m "document that git restore is banned"'), false);
    assert.equal(blockedAsForbiddenOp("git commit -m 'git clean -fd is forbidden'"), false);
  });

  it('test_when_forbidden_op_hidden_in_executed_substitution_then_still_blocked', () => {
    // The message prose is stripped, but the substitution body IS executed.
    assert.equal(blockedAsForbiddenOp('git commit -m "$(git restore src/x.js)"'), true);
  });

  it('test_when_unquoted_heredoc_expands_a_substitution_then_still_blocked', () => {
    // <<MSG (unquoted delimiter) DOES expand: the substitution really executes.
    // Only <<'MSG' makes the body literal. The strip must not confuse the two.
    const cmd = ['git commit -F - <<MSG', 'body $(git restore src/x.js)', 'MSG'].join('\n');
    assert.equal(blockedAsForbiddenOp(cmd), true, 'an unquoted heredoc expands substitutions');
  });

  it('test_when_data_sink_heredoc_documents_forbidden_ops_then_allowed', () => {
    // Writing a memory entry / doc that DESCRIBES the ops. `cat` is a data sink.
    // Not a git command at all, so this one must reach a full allow.
    const cmd = [
      "cat >> .claude/memory/landmines.md <<'ENTRY'",
      '- ops: (`git restore`, `git clean -fd`, `git stash drop`)',
      '- shape: `git commit -m "$(git restore x)"` still blocks',
      'ENTRY',
    ].join('\n');
    assert.equal(guardReason(cmd), '', 'a heredoc fed to cat is data, not commands');
  });

  it('test_when_shell_executor_heredoc_carries_forbidden_op_then_blocked', () => {
    // SECURITY: `bash <<'EOF'` executes its body as a script. Quoted delimiter
    // suppresses expansion, but the shell still RUNS the lines.
    const cmd = ["bash <<'EOF'", 'git restore src/x.js', 'EOF'].join('\n');
    assert.equal(blockedAsForbiddenOp(cmd), true, 'a heredoc fed to a shell is a script');
  });

  it('test_when_quoted_heredoc_contains_backticks_then_treated_as_literal', () => {
    // Markdown backticks in a commit body are prose under <<'MSG', not a
    // command substitution. This is the exact shape that blocked its own commit.
    const cmd = ['git commit -F - <<\'MSG\'', 'note: `git clean -fd` was allowed', 'MSG'].join('\n');
    assert.equal(blockedAsForbiddenOp(cmd), false);
  });

  it('test_when_forbidden_op_follows_a_commit_in_a_compound_then_still_blocked', () => {
    assert.equal(blockedAsForbiddenOp('git commit -m "safe message" && git restore src/x.js'), true);
  });

  it('test_when_real_forbidden_op_then_still_blocked', () => {
    assert.equal(blockedAsForbiddenOp('git restore src/x.js'), true);
    assert.equal(blockedAsForbiddenOp('git clean -fd'), true);
  });
});

// Subcommand classification must read the executable shape too, or a doc heredoc
// whose prose mentions a backticked `$(git commit …)` is classified as a real
// commit and gated on a fresh /grant-commit token.
//
// Asserted on the PURE helpers, not on the guard's decision: whether a `git
// commit` command is allowed depends on consent freshness, so an end-to-end
// assertion here would be green for 900s after a grant and red in CI. That is
// the exact trap this file's own first draft fell into -- twice.
describe('executable-shape derivation drives subcommand classification', () => {
  const imp = () => import(join(REPO_ROOT, '.claude/hooks/lib/common.mjs'));

  it('test_when_data_sink_heredoc_mentions_git_commit_then_not_classified_commit', async () => {
    const { gitSubcommandInvoked, stripQuotedHeredocBodies } = await imp();
    const cmd = [
      "cat >> notes.md <<'ENTRY'",
      'the shape `git commit -m "$(git restore x)"` is denied',
      'ENTRY',
    ].join('\n');
    assert.equal(gitSubcommandInvoked(cmd, 'commit'), true, 'raw string DOES look like a commit (the bug)');
    assert.equal(
      gitSubcommandInvoked(stripQuotedHeredocBodies(cmd), 'commit'),
      false,
      'the executable shape is not a commit — a cat heredoc body is data'
    );
  });

  it('test_when_shell_executor_heredoc_commits_then_still_classified_commit', async () => {
    const { gitSubcommandInvoked, stripQuotedHeredocBodies } = await imp();
    // SECURITY: `bash <<'EOF'` runs its body. The strip must not hide it.
    const cmd = ["bash <<'EOF'", 'git commit -m x', 'EOF'].join('\n');
    assert.equal(
      gitSubcommandInvoked(stripQuotedHeredocBodies(cmd), 'commit'),
      true,
      'a heredoc fed to a shell is a script; the commit must stay classified'
    );
  });

  it('test_when_unquoted_heredoc_then_body_preserved', async () => {
    const { stripQuotedHeredocBodies } = await imp();
    const cmd = ['cat <<EOF', '$(git commit -m x)', 'EOF'].join('\n');
    assert.match(stripQuotedHeredocBodies(cmd), /git commit/, 'unquoted heredocs expand; body preserved');
  });

  it('test_when_guard_reads_raw_cmd_then_it_is_a_regression', () => {
    const guardSrc = readFileSync(GUARD, 'utf8');
    assert.match(
      guardSrc,
      /const execCmd = stripQuotedHeredocBodies\(cmd\)/,
      'handleBash must derive the executable shape once'
    );
    assert.doesNotMatch(
      guardSrc,
      /gitSubcommandInvoked\(cmd,/,
      'classification must read execCmd, never the raw cmd'
    );
  });
});

describe('the constitution chain names the operation, not one alias', () => {
  // seed.md governs (Art. I.4) and carries the full rule; the annex carries the
  // spelling table + rationale (Art. I.6 keeps CLAUDE.md to binding clauses only).
  for (const rel of ['docs/init/seed.md', 'src/seed.template.md', '.claude/CONSTITUTION.md']) {
    it(`test_when_${rel.replace(/[^a-z]/gi, '_')}_read_then_full_rule_stated`, () => {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      assert.match(text, /git restore/, `${rel} must name git restore as forbidden`);
      assert.match(text, /`git restore --staged/, `${rel} must carve out the safe --staged form`);
      assert.match(text, /-fd/, `${rel} must name the -fd clean spelling`);
      assert.match(text, /git switch --discard-changes/, `${rel} must name the switch hard-block`);
      assert.match(text, /git stash (drop|clear)/, `${rel} must name the stash hard-blocks`);
      assert.match(
        text,
        /git worktree remove --force/,
        `${rel} must record the swarm-dispatch exemption`
      );
    });
  }

  // CLAUDE.md stays terse under its char cap, but the binding clause must survive.
  for (const rel of ['CLAUDE.md', 'src/CLAUDE.template.md']) {
    it(`test_when_${rel.replace(/[^a-z]/gi, '_')}_read_then_binding_clause_present`, () => {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      assert.match(text, /Worktree path-discard, any spelling/, `${rel} must state the rule`);
      assert.match(text, /git restore <path>/, `${rel} must name git restore`);
      assert.match(text, /`--staged` permitted/, `${rel} must carve out --staged`);
      assert.match(text, /git switch --discard-changes/, `${rel} must name the switch hard-block`);
    });
  }
});
