---
owners: [/memory-flush]
category: future-work intent
size-cap: 500
key: <slug>-<4char-hash>
verifies-against: none
stale-exempt: true
---

# Backlog

Future-work intent captured automatically by `memory_stop.mjs`. Curated into this file via `/memory-flush`. Stable key shape: `<8-word-kebab>-<4-char-sha256>`. Entries use `superseded-at:` as the closure trigger (auto-delete on the next `/memory-flush` Step 0a sweep); the body `status:` field disambiguates whether the entry was `picked-up` (taken into a workflow) or `dropped` (decided not to do). Entries are decay-exempt: they do not stale-age regardless of `verified-at:` distance (see the stale-exempt carve-out in `memory_session_start.mjs` and `sweep.mjs`).

---

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
- caveat: Direct-write to `backlog.md` because `memory_stop.mjs` intent-detection didn't fire on this item's prose phrasing — which is itself the evidence the user cites. The intent regex set in `memory_stop.mjs` (anchored line-start patterns like `TODO:`, `next we (should|need to|must)`, `let's also`, `we should also`, `backlog this`, `after this (lands|ships)`) misses descriptive numbered-list items like "1. improved backlog item detection". Scope of follow-up: widen the trigger set toward higher recall while preserving the precision contract from the backlog-memory-bucket intake ("only obvious future-intent phrasings should match; mid-sentence accidental matches should not"); add a test corpus of true-positive sentences from real conversations; consider a second pass at flush-time that lets the curator manually promote anything the hook missed.

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

## changelog-test-fixtures-use-pre-seventeen-entry-phase-shape-5d1a

> assistant-deferral (claude, 2026-05-21):
> The 3 changelog skill test fixtures at .claude/skills/changelog/tests/{idempotent-reentry,golden-path,consent-expired}_test.sh construct workflow.json with the legacy pre-§18 `entry_phase: "intake"` field instead of post-§18 `track_id: "intake-full"`. Tests still pass (changelog skill doesn't read either field — only reads completed[]) but the fixtures don't reflect the post-§18 reality.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-21
- raised-in-context: workflow-extension-via-workflows-json drift analysis Round 6 (post-skill-alignment sweep)
- estimated-effort: trivial
- verified-at: HEAD
- last-touched: 2026-05-21
- caveat: Three files, each with one `"entry_phase": "intake"` line that should become `"track_id": "intake-full"` (and ideally `"skipped_alternates": []` added). Test logic doesn't depend on this field — changelog reads workflow.json → completed[] only. The fixtures work today because they're legal pre-§18 shape; nothing in the test harness exercises the post-§18 shape via these fixtures. Trivial alignment cleanup. Non-blocking.

## triage-skill-md-still-duplicates-workflows-jsonl-canonical-templates-c8f4

> verbatim (user, 2026-05-21):
> shall we perform an drift analysis; my understanding is that triage still has hardocoded tracks

- source: user-instruction
- status: open
- raised-on: 2026-05-21
- raised-in-context: workflow-extension-via-workflows-json drift analysis Round 4 (post-document, pre-archive)
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-05-21
- caveat: After the post-§18 architecture landed, `.claude/skills/triage/SKILL.md` lines 57-71 still carry the four canonical track templates (chore / tdd-quickfix / spec-entry / intake-full) verbatim under a "Reference: canonical track shapes (mirrored in workflows.jsonl)" subheading. The runtime path (seed-tasklist.mjs + materializer) reads `.claude/workflows.jsonl`, NOT these SKILL.md templates — so behavior is correct today. But the source of truth is split: workflows.jsonl is authoritative; the SKILL.md text is a duplicate description. A downstream user editing workflows.jsonl to add a new track or modify ordering will NOT see that reflected in the SKILL.md body. The templates were RESTORED (not kept by design) during /integrate because the N-file enumerating tests in `tests/memory-flush-phase.test.mjs:235-272` parameterize over 8 files including triage SKILL.md and assert each mentions "memory-flush" with archive before + commit after — removing the templates broke 2 tests; restoring them satisfied the assertions. Remediation: (1) rewrite memory-flush-phase.test.mjs to parse `.claude/workflows.jsonl` directly for the canonical tracks (scenario territory, can't be done inside an /implement pass); (2) once those tests pass off workflows.jsonl, remove the "Reference: canonical track shapes" subsection from triage SKILL.md; (3) re-run byte-equivalent + mirror checks. Both edits are ~10 lines total. Until done, the duplication is latent drift; the byte-equivalent migration test catches it as long as someone keeps both in sync.

## workflow-migrator-write-not-atomic-power-loss-corruption-3e91

> assistant-deferral (claude, 2026-05-21):
> Workflow.json migrator at src/cli/workflow-migrator.js:38 writes via writeFile — non-atomic. A process crash, kill signal, or power loss between open and fsync leaves a partially-written workflow.json on disk. The next harness invocation reads a corrupt or truncated file and aborts.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-21
- raised-in-context: workflow-extension-via-workflows-json /security review (LOW finding 1)
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-05-21
- caveat: OWASP A08 / CWE-362 (race condition). Mitigation: use the write-to-temp-then-rename pattern. POSIX rename is atomic on the same filesystem. Code shape: `await writeFile(filePath + '.tmp', body); await rename(filePath + '.tmp', filePath);`. ~3-line change in workflow-migrator.js. Defers risk from "partial corruption" to "rename interrupt" which is recoverable (.tmp file left behind; harness can detect on next preflight and clean). No data loss possible in either case (user can re-run /triage to restart the workflow). Non-blocking; advisory per the /security skill's MEDIUM/LOW → continue rule.

## triage-helper-slug-interpolation-into-bash-subprocess-a720

> assistant-deferral (claude, 2026-05-21):
> Triage SKILL.md instructs Claude to run `node .claude/skills/triage/seed-tasklist.mjs <track_id> <slug>` via the Bash tool. <slug> and <track_id> are substituted by Claude at invocation time. If Claude generates a slug containing shell metacharacters (`;`, `&&`, backticks), the Bash invocation could execute attacker-controlled commands.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-21
- raised-in-context: workflow-extension-via-workflows-json /security review (LOW finding 2)
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-05-21
- caveat: OWASP A03 / CWE-78 (OS command injection). Theoretical: the triage SOP already constrains slug to canonical-kebab via `lib/common.sh → canonical_slug` (strip directory prefix + trailing `.md`); triage classifies and confirms before substitution. Realized exploit requires multiple chained social-engineering steps. Defense in depth options: (a) quote the args in the documented invocation pattern (`node .claude/skills/triage/seed-tasklist.mjs "$track_id" "$slug"`); (b) have triage instruct Claude to assert `[[ "$slug" =~ ^[a-z][a-z0-9-]*$ ]]` before invoking the helper. Either is ~1 SOP line. Non-blocking; advisory.

## auto-summarize-spec-and-surface-open-questions-at-gate-4ab5

> verbatim (user, 2026-05-20):
> can you summarize the spec and present me all the open questions that needs my attention (add this for backlog too, this would be nice feature improvement)

- source: user-instruction
- status: open
- raised-on: 2026-05-20
- raised-in-context: workflow-extension-via-workflows-json /approve-spec consent gate
- estimated-effort: small
- verified-at: HEAD
- last-touched: 2026-05-20
- caveat: When the harness yields at `/approve-spec`, the reviewer often has to manually open three artifacts (intake, research, spec) to find every open question — and across them, the same question can recur under different framings while the spec's own §Open questions list omits items the upstream artifacts already declared. The user surfaced this gap at the workflow-extension-via-workflows-json approve-gate. Proposed automation: a small helper invoked at gate-A yield that (i) reads the slug's intake/research/spec/BRD if present, (ii) extracts every `## Open questions` entry (and equivalents like research's "Open questions for /spec to resolve"), (iii) dedupes by semantic intent, (iv) classifies each as `must-decide-before-approval` (touches load-bearing design choice surfaced in the recommendation pivot or in the spec's §Open questions) vs `settled-in-spec` (spec already picked a default but flagged as decidable) vs `defer-to-tdd` (resolvable at impl time), and (v) emits a tight summary + bucketed question list to the harness yield message. Probably belongs in the harness skill body (an extra step before emitting the yield terminal message when `reason: "yielded at /approve-spec"`) or as a new `spec-summary` skill the harness invokes inline. Tradeoff: more harness-body logic vs cleaner separation in a dedicated skill. Test corpus: any past workflow's approve-gate transcript; verify the extracted question set matches what a human reviewer would surface.

## canonical-track-count-duplicated-across-10-surfaces-9a2b

> verbatim (user, 2026-05-28):
> we missed updating on homepage. proof that our data is still duplicated across different pages

- source: user-instruction
- status: open
- raised-on: 2026-05-28
- raised-in-context: introduce-freeform-track chore — homepage meta-strip stat rendered the old "4 Tracks" because `site-src/_data/baseline.json → tracks.canonical` wasn't bumped alongside the prose mentions
- estimated-effort: medium
- verified-at: HEAD
- last-touched: 2026-05-28
- caveat: The canonical track count lives in 10 places that must stay in sync: `.claude/workflows.jsonl` (live data; the actual track records), `site-src/_data/baseline.json → tracks.canonical` (homepage meta-strip), and 8 hardcoded prose mentions across `README.md` (×2: line 44 + table row), `CLAUDE.md` (Article IV via prose-mention indirectly — no explicit count line today), `src/CLAUDE.template.md` (mirror), `docs/init/seed.md` §18.1 (×2: 7-track set + canonical-four wording), `src/seed.template.md` (mirror), `.claude/skills/triage/SKILL.md` (canonical-track-shape reference paragraph), `site-src/workflows.njk` (frontmatter description + lead + body listing + sub-track count line + "as the canonical N" FAQ), and `site-src/index.njk` (`<h3>`, body, `<title>` SVG label, figcaption "N other tracks", FAQ "N canonical tracks"). Every change adds churn across all 10. The fix: derive the count from `.claude/workflows.jsonl` at build time and surface as a template variable. `site-src/_data/baseline.json` is already eleventy-data; an adjacent `tracks.js` (or extending `baseline.js`) could count selectable Tracks in workflows.jsonl and expose `baseline.tracks.canonical` to the site. Prose mentions that say "five canonical tracks" remain hardcoded — those need a different remedy (templated-prose injection, or an audit check that grep-counts vs the JSON source). At minimum, `baseline.json → tracks.canonical` should be the single template-source, and an audit check should fail when the JSON value disagrees with the actual selectable-track count in workflows.jsonl.

## stale-sh-refs-in-tests-after-mjs-port-7c8e

> assistant-deferral (claude, 2026-05-28):
> 14 npm-test failures persisted across the introduce-freeform-track chore. Root cause: commit 756dd42 ported skill helpers from bash to Node ESM (audit.sh → audit.mjs, render.sh → render.mjs, lint.sh → lint.mjs) but left test files still spawning `bash <skill>/<helper>.sh`. The .mjs files exist; the .sh files don't. The audit-baseline skill's own test PASSES (it runs the audit binary directly via project.json → test.cmd) so the regression was invisible until `npm test` ran the full Node suite.

- source: assistant-deferral
- status: open
- raised-on: 2026-05-28
- raised-in-context: introduce-freeform-track chore — integrate phase surfaced the failures as advisory findings (not verdict-flipping)
- estimated-effort: small
- verified-at: 756dd42
- last-touched: 2026-05-28
- caveat: Affected tests and their failing assertion pattern: `tests/audit-baseline.test.mjs` (test_when_audit_baseline_runs_post_amendment_then_exits_zero, test_when_audit_runs_after_clean_build_then_exits_zero, test_when_baseline_SKILL_md_body_tampered_then_audit_reports_hash_mismatch, test_when_owner_field_removed_from_baseline_skill_then_audit_fails, test_when_baseline_skill_directory_removed_then_audit_reports_baseline_skill_missing, test_when_user_skill_added_then_audit_ignores_it, test_when_section_17_missing_from_seed_then_audit_reports_missing_citation, test_when_owner_field_present_then_value_is_baseline_or_user) — all spawn `bash .../audit-baseline/audit.sh`. `tests/spec-lint.test.mjs` (test_when_spec_lint_runs_on_*) — spawn `bash .../spec-lint/lint.sh`. `tests/spec-render.test.mjs` (test_when_spec_render_runs_with_*) — spawn `bash .../spec-render/render.sh`. One was already fixed inline during this chore (tests/memory-flush-phase.test.mjs:23 + 277, audit.sh → audit.mjs, bash → node). Remediation pattern proven: change AUDIT_SCRIPT path to `.mjs`, change spawnSync('bash', ...) to spawnSync('node', ...). Ideal vehicle: a freeform-track workflow that batches these 14 + checks for any other `*\.sh` references in tests against the actual skill-helper inventory. The freeform-track introduction (this same chore) was designed for exactly this kind of batched residual-debt work.

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
