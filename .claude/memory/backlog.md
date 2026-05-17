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

## audit-sh-empty-memory-files-ok-2e03

> verbatim (user, 2026-05-17):
> bugfix in audit.sh; an empty memory files is not a point of failure. when we setup a new project, it will always be empty; what we need to check for is that file exist and has proper preemble, we don't care if the files are empty (or have no records as part of audit)

- source: user-instruction
- status: open
- raised-on: 2026-05-17
- raised-in-context: post-backlog-memory-bucket review (no active workflow)
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-05-17
- caveat: The audit check on canonical memory files (in `.claude/skills/audit-baseline/audit.sh`) should assert file existence + valid frontmatter preamble, not record count. New projects legitimately ship empty memory files. Confirm exact failing assertion at scout time; the fix is likely a single condition change.

## init-project-explicit-proceed-confirmation-7cb1

> verbatim (user, 2026-05-17):
> init-project workflow minor improvement. after running init-project, it presents the finding and setup, it must explicitly ask user to proceed and tell it that the project setup is incomplete; some person may run init-project, reads the recommendation and assumes the project is setup (basically need to be more explict)

- source: user-instruction
- status: open
- raised-on: 2026-05-17
- raised-in-context: post-backlog-memory-bucket review (no active workflow)
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-05-17
- caveat: `/init-project` (the command body at `.claude/commands/init-project.md`) currently surfaces recommendations and applied changes in the same message. A reader skimming the output can mistake the recommendation block for completion. Add an explicit "proceed to apply?" gate between findings and the apply step, with copy that makes the incomplete state of the project unmistakable.

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

## tdd-spec-implementation-drift-analysis-6086

> verbatim (user, 2026-05-17):
> need a drift analysis section as part of tdd to ensure what we speced out for, is what is built

- source: user-instruction
- status: open
- raised-on: 2026-05-17
- raised-in-context: post-backlog-memory-bucket review (no active workflow)
- estimated-effort: medium
- verified-at: HEAD
- last-touched: 2026-05-17
- caveat: Add a spec-to-implementation drift reconciliation step in `/tdd` (or as a sibling phase). For each AC and `## Design calls` row in the approved spec, verify the implementation realizes it; surface gaps. Distinct from `/integrate` (which runs the test suite) — this is a structural cross-check between the spec artifact and the diff. Open question for the intake: does this live inside `/tdd` Step 7, run as a new dedicated phase between `/tdd` and `/simplify`, or extend `/integrate`?
