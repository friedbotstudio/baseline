# Codebase Scout Report — branch-aware git consent policy

## Primary touchpoints

### Hooks (Bash + python3-via-Bash; sourcing lib/common.sh)

- `.claude/hooks/git_commit_guard.sh:60` — `FORBIDDEN_RE`. `\bgit\s+push\b` lives here. This is the literal that must change from unconditional-hard-block to branch-aware policy.
- `.claude/hooks/git_commit_guard.sh:51-57` — Bash-leg fast-path: matches commands beginning with `git ` and bails otherwise. New branch-policy logic plugs in after the FORBIDDEN_RE check, before line 66's `git commit` short-circuit. Push handling needs its own branch starting where line 60's regex currently absorbs it.
- `.claude/hooks/git_commit_guard.sh:23-49` — Write-leg dispatcher. The `case "$rel"` table (line 36) names every state file the guard mediates; a new arm for `.claude/state/push_consent` belongs here, plus a `block_marker_self_write` call for `CONSENT_MARKER_PUSH_REL`.
- `.claude/hooks/git_commit_guard.sh:70-93` — Commit-consent enforcement (TTL read from `project_get .consent.commit_ttl_seconds`, default 300, single-use deletion at line 326 of common.sh). This is the exact pattern to copy for push-consent enforcement.
- `.claude/hooks/consent_gate_grant.sh:33-38` — UserPromptSubmit fast-path glob. The three current arms (`/approve-spec`, `/approve-swarm`, `/grant-commit`) live in a `case "$HOOK_PAYLOAD" in` block; add a fourth `*'"prompt":'*/grant-push*) ;;` glob.
- `.claude/hooks/consent_gate_grant.sh:59-87` — Per-command regex dispatch. The `/grant-commit` arm at line 79 is the model: `^/grant-commit([[:space:]].*)?$`, optional note capture, atomic marker write with `write_marker_atomic "$CONSENT_MARKER_COMMIT" "$NOW" "$note"`. The new `/grant-push` arm mirrors this exactly with `CONSENT_MARKER_PUSH` and identical shape.
- `.claude/hooks/lib/common.sh:232-243` — Marker path constants. Three current (`CONSENT_MARKER_SPEC`, `CONSENT_MARKER_SWARM`, `CONSENT_MARKER_COMMIT`) plus their `_REL` siblings. Two new constants needed: `CONSENT_MARKER_PUSH = "$STATE_DIR/.push_consent_grant"` and `CONSENT_MARKER_PUSH_REL = ".claude/state/.push_consent_grant"`.
- `.claude/hooks/lib/common.sh:260-275` — `block_marker_self_write` helper. Already gate-agnostic — `block_marker_self_write "$rel" "$CONSENT_MARKER_PUSH_REL" "Git Commit Guard" "/grant-push"` works as-is.
- `.claude/hooks/lib/common.sh:286-328` — `validate_consent_marker` helper. The epoch-only branch (line 302-305) matches the commit marker shape exactly; the new push marker reuses it unchanged.

### Commands

- `.claude/commands/grant-commit.md` — The model template (20 lines, allowed-tools, disable-model-invocation, structural-handshake prose). New file `.claude/commands/grant-push.md` mirrors this exactly, swapping commit→push and `.claude/state/commit_consent` → `.claude/state/push_consent`.
- No `src/commands/` directory exists — commands are not currently templated; they ship verbatim from `.claude/commands/`. The new `grant-push.md` ships the same way (manifest picks it up; no `src/` template needed).

### Config schema (`project.json`)

- `.claude/project.json:187-190` — `consent.commit_ttl_seconds: 300` and `consent.gate_marker_ttl_seconds: 120`. New key `consent.push_ttl_seconds` (default 300) belongs here as a sibling.
- `.claude/project.json` has no `git.*` block today. The new `git.protected_branches` (glob list, default `null`) and `git.branch_pattern` (regex string, default `null`) introduce a new top-level `"git"` object alongside `"consent"`, `"tdd"`, `"destructive"`, etc.
- `src/project.template.json` — Pristine seed shape. Must mirror the new keys (with `configured: false` invariant preserved per audit line 372).

### Governance docs

- `CLAUDE.md:156-174` — Article VII (Git rules). Lines 158-167 enumerate forbidden ops; line 169 names `git push` in the "SHALL NEVER unless the user names" list. This is the **direct site of Q-004's textual divergence** — the article's "unless named" carve-out contradicts the hook's unconditional block. The new policy makes the prose tractable: replace the carve-out with "subject to `git.protected_branches` policy; see Article VIII".
- `CLAUDE.md:184` — Article VIII hook table row for `git_commit_guard`. Behavior column needs rewording from "Bash: require fresh consent for `git commit`; hard-block forbidden flags" to reflect branch-aware policy + new `/grant-push` gate.
- `CLAUDE.md:203` — Article VIII row for `consent_gate_grant`. List of detected commands expands from three to four.
- `CLAUDE.md:78-83` — Article IV "Phase 6c and Phase 11 are git-conditional" + "How the gates are structurally enforced". The gate enumeration enlarges by one (`/grant-push`).
- `CLAUDE.md:295` — Appendix A path table entry for `.claude/state/`. New state file `push_consent` belongs in the inline runtime list.
- `CLAUDE.md:327` — Appendix B Skill index "Alternate tracks" doesn't change; commands are not in Appendix B but the "Reserved consent gates" prose elsewhere may need a count bump.
- `docs/init/seed.md:149` — §4 hook table row for `git_commit_guard`. Same wording change as CLAUDE.md Article VIII.
- `docs/init/seed.md:168` — §4 hook table row for `consent_gate_grant`. Updated to name four detected commands.
- `docs/init/seed.md:255` — §4.4 commands table. Add a `grant-push` row.
- `docs/init/seed.md:275` — §4.5 state-file ↔ gate ↔ guard table. Add a `push_consent` row.
- `docs/init/seed.md:318` — §5 phase enumeration prose. The `11 /grant-commit — human consent gate C` line stays correct (gate C is unchanged); `/grant-push` is orthogonal to phase progression (it's a Bash-time consent, not a workflow phase).
- `docs/init/seed.md:333` — §6 (Consent model). This is the natural home for "branch-aware policy" prose — describe the protected_branches glob, the branch_pattern regex, and how the four consent commands fit.
- `docs/init/seed.md:342` — §6 commands-to-consent table. Add `/grant-push`.
- `docs/init/seed.md:456-475` — §11 (Git rules). Line 464 is the **other site of Q-004 divergence** — the "forbidden unless the user names" wording for `git push`. Same rewording as CLAUDE.md Article VII.
- `docs/init/seed.md:493` — §13 (Rebuild protocol).
- `docs/init/seed.md:528-529` — §13 smoke-test list. Line 529 ("Attempt `git push` → hard-blocked regardless of consent") must change: split into "on protected branch without /grant-push → denied" + "on non-protected branch → allowed".
- `src/CLAUDE.template.md:71, 80, 88, 98, 163, 169, 184, 203, 295, 327` — byte-equal mirror of CLAUDE.md. Every governance edit lands here in lockstep.
- `src/seed.template.md:143, 149, 168, 245, 255, 275, 318, 327, 342, 354, 360, 464, 528-529` — byte-equal mirror of seed.md.

### Audit-baseline accounting

- `.claude/skills/audit-baseline/audit.sh:68` — `EXPECTED_COMMANDS = {"approve-spec", "approve-swarm", "grant-commit", "init-project"}` → add `"grant-push"`.
- `.claude/skills/audit-baseline/audit.sh:174` — `cmds_claimed` regex: `three\s+consent\s+gates?\s*\+\s*one\s+bootstrap` produces 4. Update to a regex that produces 5 (e.g., `four\s+consent\s+gates?\s*\+\s*one\s+bootstrap`), or generalize.
- `.claude/skills/audit-baseline/audit.sh:514-552` — `expected_paths` list checked against `project.json`. New rows: `consent.push_ttl_seconds`, `git.protected_branches`, `git.branch_pattern`.
- `obj/template/manifest.json` — Generated by `scripts/build-manifest.mjs`. The new `.claude/commands/grant-push.md` is auto-picked-up via the recursive `collectFiles` walk at line 12; no script change needed. The manifest will include its sha256 after `npm run build`.

### Tests

- `tests/git-commit-guard-regex.test.mjs` — Node test runner. Already parses the live `FORBIDDEN_RE` out of the hook and exercises it through python3. The fix here will tighten `FORBIDDEN_RE` (remove `\bgit\s+push\b`) — every existing case must be revisited (push-positive cases either remove or move to a new branch-policy test).
- No existing test covers `consent_gate_grant.sh` end-to-end. The harness convention (per `tests/harness_continuation.test.mjs`) is to drive the hook with a synthetic stdin JSON payload and assert on filesystem side-effects.
- `tests/spec-lint-design-calls.test.mjs` and friends are the model for "drive a hook with payload, assert side-effects" if the new branch-policy logic needs its own test.

## Entry points that reach this code

- **Bash leg** of `git_commit_guard`: `PreToolUse` event with `tool_name = "Bash"` and a `git ...` command. Wired in `.claude/settings.json:10` and `:21` (two PreToolUse arrays — one Bash-only, one for the full Write|Edit|MultiEdit set).
- **Write leg** of `git_commit_guard`: `PreToolUse` event with `tool_name ∈ {Write, Edit, MultiEdit}` and `file_path` matching `.claude/state/commit_consent` or `.claude/state/.commit_consent_grant`. Same wiring at `.claude/settings.json:21`.
- **Input boundary** of `consent_gate_grant`: `UserPromptSubmit` event on every user turn. Wired in `.claude/settings.json:41`.
- **Slash command**: User types `/grant-commit` (today) / `/grant-push` (new). The command's body executes in Claude's tool environment after the UserPromptSubmit hook has already written the marker.

## Existing tests

- `tests/git-commit-guard-regex.test.mjs` — passing on HEAD. Authoritative on `FORBIDDEN_RE` behavior. **Will need substantial rework** when `\bgit\s+push\b` is removed from the regex — `git push` test rows (lines 47-48 and 52) move out of the "must match" set.
- `tests/harness_continuation.test.mjs` — model for hook-payload-driven tests.
- `tests/skill-ownership.test.mjs`, `tests/manifest.test.mjs`, `tests/template-drift.test.mjs` — these will need to keep passing after the new files land; the manifest test in particular asserts the install tree is in sync.
- `.claude/hooks/tests/memory_session_start_test.sh` — only hook-side shell test today; the model if a Bash-side test for `git_commit_guard`'s new branch detection is wanted.
- No test currently exercises `consent_gate_grant.sh` directly.

## Constraints and co-changes

- **Byte-equal `src/` mirroring.** `audit-baseline` line 611-616 asserts `src/CLAUDE.template.md` mirrors Article X.2; the same byte-equal expectation extends to every Article touched. `src/seed.template.md` similarly mirrors §17 (line 380-394) and by convention every section.
- **Headline-count drift detector** (audit.sh §642-833). The two relevant claims:
  - "three consent gates" / "four consent gates" appears in seed.md and CLAUDE.md prose. Bumping to four-consent-gates in both files is required so the count claim still resolves.
  - `cmds_claimed` (line 174) decodes "three consent gates + one bootstrap" → 4. Update the regex AND the seed text together.
- **Article XI integrity citation** (audit.sh §268-280) requires `## Article XI` heading in CLAUDE.md and `## §17` heading in seed.md, both with the literal `manifest`. No change to citation content; preserve verbatim.
- **Lib helper unforgeability** (lib/common.sh:260-275) — every new consent marker MUST pass through `block_marker_self_write` in the Write leg, or Claude could create the marker itself and self-grant push consent. Easy to miss; the spec MUST list this as an AC.
- **Detached HEAD** — `git rev-parse --abbrev-ref HEAD` returns the literal string `HEAD` on detached checkout. The branch-policy code MUST decide one behavior for this case explicitly (currently undefined; intake names this as Open question).
- **Empty repo / no commits yet** — `git rev-parse --abbrev-ref HEAD` returns the branch name from `.git/HEAD` ref even before the first commit, so this case behaves the same as a normal branch. Fine.
- **Two PreToolUse settings.json entries.** The Bash leg and Write leg of `git_commit_guard` are wired separately (`.claude/settings.json:10` is Bash-only, `:21` is the broader write set). Both run the same script; the script's TOOL dispatch at line 24-49 routes. No settings.json change needed for this feature.
- **TTL TTL convention.** `consent.commit_ttl_seconds=300` (Bash-leg consent), `consent.gate_marker_ttl_seconds=120` (Write-leg marker — the seam between UserPromptSubmit and the write of the state file). New `consent.push_ttl_seconds` parallels commit_ttl_seconds; the new `.push_consent_grant` marker reuses `gate_marker_ttl_seconds` (same Write-leg lifetime).
- **Seed section numbering correction (vs intake).** The intake referenced "seed.md §6/§13/§14"; the real touchpoints are §4 (hook + commands + state-file tables), §6 (Consent model), §11 (Git rules), §13 (Rebuild protocol — smoke tests). Spec phase MUST use the correct numbering.

## Patterns in use here

- **Hooks are bash + python3-via-Bash**, never jq. `payload_get`, `project_get`, `emit_block`, `emit_allow`, `log_line` are the shared idioms (see `lib/common.sh:32-150`). The new branch-detection logic shells to `git rev-parse --abbrev-ref HEAD` directly; matching globs goes through python3 (`fnmatch.fnmatchcase`, already used at `lib/common.sh:158-178` for `path_matches_globs`).
- **All consent markers are written ONLY by `consent_gate_grant.sh`** (UserPromptSubmit, outside Claude's tool boundary). The unforgeability is structural, not cryptographic.
- **Markers are single-use**: `validate_consent_marker` calls `rm -f "$marker"` at line 326 on every allowed write. The Bash-leg consent token (`commit_consent`) is multi-use within its 300s TTL; push_consent follows the same pattern (multi-use within `push_ttl_seconds`).
- **Atomic marker writes** via `write_marker_atomic` (consent_gate_grant.sh:48-57) — temp file + `mv -f`. The new `/grant-push` arm reuses this helper as-is.
- **Slug-matched markers for approval gates** (spec, swarm) carry the slug on line 1; **epoch-only markers for consent gates** (commit, future push) carry only the epoch on line 1, optional note on line 2. The asymmetry is correct — approvals are spec-scoped, consents are session-scoped.
- **Default-`null` semantics.** Several config knobs use `null` to mean "behave as if the feature is off" (e.g., `lint.cmd: null`). `git.protected_branches: null` and `git.branch_pattern: null` should follow this convention — `null` MUST NOT mean "empty list" (which would invert the policy).

## Risks / landmines

- **Self-blocking via the literal-string false-positive.** The current `FORBIDDEN_RE` matches the literal strings "git push" / "git config" / etc. anywhere in a Bash command, including inside `grep` patterns or `python3 -c` source. Already documented as Q-003. The branch-policy fix tightens the push leg (so `git push` outside the actual command position is no longer matched there), but the other forbidden ops still over-match. Q-003 stays open; this work is not its remediation. **Note for the spec author**: scout itself just tripped the false-positive while running `grep -n "git push\|git config\|..."`, and worked around with python3.
- **Two-file governance drift.** `CLAUDE.md` and `src/CLAUDE.template.md` must move in lockstep; `seed.md` and `src/seed.template.md` likewise. The audit's count-claim sweep will FAIL if either side drifts. The spec must list paired writes as a single AC pair, not as two independent items.
- **Manifest rebuild.** `scripts/build-manifest.mjs` walks `obj/template/` (the rsync'd template root). The build pipeline (`scripts/build-template.sh`) is what populates that tree. New files land in the manifest automatically once `npm run build` runs; the spec must call out "regenerate manifest after touching command/hook files" so CI doesn't drift.
- **The `obj/template/` tree is generated.** Files there are NOT edited directly — they're a build product of `scripts/build-template.sh`. The scout located `obj/template/.claude/commands/grant-commit.md` (the installed copy); the canonical source is `.claude/commands/grant-commit.md`. No edits to `obj/`.
- **`docs/init/seed.md` §13 smoke-test list is executable documentation.** Step 5 ("Attempt `git push` → hard-blocked regardless of consent") is the smoke-test the next dogfood install runs. It MUST be updated, or fresh installs will surface a contradiction.
- **The Q-004 entry's `Verified-at: 1feee24`** is now stale (HEAD is 062ca30). The memory entry will need re-verification or deletion as part of the document phase per Article IX.2.
- **`disable-model-invocation: true`** in `.claude/commands/grant-commit.md` line 5 ensures Claude cannot auto-invoke the command. The new `grant-push.md` MUST carry the same flag, or Claude could call `/grant-push` itself and self-grant push consent. Trivial to miss; the spec must list this as an AC.
