# Add a `standup` recap skill that reports release + backlog state and recommends the next pickup

<!--
Intake document. Produced by the `intake` skill.
Primary input: docs/brief/standup-skill.md (brainstorm brief).
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

Whenever the maintainer sits down to plan a release or pick the next thing to build, the "where are we, what's next" recap is assembled by hand: read `CHANGELOG.md` for the last released version, run `git log <last-tag>..HEAD` and eyeball the commit types, read `.claude/memory/backlog.md` to see what's open vs already picked up, read `.claude/memory/pending-questions.md`, then reason ad hoc about what to do next. This happened live in the originating session ("plan next release") and took four separate reads plus manual synthesis. It is slow, and the shape of the readout is inconsistent from session to session — nothing guarantees the same facts surface in the same structure each time.

There is no single mechanism that answers, consistently: what shipped last, what is committed-but-unreleased (and which semver bump it will trigger), whether those commits are pushed, what the backlog holds bucketed by status, and what the recommended next pickup is.

## Goal

A maintainer (or Claude) can get a consistent, structured "release + backlog state, and what to pick up next" readout from one mechanism — at session start and on demand — instead of re-deriving it by hand from four sources each time.

## Non-goals

- **Not a maintained roadmap artifact.** It is a point-in-time recap, not a forward plan kept up to date.
- **Not a workflow phase.** It is a read-only utility in the family of `audit-baseline` / `rca`, invokable any time; it does not enter the 11-phase pipeline or the Track Guard ordering.
- **Does not write `CHANGELOG.md`.** That file is owned solely by semantic-release in CI.
- **Does not auto-start, stage, or commit any work.** It recommends; it never acts.
- **Does not replace or modify the existing session-start memory index / resume snapshot.** The two readouts stay separate in content (the resume snapshot is last-session work-in-flight; standup is release/backlog state).

## Success metrics

- Recap obtained in **one invocation** vs. ~4 manual file reads + ad hoc synthesis today.
- **Deterministic mechanical output**: identical repo + memory state yields byte-identical `gather.mjs` output (no nondeterminism), measured by running the helper twice on a fixture and diffing.
- **Structural consistency**: every invocation surfaces the same named sections (shipped / staged-unreleased / backlog-buckets / open-questions / recommended-pickup), measured by the SKILL.md contract + the gather output schema.

## Stakeholders

- **Requester**: Tushar Srivastava (baseline maintainer, razieldecarte@gmail.com)
- **Reviewer**: Tushar Srivastava
- **Operator** (who runs it in prod): Claude in-session (skill invocation + session-start surfacing) and the maintainer on demand.

## Constraints

- **Article II boundary.** The mechanical gathering/parsing is deterministic (`gather.mjs`); the final "what to pick up next" recommendation is judgment and must be assembled in main context, not emitted by the helper.
- **Provenance.** The skill ships in the baseline, so its `SKILL.md` frontmatter must declare `owner: baseline` (Article XI), and it must be recorded in `obj/template/.claude/manifest.json` (`owners.skills` + per-file sha256).
- **Governance count cascade.** Adding a baseline skill moves the count 40→41 everywhere it is asserted: CLAUDE.md (Article III greeting + Appendix B / quick-orientation), `docs/init/seed.md` §16/§17, `README.md`, the manifest, and the `audit-baseline` count check. All must reconcile or `audit-baseline` FAILs.
- **Shipped-helper rule.** New skill helpers must be `.mjs`/`.js` (no Python); `gather.mjs` must be importable by consumer installs (listed in the manifest) and must not reference dev-tree-only paths.
- **Graceful degradation.** Must not crash on a non-git tree, a repo with no tags, an empty backlog, or absent memory files — these are sanctioned states (project-agnostic mode, fresh installs).

## Acceptance criteria

1. Given a git repo with a latest tag `vX.Y.Z` and N commits between that tag and HEAD, when `gather.mjs` runs, then it returns the last released version and the list of commits-since-tag, each classified by conventional-commit type (feat / fix / chore / docs / refactor / perf / etc.).
2. Given that set of since-tag commits, when `gather.mjs` runs, then it reports the aggregate semver bump those commits will trigger under the project's release rules (feat → minor, fix → patch, chore/docs/build/no-code → no release), consistent with the 0.x alpha cap convention recorded in CHANGELOG.
3. Given local commits relative to `origin`, when `gather.mjs` runs, then it reports the pushed-vs-origin state (ahead/behind counts, or "all pushed", or "no upstream").
4. Given `backlog.md` containing entries with `status: open | picked-up | dropped` and a parent epic with `parent:`-linked children, when `gather.mjs` parses it, then entries are bucketed by status and each child is resolved under its parent epic.
5. Given `pending-questions.md` with N entries, when `gather.mjs` runs, then each is condensed to its question + blocker line in the output.
6. Given a non-git directory, a repo with no tags, an empty backlog, or missing memory files, when `gather.mjs` runs, then it exits without error and names the missing precondition in its output (no crash, no partial garbage).
7. Given the same repo + memory state, when `gather.mjs` runs twice, then the two outputs are byte-identical (deterministic).
8. The skill's `SKILL.md` declares `owner: baseline`, instructs the recommended-next-pickup to be assembled in main context (not by the helper), and after the change `audit-baseline` exits 0 with the skill count reconciled at 41 across CLAUDE.md, seed.md §16/§17, README, and the manifest.
9. The skill is invocable on demand (via the `Skill` tool / `/standup`) and is surfaced at session start, kept separate from the existing resume snapshot (per the boundary decision; exact surfacing mechanism resolved in research/spec — see Open questions).

## Open questions

- At session start there is no main-context judgment loop, so the auto-surfaced standup is necessarily the *mechanical* recap (gather output); does the judgment-based "recommended pickup" surface only on-demand, or does the session-start path carry a lighter heuristic recommendation? (research/spec to resolve)
- Session-start surfacing mechanism: a **new** SessionStart hook (bumps the 22-hook count, with its own governance cascade) vs. having the existing `memory_session_start` hook invoke the gather helper and append a separate standup section. "Stay separate" was a content decision, not necessarily a separate-hook decision. (research/spec to resolve)
