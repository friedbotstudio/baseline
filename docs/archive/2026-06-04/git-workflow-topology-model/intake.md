# Declare, detect, and guard-enforce a git workflow topology model

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Primary input: docs/brief/git-workflow-topology-model.md
-->

## Problem

The baseline enforces git **safety** — consent gates (`/grant-commit`, `/grant-push`), forbidden-flag blocks (`--amend`, `--no-verify`, `reset --hard`), and worktree isolation — but it does not model git **topology** (which line of development a commit belongs on). `project.json → git.protected_branches: null` governs *consent*, not *placement*.

Concrete incident (commit `6e11f2f`, the `changelog-generator-routing` workflow): with nothing project-specific declaring where work belongs, an automated agent (Claude) fell back to a generic "branch off the default branch first" instinct, created `feat/whatsnew-generator-routing`, and committed there — contrary to this repo's established practice of ~93 linear commits direct to `main`, zero merge commits, semantic-release publishing on push to `main`/`next`. Nothing structural caught it; the stray branch was only cleaned up by hand afterward. The actor at the moment of failure is an automated agent acting on the maintainer's behalf during a workflow phase, and the desired safeguard is a hard stop, not an advisory warning — advisory is precisely what was absent and what would have been ignored.

## Goal

A project can declare its branching practice once; the baseline detects it where possible and **structurally prevents** a commit that contradicts it — so an agent's generic instinct can never again override an established practice.

## Non-goals

- The wider review/share/ship lifecycle — how changes get pushed, reviewed via PR, merged, and released — is out of scope for this effort (it remains governed by the existing `/grant-push` consent and CI).
- Enforcement logic for branching models beyond the immediate need: `gitflow` and `trunk` are **reserved enum values that resolve to `ask`**, not implemented behaviors (YAGNI — add at the third concrete consumer).
- Human-contributor-specific workflows are not the design target; commit-boundary enforcement covers them only incidentally.
- Adding a new (23rd) hook. The count stays at 22 — enforcement extends the existing `git_commit_guard`.

## Success metrics

- Stray-branch incidents under a declared `direct-to-main` model — baseline: 1 (commit `6e11f2f`), target: 0 (the guard blocks the commit before it lands), measured via: the new guard's block path + its test.
- Hook count — baseline: 22, target: 22 (unchanged), measured via: `audit-baseline` (exit 0).
- Regression surface — baseline: full suite green, target: full suite green including both a normal `/commit` on `main` and a swarm-dispatch worktree commit under the new `direct-to-main` model, measured via: `/integrate` binding verdict.

## Stakeholders

- **Requester**: Tushar Srivastava (maintainer; `razieldecarte@gmail.com`)
- **Reviewer**: Tushar Srivastava (approves the spec at gate A and the constitutional amendment)
- **Operator** (who runs it in prod): the baseline harness in this repo, and every consuming project that installs the baseline and declares a `git.workflow_model`.

## Constraints

- **No 23rd hook.** Enforcement extends `git_commit_guard` (already intercepts `git commit` at the Bash boundary and reads `project.json → git`). `audit-baseline` asserts the hook count is 22.
- **Precedence (Article I.4): `seed.md` > `CLAUDE.md` > implementation.** The amendment edits `docs/init/seed.md` first (Article VII clause + §16/§17), then `CLAUDE.md` Article VII **and** its byte-equal mirror `src/CLAUDE.template.md`, then the implementation. `audit-baseline` verifies the citations and the mirror equality.
- **Swarm-worktree carve-out.** `/swarm-dispatch` commits inside git worktrees then merges back. Topology enforcement applies only to the **primary working tree at `/commit`**, never to dispatch worktrees, or it would false-block every swarm commit.
- **Composition, not replacement.** Topology enforcement is independent of the existing branch-aware consent (`protected_branches` / `branch_pattern`). Both checks run on the same `git commit` boundary; neither masks the other.
- **Detection is best-effort.** `/init-project` detection needs `gh` auth + network; any ambiguity or unreachable `gh` (headless/CI) resolves to `ask`. Never guess silently.
- **Shipped-helper constraint.** Any new helper under `.claude/` ships as `.sh` or `.mjs`/`.js` (no Python), and any imported module must appear in `obj/template/.claude/manifest.json` (spec-shippability rules).

## Acceptance criteria

1. Given `project.json` with `git.workflow_model` set to any of `direct-to-main | github-flow | ask | gitflow | trunk`, when the value is read, then it validates; given an absent or unrecognized value, then it resolves to `ask`.
2. Given `git.workflow_model: "direct-to-main"` and the current branch is **not** a release branch (e.g. a `feat/*` branch), when a `git commit` is attempted on the primary working tree, then `git_commit_guard` blocks it with a remediation message naming `git checkout <release> && git merge --ff-only <branch>`.
3. Given `git.workflow_model: "github-flow"` and the current branch **is** the default/release branch (`main`), when a `git commit` is attempted, then `git_commit_guard` blocks it with a remediation message to create a feature branch first.
4. Given `git.workflow_model: "ask"` (explicit, absent, or ambiguous-resolved), when a `git commit` is attempted on any branch, then the topology check **passes** (does not block on topology grounds); the branch decision is yielded to the commit/harness SOP.
5. Given `git.workflow_model` is a reserved value (`gitflow` / `trunk`), when a `git commit` is attempted, then the guard behaves as `ask` (passes) — reserved, not enforced.
6. Given `git.workflow_model: "direct-to-main"` and a commit occurring **inside a `/swarm-dispatch` worktree** (not the primary working tree), when that commit is attempted, then the topology check does **not** block it (worktree carve-out).
7. Given `git.workflow_model: "direct-to-main"`, on `main`, on a protected branch, when a commit is attempted **without** a fresh `commit_consent` token, then the commit is still blocked by the existing consent check — i.e. topology PASS does not mask the consent gate (the two checks compose).
8. Given a detached HEAD, when a commit or push is attempted, then the existing deny-on-detached-HEAD behavior is preserved unchanged (topology logic does not regress it).
9. Given `/init-project` running against a repo whose release CI triggers `push: [main, next]` with semantic-release, when detection runs, then it proposes `direct-to-main` via `AskUserQuestion`; given `gh` unreachable or detection ambiguous, then it resolves to `ask` (best-effort, never silent guess).
10. Given the completed change, when `audit-baseline` runs, then it exits 0 with hook count == 22, the Article VII precedence clause present in `seed.md`, `CLAUDE.md`, and `src/CLAUDE.template.md` (mirror byte-equal), and the `seed.md` §16/§17 citation present.
11. Given this repo migrated to `git.workflow_model: "direct-to-main"`, when both a normal `/commit` on `main` and a `/swarm-dispatch` worktree commit are exercised, then both pass the new guard (no false block).

## Open questions

- For `direct-to-main`, is the permitted-branch set just the default branch (`main`), or also `next`? semantic-release here releases on **both** `main` and `next`, so the guard's "release branch" set may need to be a list, not a single branch. (Settle at gate A; affects AC-2/AC-11 wording.)
- For `github-flow`, does the guard hard-block **all** commits on `main`, or only enforce that feature work starts on a branch (allowing, say, a docs hotfix on `main`)? Default assumption: hard-block all `main` commits under `github-flow`. (Settle at gate A.)
