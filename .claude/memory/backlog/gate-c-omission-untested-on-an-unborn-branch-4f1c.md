---
key: gate-c-omission-untested-on-an-unborn-branch-4f1c
category: backlog
scope: [tdd, security]
governs: .claude/hooks/lib/common.mjs, .claude/skills/triage/seed-tasklist.mjs
status: open
raised-on: 2026-08-20
raised-in-context: unborn-branch-consent-blindness
source: assistant-deferral
estimated-effort: low
verified-at: d23c06b
last-touched: 2026-08-20
---

> verbatim (assistant, 2026-08-20):
> "add an AC and a test pinning `isAutonomousFeatureLanding()` on an unborn branch across the four combinations of {release branch, feature branch} × {protected, unprotected}, so the gate-C materialization decision is held by a test rather than inherited."

- Intent: Cover the gate-C omission decision on an unborn branch with an acceptance criterion and a test. Fixing `currentBranch()` to resolve an unborn branch (`unborn-branch-consent-blindness`) flipped `isAutonomousFeatureLanding()` from `false` to `true` in a state it could never reach before, and `seed-tasklist.mjs` passes `!isAutonomousFeatureLanding()` as `ctx.commitConsentRequired` — so on a github-flow project initialized straight onto a feature branch the `grant-commit` node is now omitted where it previously materialized.
- Measured at `d23c06b`, holding every other signal fixed (github-flow, primary tree, `release_branches: ["main"]`, unprotected): `computeAutonomousFeatureLanding` returns `false` for `branch=null` and `true` for `branch=feat/x`. End to end in a repo made with `git init -b feat/x` and no commit: `branch: feat/x  protected: false  autonomousFeatureLanding: true`.
- Not a bypass: gate C's omission and the guard's allow are keyed on the same property, so nothing gets past `git_commit_guard` that it would otherwise have stopped, and the resulting behavior is what `seed.md` §11 prescribes for a feature branch. The gap is that a consent-gate materialization decision changed with no test holding it — the spec's AC table stopped at `branch_guard` (AC-006).
- Full analysis: `docs/archive/2026-08-20/unborn-branch-consent-blindness/security.md`, MEDIUM finding.
