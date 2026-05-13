# Add a skill-ownership system so baseline-owned skills can be told apart from user-added skills

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The baseline ships 36 skills under `.claude/skills/`. Once a user installs the baseline via `npx create-baseline` and starts adding their own skills (or editing baseline ones), the on-disk tree gives no signal about which skills are part of the baseline product and which are local additions. Concretely, today:

- `audit-baseline` cannot detect drift on baseline-owned skills because it has no enumeration of which slugs are baseline-owned. A user who silently rewrites the body of `.claude/skills/spec/SKILL.md` gets no audit failure even though the spec phase no longer matches `docs/init/seed.md` or `CLAUDE.md`.
- A future `npx create-baseline upgrade` cannot safely re-overlay baseline files. With no provenance signal, the only safe choices are "clobber everything" (destroys user customizations) or "overlay nothing" (defeats the point of upgrade).
- New baseline releases that remove or rename a skill (the chore-track addition is the most recent example) have no mechanical way to flag the orphaned directory in a user repo.

The smallest concrete scenario: a user installs baseline v0.1.0 (36 skills), then forks `.claude/skills/spec/SKILL.md` to relax PlantUML requirements. Baseline v0.2.0 ships with an updated `spec` skill. Today there is no way for the user to know their fork has diverged, and no way for `upgrade` to merge or warn without manual inspection of all 36 directories.

## Goal

Every skill on disk carries a provenance label (baseline vs user), and a build-time lock file lets the audit detect any drift in baseline-owned skills.

## Non-goals

- Implementing the `npx create-baseline upgrade` subcommand. Lock format must be designed so a future `upgrade` consumes it cleanly, but the subcommand itself is a separate workflow.
- Provenance tracking for non-skill assets (hooks, commands, MCP servers, settings.json, project.json). Skills first; broader coverage can follow once this lands.
- A migration UI for users whose baseline skills have already diverged. We provide a clean detection mechanism; remediation flow is out of scope.
- Cryptographic integrity guarantees (signed lock, supply-chain attestation). The lock is for drift detection, not security.
- Hash coverage for build outputs under `obj/` or the npm-shipped `obj/template/` itself. Those are derived artifacts, not source.

## Success metrics

- Coverage — baseline-owned skills declaring `owner: baseline` in frontmatter, baseline: 0 of 36, target: 36 of 36, measured via: a static enumeration script in `tests/`.
- Drift detection — false-negative rate when a baseline SKILL.md is tampered with, baseline: 100% (no detection today), target: 0% (every tampered baseline skill flagged), measured via: a test that mutates a baseline SKILL.md and asserts `audit-baseline` exits non-zero.
- Lock determinism — byte-identical lock output on consecutive `scripts/build-template.sh` runs, baseline: not applicable (no lock today), target: 100%, measured via: a test that runs the build twice and diffs the resulting `baseline.lock.json`.

## Stakeholders

- **Requester**: razieldecarte@gmail.com (project owner).
- **Reviewer**: razieldecarte@gmail.com (also the sole reviewer for this baseline).
- **Operator** (who runs it in prod): the build script `scripts/build-template.sh` is the runtime; `audit-baseline` is the verifier; both invoked by the project owner before `npm publish`.

## Constraints

- Lock-file output must be deterministic — same input must produce byte-identical bytes so PR diffs are clean. Sort keys, fix line endings, pin the JSON formatter's behavior.
- Hash must be content-only, not file-stat-based (mtime/ctime/inode independent).
- Frontmatter additions must be backward-compatible with existing SKILL.md parsers (the harness, the recommender, the chore skill's enumeration logic, and any external tooling that reads YAML frontmatter).
- The lock generator must run inside the existing build pipeline (`scripts/build-template.sh`). Node standard library only; no new runtime dependencies. `node:crypto` is fine.
- `audit-baseline` must continue to pass in project-agnostic mode (a baseline install where the user has not yet run `/init-project`). If the user has deleted a baseline skill they don't want, the audit must surface this as a precise, actionable error — not crash, and not silently succeed.
- The 36 existing baseline SKILL.md files must gain `owner: baseline` frontmatter without breaking the constitution (Article IX preservation rules, Article VIII hook coverage). User-added skills installed against an older baseline must continue to work; the audit treats missing `owner:` on a non-baseline-listed slug as `owner: user` by default (open question, see below).
- No changes to `.claude/skills/<slug>/SKILL.md` filenames or directory layout. Existing slugs and paths stay stable.

## Acceptance criteria

1. Given any SKILL.md under `.claude/skills/<slug>/`, when a static enumeration script reads its frontmatter, then the `owner` key is present and its value is exactly `baseline` or `user`.
2. Given a clean checkout, when `scripts/build-template.sh` runs, then `.claude/baseline.lock.json` (and its mirror inside `obj/template/.claude/baseline.lock.json`) is produced with one entry per baseline-owned skill, each entry containing at minimum `{ slug, sha256, files }`.
3. Given a clean checkout immediately after the build, when `bash .claude/skills/audit-baseline/audit.sh` runs, then it exits 0 and reports zero drift.
4. Given a clean checkout, when the content of any baseline SKILL.md is mutated (one byte changed) without regenerating the lock, then `audit-baseline` exits non-zero and the failure message names the affected slug and the literal string `hash mismatch`.
5. Given a clean checkout plus a new directory `.claude/skills/user-example/SKILL.md` with `owner: user` frontmatter, when `audit-baseline` runs, then it exits 0 — user-owned skills are ignored by the lock check.
6. Given a clean checkout where the `owner:` field is removed from one baseline SKILL.md, when `audit-baseline` runs, then it exits non-zero and the failure message names the affected slug and the literal string `missing owner frontmatter`.
7. Given a clean checkout where `docs/init/seed.md` or `CLAUDE.md` no longer cites the ownership convention or the lock file by path, when `audit-baseline` runs, then it exits non-zero and the failure message names which document is missing which citation.
8. Given two consecutive `scripts/build-template.sh` runs on the same source tree, when their `baseline.lock.json` outputs are diffed, then the diff is empty.
9. Given a baseline-owned skill listed in the lock file that no longer exists on disk, when `audit-baseline` runs, then it exits non-zero and the failure message names the missing slug and the literal string `baseline skill missing`.

## Open questions

- Hash scope — should the per-skill hash cover SKILL.md only, or every file under `.claude/skills/<slug>/` (references/, scripts/, templates/, helper Bash, etc.)? Most baseline skills carry sibling files; if those are not hashed, drift in `references/orchestration.md` (for example) is invisible to the audit. Intake position: hash every file recursively; spec must confirm.
- Hash algorithm — sha256 (64 hex chars, ~64 bytes per entry, no new deps via `node:crypto`) or sha1 (40 chars, also `node:crypto`). For drift detection sha1 is sufficient, but sha256 is the modern default. Intake position: sha256.
- Lock-file shape — flat array of `{ slug, sha256, files }` objects, or a map keyed by slug. Map is O(1) lookup; array preserves insertion order and diffs more predictably. Intake position: map keyed by slug, with `files` itself an alphabetized array of `{ path, sha256 }`.
- Drift severity — is a hash mismatch always a hard FAIL, or can the lock declare some skills "advisory" so users can fork without breaking the audit? Intake position: hard FAIL, no opt-out; that is the point of the lock. A future `upgrade` subcommand can offer remediation; the audit's job is detection.
- Source-of-truth location — does the lock live at `src/.claude/baseline.lock.json` (hand-editable, committed) or only at `obj/template/.claude/baseline.lock.json` (build output, regenerated each release)? Intake position: build output only; `src/` carries no lock. The dev-repo audit reads the lock from `obj/template/.claude/baseline.lock.json` (or regenerates it on demand).
- Default for missing `owner:` field — treat as `user` (lenient, preserves backward compat for skills installed under older baselines) or as a hard FAIL (strict, forces every skill to declare). Intake position: hard FAIL during audit, but only for skills whose slug appears in the lock file — i.e., baseline-listed skills must declare `owner: baseline`. Skills not in the lock are implicitly `user` and may declare or omit the field.
- Constitutional placement — does this ownership convention amend Article IX (project memory, the closest existing analogue for on-disk provenance) or warrant a new Article XI (Skill provenance and upgrade integrity)? Intake position: new Article XI; Article IX is about memory, not artifacts.
- Migration tactic for the 36 existing baseline SKILL.md files — manual edits in this same workflow (one commit), or a one-shot migration script committed alongside? Intake position: manual edits within the `/tdd` phase of this workflow; spec must list them as part of the write_set so the swarm planner can shard if needed.
