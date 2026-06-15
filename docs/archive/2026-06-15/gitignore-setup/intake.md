# Gitignore setup: generation skill, init-project creation, and a commit-time guard

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

A baseline-equipped project has no guarantee that the files which must never be tracked are actually ignored, and nothing stops a commit that tracks them.

Two concrete failure pictures:

1. **No correct `.gitignore` at setup.** `/init-project` does not reliably create a `.gitignore`. A fresh consumer repo can therefore track baseline-transient state (`.claude/state/`, `obj/`, swarm worktrees, the gitignored body of `_pending.md`) and common secrets/noise (`.env*`, `node_modules`, OS/editor cruft). The developer only notices after the junk (or a secret) is already in history.
2. **No commit-time backstop.** Even with a `.gitignore`, a stray `git add <path>` or a missing entry lets a must-ignore file get staged and committed. There is no check that the required paths are actually ignored before the commit lands. Secrets and generated state are treated as equally commit-stopping.

## Goal

Every initialized project has a correct, non-destructively-maintained `.gitignore`, and a commit is blocked before it lands if any path that must be ignored is not — without a network call at commit time.

## Non-goals

- Do **not** destructively overwrite or reorder an existing project `.gitignore`. Init is add-only: append the baseline must-ignore lines not already covered, preserving the project's own entries verbatim.
- Do **not** fetch gitignore.io (or any network) at commit time. The commit check is offline only.
- Do **not** change `verify` behavior or any other workflow track.
- Do **not** rewrite history or auto-un-track files that are already committed. The commit guard gates *new* commits only; cleaning existing history is the developer's call.
- Do **not** let the secret-vs-state distinction change the outcome: any leak of either category stops the commit.

## Success metrics

- Init `.gitignore` coverage — baseline: a fresh `/init-project` may leave must-ignore paths untracked-but-not-ignored, target: 100% of the fixed baseline must-ignore set is ignored after init, measured via `git check-ignore` over the set in a freshly-initialized fixture repo.
- Existing-file preservation — baseline/target: an existing `.gitignore`'s lines are byte-preserved after init (only new lines appended), measured via a diff that shows zero deletions/reorderings.
- Commit-leak block rate — baseline: a commit staging a must-ignore path succeeds, target: it is hard-blocked with a message naming the offending path, measured via a test that stages such a path and asserts the guard denies the commit.
- Offline correctness — baseline/target: the commit check runs with no network and the generator falls back to the vendored default when gitignore.io is unreachable, measured via an offline test run.

## Stakeholders

- **Requester**: Tushar Srivastava (razieldecarte@gmail.com)
- **Reviewer**: Tushar Srivastava (solo baseline maintainer; codesign decisions + gate A)
- **Operator** (who runs it in prod): baseline maintainer + downstream consumer-repo developers running `/init-project` and committing

## Constraints

- **Governance cascades (two).** A new skill takes the baseline 41→42 (`derive-counts`, manifest, `seed.md §4.3`, `CLAUDE.md`/`README`/`CONSTITUTION` counts + Appendix B). A new PreToolUse hook takes hooks 23→24 (`seed.md §4.1`, `CLAUDE.md` Article VIII table, `CONSTITUTION` Appendix A, `settings.json` wiring, count surfaces). Both ripple through the `baseline-skill-count-cascade` and `baseline-skill-edit-needs-manifest-rebuild` landmines; the build must restamp the manifest.
- **Offline-first (Article VI.5).** gitignore.io is external network; only `context7` is sanctioned today. The skill must degrade to a vendored default when the service is unreachable, and the commit guard must never touch the network.
- **Consent-gate coexistence.** The new commit guard fires on the same `git commit` Bash boundary as `git_commit_guard`; the two must compose (both can deny; neither masks the other), and the new guard must fail closed on malformed input like the existing guards.
- **Codesign mode is on.** The load-bearing technical decisions (gitignore.io integration + fallback source-of-truth, the must-ignore list's canonical home, the guard's trigger/scope and compose-order with `git_commit_guard`) are settled with the engineer at `/spec`.
- **Shippable helpers** must be `.mjs`/`.js` (or `.sh`), never Python (spec-shippability rule); any new module must be manifest-listed.

## Acceptance criteria

1. Given a fixture repo with no `.gitignore`, when `/init-project` runs, then a `.gitignore` exists afterward and every path in the fixed baseline must-ignore set returns ignored under `git check-ignore`.
2. Given a fixture repo with an existing `.gitignore` containing project-specific lines, when `/init-project` runs, then those lines are preserved byte-for-byte and only missing baseline must-ignore lines are appended (zero deletions/reorderings).
3. Given the generation skill, when gitignore.io is reachable, then it produces a `.gitignore` from the service; when it is unreachable, then it produces the vendored-default `.gitignore` and reports the fallback (no failure, no network error surfaced to the user).
4. Given a staged change that includes a path in the must-ignore set, when `git commit` is attempted, then the new PreToolUse hook denies the commit and names the offending path(s); the check performs no network call.
5. Given a staged change with no must-ignore path leaking, when `git commit` is attempted, then the new hook allows it (and `git_commit_guard`'s independent consent/forbidden-flag checks still apply unchanged).
6. Given the additions, when `audit-baseline` and the full suite run, then skill count = 42 and hook count = 24 are consistent across every count surface (seed.md, CLAUDE.md, README, CONSTITUTION, derive-counts, manifest), mirrors stay byte-equal, and the audit exits 0.

## Open questions

- **Canonical home of the must-ignore list** — the generator (init), the vendored fallback, and the commit guard all need the same baseline must-ignore set. Where is the single source of truth so the three can't drift? Resolve at `/research` + codesign.
- **Guard trigger precision** — should the commit guard inspect staged paths (`git diff --cached --name-only`) and run `git check-ignore` on each, or check the must-ignore set directly? Compose-order with `git_commit_guard` (which guard runs first, how a deny from either surfaces). Resolve at codesign.
- **gitignore.io request shape** — which toolbox tokens / endpoint, and how the vendored default is kept current. Resolve at `/research` (with the offline fallback as the safety net).
