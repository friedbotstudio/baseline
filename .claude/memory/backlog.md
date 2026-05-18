---
owners: [/memory-flush]
category: future-work intent
size-cap: 500
key: <slug>-<4char-hash>
verifies-against: none
stale-exempt: true
---

# Backlog

Future-work intent captured automatically by `memory_stop.sh`. Curated into this file via `/memory-flush`. Stable key shape: `<8-word-kebab>-<4-char-sha256>`. Entries use `superseded-at:` as the closure trigger (auto-delete on the next `/memory-flush` Step 0a sweep); the body `status:` field disambiguates whether the entry was `picked-up` (taken into a workflow) or `dropped` (decided not to do). Entries are decay-exempt: they do not stale-age regardless of `verified-at:` distance (see the stale-exempt carve-out in `memory_session_start.sh` and `sweep.py`).

---

## migrate-bash-python-heredocs-to-javascript-d454

> verbatim (user, 2026-05-17):
> this is a good point to remember that we want to move away from python and instead move to javascript for all these tasks.

- source: user-instruction
- status: open
- raised-on: 2026-05-17
- raised-in-context: backlog-memory-bucket
- estimated-effort: large
- verified-at: HEAD
- last-touched: 2026-05-17
- caveat: 18 bash-with-python-heredoc hooks plus standalone Python helpers (`sweep.py`, `resume_writer.py`, the `audit.sh` heredoc) need porting. The two JS-port pilots already landed (`git_commit_guard.mjs`, `consent_gate_grant.mjs`) provide the pattern — Node ESM helpers in `.claude/hooks/lib/common.mjs`, settings.json wiring on `.mjs` filenames. The `conventions.md → hook-script-shape` entry pins the current "python3 heredoc, no jq" contract; that convention flips with this migration. The user explicitly chose option B during the backlog-memory-bucket workflow: ship the backlog feature as-spec'd in Python, then queue the migration as a separate follow-on workflow with its own intake + scout + research + spec.

## improved-backlog-item-detection-046c

> verbatim (user, 2026-05-17):
> improved backlog item detection (this I am saying without testing anything but given that last memory flush deleted it means backlog item extraction can be improved)

- source: user-instruction
- status: open
- raised-on: 2026-05-17
- raised-in-context: post-backlog-memory-bucket review (no active workflow)
- estimated-effort: medium
- verified-at: HEAD
- last-touched: 2026-05-17
- caveat: Direct-write to `backlog.md` because `memory_stop.sh` intent-detection didn't fire on this item's prose phrasing — which is itself the evidence the user cites. The intent regex set in `memory_stop.sh` (anchored line-start patterns like `TODO:`, `next we (should|need to|must)`, `let's also`, `we should also`, `backlog this`, `after this (lands|ships)`) misses descriptive numbered-list items like "1. improved backlog item detection". Scope of follow-up: widen the trigger set toward higher recall while preserving the precision contract from the backlog-memory-bucket intake ("only obvious future-intent phrasings should match; mid-sentence accidental matches should not"); add a test corpus of true-positive sentences from real conversations; consider a second pass at flush-time that lets the curator manually promote anything the hook missed.

## seed-template-md-pre-redesign-drift-a1f3

> assistant-deferral (claude, 2026-05-17):
> src/seed.template.md is significantly drifted from docs/init/seed.md — the template still uses pre-redesign "auto-continuation signal" framing AND retains the deprecated "Per-tick atomicity" header that the existing test `test_harness_skill_md_lacks_one_skill_per_tick_phrase` already rejects on CLAUDE.md. The shipped baseline (via `npx @friedbotstudio/create-baseline`) overlays src/seed.template.md → docs/init/seed.md at install time, so this drift means freshly-installed projects get the older mental model.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-17
- raised-in-context: harness-auto-resume-after-consent-gate /document phase
- estimated-effort: medium
- verified-at: HEAD
- last-touched: 2026-05-17
- caveat: Discovered while updating docs/init/seed.md for rung 4 — src/seed.template.md lines around 141, 167, 365 still describe the older mental model. Out of scope to fix here (the harness-auto-resume spec's `write_set` didn't include src/seed.template.md and the drift predates this workflow). Future workflow: bring src/seed.template.md to byte-parity with docs/init/seed.md, OR add a byte-mirror test analogous to `test_claude_template_md_byte_mirrors_claude_md`. The byte-mirror test is probably the better fix — automates detection of future drift the same way Article XI's CLAUDE.md mirror does.

## document-phase-public-site-update-trigger-5e07

> assistant-deferral (claude, 2026-05-18):
> The /document phase needs a better trigger for "behavior change → public docs site update" — I treated it as internal-only when site-src/ described the workflow.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-18
- raised-in-context: workflow-loop-closing-hygiene end-of-workflow lessons (commit bfad579)
- estimated-effort: medium
- verified-at: bfad579
- last-touched: 2026-05-18
- caveat: The `/document` skill's Step 2 survey classifies touched files into documentation / technical-tutorials / prose delegate buckets. It does NOT classify by "the change modifies behavior that an existing public-docs page describes." During workflow-loop-closing-hygiene's first `/document` pass, I anchored on "no site-src/ file is in my write_set" → "no site work needed" — which got the direction backwards. The site DESCRIBES behavior; when behavior changes, the description needs updating even when no site-src/ file initially appears in the diff. Cure surfaces: (i) extend `/document` Step 2 with a "site-describes-this-behavior" check that greps the public-docs surface (site-src/**.njk) for references to skill names + workflow-phase names touched by the diff and routes any matches through the `documentation` delegate; (ii) require the spec's Archive plan section to enumerate any public-docs pages that describe behavior the spec changes, surfacing the requirement at /spec time rather than at /document time. Either path requires the trigger to be REFLECTIVE (the diff's behavior change implies a docs surface that may not be in the diff yet), not just file-presence-driven. See `workflow-loop-closing-hygiene` archive bundle's session log for the live miss-and-fix-up cycle.

## commit-consent-ttl-too-tight-for-humanizer-flow-8917

> assistant-deferral (claude, 2026-05-18):
> The 300s commit_consent TTL is tight for commits that need humanizer + an explanation hop in between. The cure is to not add a stall ("want me to go ahead?") between grant-commit and git commit when no new question is actually pending.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-18
- raised-in-context: workflow-loop-closing-hygiene end-of-workflow lessons (commit bfad579 required a /grant-commit re-grant after the first token expired)
- estimated-effort: small
- verified-at: bfad579
- last-touched: 2026-05-18
- caveat: `project.json → consent.commit_ttl_seconds` defaults to 300. During this workflow's `/commit` step, the elapsed time from /grant-commit consent to actual git commit was 544 seconds — the message-drafting, humanizer pass, and a redundant "want me to go ahead?" stall ate the window. Two non-exclusive cures: (i) behavioral — don't insert post-grant stalls when there is no actual decision pending; the user's /grant-commit already authorized the commit. Add this as `/commit` SOP guidance: between Step 4 (humanizer) and Step 5 (git commit), do NOT emit a clarifying question to the user — humanizer's output is the final body and the commit fires immediately. (ii) configuration — raise `consent.commit_ttl_seconds` default to 600 to absorb humanizer latency on slower runs, or have `/commit` check the token's age before Step 4 and re-grant if `< 60s` remaining. Behavioral cure is YAGNI-aligned (no config change); configuration cure is more robust but adds knobs.

## changelog-actuator-reads-head-not-staged-4dc0

> assistant-deferral (claude, 2026-05-18):
> The Phase 11.5 changelog actuator reads HEAD's commit message and projects forward, but the upcoming commit hasn't been made yet. On the branded-cli-tui workflow's first real run, this wrote an entry describing `db291ed` (the changelog skill's own commit) instead of branded-cli-tui's changes, and placed it ABOVE the `## [Unreleased]` heading rather than under it.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-18
- raised-in-context: branded-cli-tui workflow Phase 11.5 (`/changelog` actuator first real-world invocation)
- estimated-effort: medium
- verified-at: db291ed
- last-touched: 2026-05-18
- caveat: Two distinct bugs surfaced on the same run. (1) Source-of-truth: `.claude/skills/changelog/changelog.mjs` reads `git log` since the last release tag and classifies each commit; but Phase 11.5 runs BEFORE `/commit`, so the upcoming commit's content is in the working tree / staged index, not in `git log`. The actuator should read `git diff --staged` (or `git diff HEAD` plus `git ls-files --others --exclude-standard` for new files) and classify based on the diff + conventional-type the impending commit will use, OR read the prepared commit message from a known location (e.g., the `/commit` skill could write its drafted message to `.claude/state/commit_draft/<slug>.message` before invoking the changelog actuator). (2) Placement: even when the actuator picks the right content, it appended `### Added` ABOVE `## [Unreleased]` rather than under it — likely a regex bug in `unreleased-writer.mjs → appendUnderUnreleased`. The branded-cli-tui workflow worked around both manually by editing CHANGELOG.md after the actuator wrote. Test corpus needed: (a) a workflow that adds a feat commit AND the previous HEAD is already released-pending (the common case), (b) a workflow where the previous commit's content is already described under `[Unreleased]` (don't duplicate). The `golden-path_test.sh` test passes because it simulates a clean state where HEAD == base, which doesn't reproduce either bug.
