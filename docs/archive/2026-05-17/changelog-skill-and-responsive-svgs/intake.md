# Pre-commit changelog skill (keepachangelog.com 1.0.0) + responsive bento-grid SVG redesign

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

Today, when the user grants `/commit`, the commit message body is drafted ad-hoc by the model (humanizer pass on the body, no structured changelog fragment). At release time, `@semantic-release/changelog` concatenates commit subjects into `CHANGELOG.md` based on conventional-commit type/scope — which produces useful release notes but does not capture the per-commit "Added / Changed / Deprecated / Removed / Fixed / Security" breakdown that [keepachangelog.com 1.0.0](https://keepachangelog.com/en/1.0.0/) prescribes. The current process also leaves zero visibility into the pending release before push — concrete trigger: the user asked "if I push, what version will be deployed to npm?" and the answer required hand-walking 10 unpushed commits through `.releaserc.json` releaseRules in the same session this intake was raised.

Secondary problem: the public website under `site-src/**` and the architecture SVG describe the current 11-phase workflow. Inserting a new phase between `/grant-commit` and `/commit` means the rendered docs site narrative AND the SVG must update or they will silently drift from the implementation. The user has also flagged that the SVG itself is overdue for a redesign — the current shape is not bento-grid and is not legible at mobile viewport widths.

## Goal

Every `/commit` on a future workflow lands with a deliberate, keepachangelog-shaped changelog fragment captured between `/grant-commit` and `/commit`; the website and SVG describe the new pipeline accurately; and the architecture SVG is legible from a 320px-wide mobile viewport up to a 1920px desktop.

## Non-goals

- NOT replacing `@semantic-release/changelog` at release time. Semantic-release continues to own `CHANGELOG.md` generation; the new skill curates per-commit fragments that feed in.
- NOT modifying the npm release pipeline, `/grant-push` behavior, or the conventional-commit parsing rules in `.releaserc.json` releaseRules.
- NOT introducing a new consent gate (gate D). The existing `/grant-commit` consent token continues to authorize both the changelog step and the commit step — single user gesture, two skills downstream of it.
- NOT picking up the sibling backlog item `commit-consent-ttl-too-tight-for-humanizer-flow-8917`. The TTL cure is a separate intake; this workflow will be designed to fit inside the existing 300s window.
- NOT generating release notes, blog posts, or social copy from the changelog fragments. Pure structured per-commit curation.
- NOT making the SVG redesign block on a copy refresh. Bento-grid layout is creative latitude in `/design-ui`; the website narrative update is a separate concern.

## Success metrics

- Every `/commit` on a workflow run after this ships produces a changelog fragment carrying at least one of the six keepachangelog sections (Added / Changed / Deprecated / Removed / Fixed / Security). Measured via: the next 5 post-ship workflows' commit history.
- Architecture SVG renders legibly at viewport widths from 320px through 1920px with no horizontal scroll on mobile and a minimum on-screen label font-size of 12px. Measured via: Playwright snapshot at three breakpoints (320 / 768 / 1920).
- `audit-baseline` PASSes on the post-ship HEAD — confirms the byte-mirror invariants between `CLAUDE.md` ↔ `src/CLAUDE.template.md` and `docs/init/seed.md` ↔ `src/seed.template.md` are preserved across the Article IV amendment.
- Source backlog ticket `setup-changelog-tracker-for-unpushed-commits-f22a` auto-closes on this workflow's `/commit` (via `source_backlog_keys` → `sweep.py --mode stamp-closure`).

## Stakeholders

- **Requester**: Tushar Srivastava (`razieldecarte@gmail.com`).
- **Reviewer**: Tushar Srivastava (single-maintainer project; gate-A and gate-C approvals stay with the requester).
- **Operator**: any consumer of `npx @friedbotstudio/create-baseline` — every installed baseline inherits the new phase after this ships. Backward-compatibility is downstream-facing.

## Constraints

- **Article IV is the authoritative phase enumeration.** Inserting a new phase between gate C and commit means: (a) Article IV's table grows a row; (b) `src/CLAUDE.template.md` mirrors byte-for-byte; (c) `docs/init/seed.md` §16 grows correspondingly; (d) `src/seed.template.md` mirrors. The audit at `.claude/skills/audit-baseline/audit.sh` validates the byte-mirror invariants — both mirrors will fail the audit if drift is introduced.
- **No new consent gate.** The changelog skill is harness-driven and authorized by the same `/grant-commit` token that authorizes `/commit`. Constraint chosen deliberately to keep the consent-gesture count at three (A/B/C).
- **TTL fit.** The changelog skill MUST complete inside the existing `consent.commit_ttl_seconds` window (default 300s) so the downstream `/commit` still finds a valid token. If the skill cannot fit, the sibling backlog item must move first — this intake will not.
- **No mocks of internal modules** (Article VI.3). The skill MAY shell `semantic-release --dry-run --no-ci` (third-party) for projected-version computation; it MAY NOT mock `.claude/state/` reads or memory writes.
- **Article X.1 em-dash ban on `site-src/**`.** Any user-facing copy added to the rendered docs site SHALL NOT contain em dashes. This intake, the spec, and inline code/data quotes are exempt.
- **SVG redesign discipline.** Bento-grid layout via inline SVG; no JavaScript for layout; mobile responsiveness via `viewBox` + percentage-based positioning OR an embedded `<style>` with `@media` rules; single SVG file (or one per page) — no client-side splitting.
- **Non-git skippable.** Non-git projects auto-except `commit` at triage time today. The new phase MUST inherit that exception (i.e., `triage` auto-excepts `changelog` whenever it auto-excepts `commit`). The skill itself, if invoked on a non-git project, returns "no-op: non-git" without writing artifacts.
- **Bootstrap rule.** This workflow's own `/commit` uses the OLD chain (`/grant-commit` → `/commit`) because the new phase doesn't exist on disk yet during this workflow's own commit. Future workflows use the new chain.

## Acceptance criteria

1. Given an active workflow on a git project with `/archive` and `/memory-flush` completed and the `/grant-commit` token present, when the harness advances past `/grant-commit`, then the changelog skill runs BEFORE `/commit` and writes a keepachangelog-shaped fragment to a designated location.

2. Given the changelog skill has run, when `/commit` subsequently stages the diff, then the changelog fragment is part of the commit (storage location resolved in spec — see Open question 1).

3. Given a workflow where `/commit` is in `exceptions` (non-git project), when the harness reaches the post-archive phase, then the changelog skill is also skipped (no fragment written, no error surfaced, `workflow.json → completed` does NOT contain `"changelog"`).

4. Given `CLAUDE.md` Article IV is updated to include the new phase, when `.claude/skills/audit-baseline/audit.sh` runs, then exit code 0 and all byte-mirror invariants pass: `CLAUDE.md` ↔ `src/CLAUDE.template.md`, `docs/init/seed.md` ↔ `src/seed.template.md`, hook/skill/agent/command counts unchanged or correctly incremented.

5. Given the rendered docs site under `site-src/**` describes the workflow pipeline, when the site is built post-ship, then the new phase appears in the correct ordering, the prose contains zero em dashes (Article X.1), and the page validates as semantic HTML.

6. Given the architecture SVG is rendered at viewport width 320px (mobile baseline), when the page loads, then the SVG fits inside the viewport with zero horizontal scroll AND every text label has computed font-size ≥ 12px at the rendered scale.

7. Given the architecture SVG is rendered at viewport width 1920px (desktop baseline), when the page loads, then the SVG uses a bento-grid composition (multiple cells of varied sizes, irregular grid) rather than a linear sequential flowchart, AND the same SVG file is in use as at 320px (single asset, responsive layout).

8. Given a future workflow runs end-to-end through the new phase on a git project, when `/commit` completes, then `workflow.json → completed` contains `"changelog"` immediately before `"commit"` (in that order).

9. Given `source_backlog_keys` names the changelog tracker entry, when `/commit` Step 6 fires, then `sweep.py --mode stamp-closure` stamps `setup-changelog-tracker-for-unpushed-commits-f22a` with `status: picked-up` + `superseded-at: <today>` AND the next `/memory-flush` Step 0a auto-closes that entry.

10. Given the changelog skill is invoked when the `/grant-commit` token has expired (window elapsed since the user's grant), then the skill writes no fragment, surfaces an explicit "consent expired" message, and exits non-zero — `/commit`'s own consent check then fires the same denial.

11. Given the harness re-seeds the TaskList from `workflow.json → completed + exceptions + entry_phase` after a fresh session boundary, when the workflow had reached post-`/grant-commit` but not `/commit`, then the changelog task is correctly seeded ahead of the commit task (canonical template updated in `triage` SKILL.md).

## Open questions

- Where does the keepachangelog fragment live? Three candidates: (a) inline in the commit message body — then `semantic-release` parses it at release time; (b) staged side file like `.changelog/<short-sha>.md` — then `@semantic-release/changelog` concatenates these into `CHANGELOG.md`; (c) directly appended to `CHANGELOG.md` Unreleased section — then the file is committed alongside the diff. Scout/research/spec to resolve. Likely (c) for keepachangelog-spec fidelity (the file literally exists in the project, immediately readable, no semantic-release coupling) — but verify against the existing `@semantic-release/changelog` plugin's idempotence rules.
- Does the skill auto-derive the changelog category (Added / Changed / Fixed / …) from the conventional-commit type, or surface a choice to the user? Auto-derivation maps `feat`→Added, `fix`→Fixed, `chore`→typically nothing, `refactor`→Changed, but misses the multi-category case (a single commit can be both Added AND Fixed). Surfacing reduces autopilot value but reflects keepachangelog intent.
- Hard-block vs advisory: should `/commit`'s prereq grow `changelog` (mirroring the existing `archive` + `memory-flush` requirements), or is it advisory-only? Hard-block is consistent with the rest of the pipeline; advisory-only is forgiving for chore-track workflows.
- Standalone invocation: is `/changelog` ever invokable outside a workflow phase? If yes, it needs a consent-like check of its own (mirroring `/memory-flush` ad-hoc); if harness-only, the `/grant-commit` token satisfies authorization.
- New state file: does the workflow need `.claude/state/changelog/<slug>.json` (mirroring `spec_approvals/` and `drift/`) for cross-session resilience, or is the skill stateless?
- Bento-grid cell count: the 11 phases naturally map to a 4×3 grid with one cell free, OR a custom bento (some cells spanning 2 columns / 2 rows). Creative call deferred to `/design-ui` in the spec's `## Design calls` table.
- Does the new phase get its own Article III SessionStart greeting line, or stay invisible to fresh users? Stylistic call for the constitution amendment.
- Hook involvement: does the changelog phase need a new PreToolUse / PostToolUse hook to enforce the "no commit without changelog" invariant, or is the harness's task-seeding sufficient? Spec to decide.
