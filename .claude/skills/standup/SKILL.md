---
name: standup
owner: baseline
description: Read-only release + backlog recap. Reports the last release, commits-since-tag classified by conventional-commit type with the semver bump they trigger and pushed-vs-origin state, the backlog bucketed (open/picked-up/dropped with epic parent→child nesting), the roadmap epics with their per-task tallies, and condensed open questions — then recommends the next pickup. One `cli.mjs recap` call returns all six recap keys. Invoke any time (on demand) to plan a release or choose the next thing to build; a compact form is also surfaced at session start. Not a workflow phase; never writes CHANGELOG; never starts or commits work.
disable-model-invocation: true
---

# standup — where are we, what's next

A read-only recap utility in the family of `audit-baseline` / `rca`: it reads state and reports, it never mutates. Run it whenever you sit down to plan a release or pick the next piece of work. It is **not** a workflow phase — it does not enter the Track Guard ordering and never blocks a commit.

## What it answers

1. **Shipped** — the last released version (from `CHANGELOG.md` / the latest tag).
2. **Staged but unreleased** — every commit since the last tag, classified by conventional-commit type, with the aggregate semver bump those commits will trigger (read from `.releaserc.json` at runtime, so it never drifts from the release config) and the pushed-vs-origin state.
3. **Backlog** — entries bucketed `open` / `picked-up` / `dropped`, with epic children nested under their parent.
4. **Open questions** — `pending-questions.md` condensed to id + question + blocker.
5. **Roadmap** — the execution plan's epics with their status and per-task tallies, plus the Progress bullets, read from `project.json → roadmap.path`.
6. **Recommended next pickup** — assembled in main context (see Article II below).

## How to run

One invocation returns the whole recap. Use the CLI front door:

```
node .claude/skills/standup/cli.mjs recap [--json] [--root <repo-root>]
```

Without `--json` it prints the bounded rendering — commits collapsed to counts-by-type plus the aggregate bump, the roadmap epics with their tallies, backlog bucket sizes, and any open questions. With `--json` it prints the raw `StandupRecap`.

**`StandupRecap` carries six keys. All six come back in that one call:**

| Key | What it holds |
|---|---|
| `release` | `lastVersion`, `lastTag`, and `commitsSinceTag[]` classified by conventional-commit type with the semver `bump` each triggers |
| `releaseModel` | the declared release POLICY from `project.json → release` — drives the regime-aware recommendation below |
| `backlog` | entries bucketed `open` / `picked-up` / `dropped`, epic children nested under their parent |
| `pendingQuestions` | `pending-questions.md` condensed to id + question + blocker |
| `roadmap` | the execution plan's `epics[]` (number, title, tag, status, per-task tallies) and its Progress bullets |
| `degraded` | one marker per source that could not be read — `no-roadmap-plan`, `no-release-model`, and so on |

Do not re-derive any of these by hand afterwards. Re-reading the roadmap file or re-running `git log` after this call is the multi-pass behaviour the CLI replaced; every key above is already in the result.

It degrades gracefully — on a non-git tree, a repo with no tags, or missing memory files it names the missing precondition in `degraded[]`, still exits 0, and never throws. `gather.mjs` remains importable as the collector for in-process callers such as the session-start hook.

## Article II — where the judgment lives

Per CLAUDE.md Article II, decisions live in main context. The helper only **gathers** the mechanical recap; it does not pick what to build next. After reading the helper's JSON, the recommendation — the single suggested next pickup and its one-line rationale (smallest unblocker first) — is reasoned out **in main context**, not emitted by the helper. The session-start surface (the `memory_session_start` hook) shows only the compact mechanical recap plus a pointer back to `/standup`; the full judgment recommendation is on-demand here.

### Release-model-aware recommendation (AC-303)

When `gatherSync` surfaces a `releaseModel` (from `project.json → release`), the "can this unreleased pile ship?" judgment becomes **regime-aware** — the model tells main context which regime it is in, the way `git.workflow_model` overrides generic branching instincts:

- **`release_trigger: on-push` / `release_cycle: continuous` / `consumer_upgrade_cadence: frequent`** → recommend **pushing early and often**; an unpushed pile is the risk. Fix-forward is cheap.
- **`release_trigger: on-tag`|manual / `release_cycle: sprint-based`|manual / `consumer_upgrade_cadence: rare`** → a release is a CD pressing: recommend **gating the cut on a completeness/coherence audit**. When `release.completeness_gate.half_wired_blocks_release` is true, do **not** recommend cutting while any feature in the unreleased set is half-wired-on-the-disc (shipped-dark but opt-in-broken).

A `no-release-model` marker in `degraded` means no policy is declared — fall back to the pre-model behavior (report the semver bump from `.releaserc` and let the human decide). The judgment stays in main context (Article II); `collectReleaseModel` only surfaces the config.

## Constraints

- **Read-only.** Reads git, `.releaserc.json`, `CHANGELOG.md`, and the memory files. Writes nothing.
- **Never writes `CHANGELOG.md`** — semantic-release owns it in CI.
- **Never starts, stages, or commits work** — it recommends; you act.
- **Deterministic core** — identical repo + memory state yields identical helper output (no clock read in the core path).
