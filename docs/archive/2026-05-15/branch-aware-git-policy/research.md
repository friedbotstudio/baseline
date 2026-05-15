# Pattern Research — branch-aware git consent policy

This memo answers the five Open questions in `docs/intake/branch-aware-git-policy.md`. Decisions are deferred to `/spec`; this memo lays out the option space.

## Prior art surveyed

- **Git's own ref pattern semantics** (`/git/htmldocs` via context7). `git rev-parse --branches=<pattern>` and `git rev-parse --glob=<pattern>` accept shell-glob patterns: `?`, `*`, `[`. If a pattern contains none of those characters, git prefix-matches by appending `/*`. Push refspecs use the same `*` wildcard; negative refspecs start with `^`. This is git's canonical refname-matching grammar.
- **GitHub branch protection rules** (visible in repo settings; not in context7 with a clean separate ID, but referenced inside `/git/htmldocs` examples). Uses the same shell-glob style — `main`, `release/*`, `feat/**`. The `**` means "any depth"; single `*` does not cross `/`. GitHub's UI calls this "fnmatch-style".
- **pre-commit framework** (`/pre-commit/pre-commit.com` via context7). Does NOT model branch-scoped policy. Uses `stages: [pre-commit, pre-push]` to gate by git event, and `files: <regex>` / `exclude: <regex>` to gate by file path. Branch identity is not a first-class concept. So pre-commit is **weak prior art** for our problem; its `stages` model maps to our pre-existing distinction between commit-time and push-time consent, not to branch matching.
- **Existing helper** (`.claude/hooks/lib/common.sh:158-178` `path_matches_globs`) — already uses Python `fnmatch.fnmatchcase`, with manual `**` recursion via regex. This is the in-repo precedent for glob matching against project.json-configured patterns.

The strongest signal: **git itself uses shell-glob refname patterns**, and that's also what GitHub branch protection and `git rev-parse --branches=` accept. Diverging from that grammar inside a git-adjacent tool would surprise users.

---

## Q(a) — Glob matcher engine for `git.protected_branches`

### Candidate A1 — Python `fnmatch.fnmatchcase` (extend existing helper)

- **Summary**: Reuse `lib/common.sh:155-178` `path_matches_globs` (or a near-clone for branch names). Already in tree, already passes audits.
- **API references (current)**: Python 3 stdlib `fnmatch.fnmatchcase(name, pattern)` — `*` matches anything except `/` in our path use (handled manually via regex); for branch names we'd treat the branch as a whole string and `*` matches anything. **Source**: in-repo precedent at `lib/common.sh:158-178`. Standard library; no version pinning needed.
- **Fits**: Yes — same Python-via-Bash idiom already used by every hook.
- **Tests it enables**: `git_commit_guard` Bash-leg unit tests can shell to the matcher and assert PASS/FAIL classification — same shape as the existing `tests/git-commit-guard-regex.test.mjs`.
- **Tradeoffs**: Python `fnmatch` treats `*` as "any string" (no path-separator special handling) unless you implement it. For branch names this is actually correct — `feat/*` should match `feat/foo` and `feat/foo/bar` IF the user intended a prefix, OR only `feat/foo` IF they wanted depth-1. Git's own grammar resolves this by NOT treating `/` specially in `*` and requiring users to use `**` for "any depth" explicitly. Default Python `fnmatch` matches git's behavior naturally (no `/` carve-out).

### Candidate A2 — Bash-native `case "$branch" in $glob)`

- **Summary**: Use Bash's built-in pathname expansion as the matcher. No Python shell-out per call.
- **API references**: POSIX shell pattern matching, Bash 3+. `*`, `?`, `[...]` work; `**` does NOT (Bash globstar is opt-in via `shopt -s globstar` and only affects pathname expansion, not `case` patterns).
- **Fits**: Partially — every other matching call in `lib/common.sh` already goes through Python; introducing a bash-only path is a minor inconsistency.
- **Tests it enables**: Trivial via the same hook-payload test harness.
- **Tradeoffs**: Faster (no python3 fork per check), but loses `**` semantics. The `feat/*` glob means "matches `feat/anything` including slashes" in Bash `case`, which is actually what users want for branch protection. `release/*/rc` works as expected. But: each pattern from project.json must be expanded into the `case` statement; you can't drive `case` with a runtime-built pattern list as cleanly as Python's loop.

### Candidate A3 — Git's own pattern grammar via `git check-ref-format` + shelling

- **Summary**: Treat patterns as refspecs; shell to `git for-each-ref --shell <pattern>` to test inclusion.
- **API references**: `git rev-parse --branches=<pattern>` (per context7 lookup above) — shell-glob semantics; non-glob patterns get `/*` appended.
- **Fits**: No — `git rev-parse --branches=<pattern>` returns matching refs from disk, not "does this string match this pattern" as a pure predicate. Inverting it (passing the current branch and asking "does this pattern match this branch") is awkward; you'd need `git rev-parse --branches=<pattern>` and check if the current branch is in the result, which couples policy to ref existence.
- **Tradeoffs**: Most "git-native" feel; reuses git's exact grammar. But the predicate inversion + the extra subprocess per check are real costs, and the coupling to ref existence is a footgun (a glob like `release/*` would only match branches that already exist on disk).

### Recommendation

**A1 (Python fnmatch via the existing helper).** Two reasons: (1) it's the in-repo precedent — `path_matches_globs` already shows the pattern, the same audit passes already cover this idiom; (2) the semantics happen to match git/GitHub conventions (`*` matches across `/`, `**` is the recursive form). A2 is a reasonable second if subprocess cost matters, but the cost is negligible for the once-per-Bash-command call site. A3 is wrong-shape.

**What would flip the decision**: a hard requirement that `*` MUST NOT cross `/` (depth-1 only) would push toward writing a custom matcher; nothing in the intake suggests that requirement.

---

## Q(b) — Detached HEAD policy

When `git rev-parse --abbrev-ref HEAD` returns the literal string `"HEAD"`, branch identity is undefined for policy purposes.

### Candidate B1 — Always-protected (fail-safe)

- **Summary**: Treat `HEAD` as if it matched every protected glob. Commits require `/grant-commit`, pushes require `/grant-push`.
- **Fits**: Aligns with the user's stated invariant ("every commit on a protected branch is consented") under the most cautious reading.
- **Tradeoffs**: An automation that explicitly detaches HEAD (e.g., a CI pipeline doing `git checkout <sha>` to inspect history, then making no commits) is unaffected. An automation that detaches and then commits would hit consent friction — but this case is rare and almost always a misuse.

### Candidate B2 — Always-unprotected (automation-friendly)

- **Summary**: Treat `HEAD` as if it matched no glob. Commits and pushes proceed without consent.
- **Fits**: Aligns with the "automation should be frictionless on non-protected state" thread.
- **Tradeoffs**: Opens a hole: a user could `git checkout <main-sha>` to detach, then `git commit` + `git push` without consent — pushing the new commit to `main` is still rejected by git (you can't fast-forward an attached `main` to a commit not on main's branch history without a force), but the agent's safety guarantees stop applying. The risk is small in practice but real.

### Candidate B3 — Block all writes (refuse-to-act)

- **Summary**: Detached HEAD → emit an explicit error message: "Detached HEAD; check out a branch first." Refuse to evaluate the policy.
- **Fits**: Forces the operator to fix the state before continuing. No silent fallthrough.
- **Tradeoffs**: Most defensible — converts an ambiguous case into an explicit failure mode. But it disrupts workflows that legitimately want to operate on a detached HEAD (e.g., bisecting; though bisect itself doesn't usually need commits).

### Recommendation

**B1 (always-protected).** Matches the user's stated invariant and the constitutional default-strict posture (`protected_branches: null` → everything protected). B3 is purer but adds a new failure mode for a case most users will never encounter — the cure is worse than the disease. B2 is wrong by the invariant.

**What would flip the decision**: a confirmed use case where Claude needs to operate on a detached HEAD with no consent.

---

## Q(c) — `branch_pattern` violation mode

When `git.branch_pattern` is set and the current branch doesn't match.

### Candidate C1 — Hard-block commits only

- **Summary**: Off-pattern branches refuse `git commit`. Push behavior is governed by `protected_branches` only.
- **Fits**: Matches the intake's drafted behavior (AC #8). Minimal scope; the pattern enforces "named branches must follow convention" at the most expensive boundary (the new commit, which creates project state).
- **Tradeoffs**: Allows pushing an already-existing off-pattern branch — the user can `git push <off-pattern>` if it's already on disk with prior commits. May actually be desired for cleanup workflows.

### Candidate C2 — Hard-block commits AND pushes

- **Summary**: Off-pattern branches refuse both. The branch is effectively read-only as far as Claude is concerned.
- **Fits**: Stronger invariant; the branch-name discipline applies symmetrically.
- **Tradeoffs**: Cleanup workflows (e.g., "I named this badly, let me push the rename") become harder. The user can always `! git push` outside Claude's boundary, so the friction is not catastrophic.

### Candidate C3 — Advisory warn on commit (no block)

- **Summary**: Emit a warning via `emit_info` to stderr; allow the operation. The user opts into stricter behavior with a future `branch_pattern_mode: "strict"` knob.
- **Fits**: Lowest-friction migration path for users adopting branch naming after the fact.
- **Tradeoffs**: Adds a second config knob (mode), and the warn-only path means the invariant isn't actually enforceable — defeats the point of having a hook in the first place.

### Recommendation

**C1 (block commits only).** The asymmetry mirrors how teams actually work — naming discipline matters when a branch is being created and committed to; once it exists, pushes are routine. C2 is the maximalist position and worth holding in reserve; C3 muddles the contract.

**What would flip the decision**: a strong demand for total enforceability (C2) or a strong demand for soft-onboarding (C3) from the user. Neither was stated.

---

## Q(d) — `/grant-push` combined-with-commit semantics

### Candidate D1 — Strictly separate commands

- **Summary**: `/grant-push` writes only `.push_consent_grant`; `/grant-commit` writes only `.commit_consent_grant`. The user types both commands in one prompt to grant both; `consent_gate_grant`'s UserPromptSubmit hook detects each independently and writes both markers.
- **Fits**: Symmetric with the existing `/approve-spec` + `/approve-swarm` separation. Matches the "exactly one command per gate" invariant in Article IV.
- **Tradeoffs**: Two commands to type when both are needed. Mitigated by the UserPromptSubmit hook running once per turn — typing `/grant-commit\n/grant-push\nproceed` writes both markers in one shot.

### Candidate D2 — Combined `/grant-push` with `--also-commit` or trailing flag

- **Summary**: `/grant-push --commit` (or similar argument convention) grants both. A single command for the common case.
- **Fits**: Convenient. But adds command-level parsing that the current `consent_gate_grant.sh:79-87` regex doesn't anticipate (it only captures an optional note).
- **Tradeoffs**: Argument parsing in shell regex is fragile; introduces a third command shape (epoch-only, slug-matched, combined) where today there are two. More moving parts for marginal ergonomic gain.

### Candidate D3 — Implicit "grant-commit also grants push if both are about to be needed"

- **Summary**: `/grant-commit` writes both markers when the request includes "and push" (currently a free-form note). The hook parses the note for the substring "push".
- **Fits**: Matches the prompt observed in Q-004's history (`/grant-commit` followed by "and push"). Zero new commands.
- **Tradeoffs**: Implicit, fragile (substring sniff), and conflates two consent decisions. The user already documented this option in Q-004's option (c) and judged it "couples push to commit-consent semantics in a non-obvious way." Skip.

### Recommendation

**D1 (strictly separate).** Symmetric with the existing gates, no new command grammar, and the multi-marker write happens naturally via the UserPromptSubmit hook running once per turn. The user's existing workflow ("type /grant-commit and push") becomes ("type /grant-commit and /grant-push") — one more token, much clearer contract.

**What would flip the decision**: explicit user preference for one combined command.

---

## Q(e) — Audit accounting shape for `push_consent`

### Candidate E1 — No explicit state-file tracking; rely on project.json key check

- **Summary**: `.claude/skills/audit-baseline/audit.sh` already verifies `project.json` keys (`expected_paths` at line 515-543). Adding `consent.push_ttl_seconds`, `git.protected_branches`, `git.branch_pattern` to that list — plus `grant-push` to `EXPECTED_COMMANDS` at line 68 — is sufficient. The state file itself (`push_consent`) is runtime state; runtime state isn't audited today (the audit covers source-tree shape, not transient `.claude/state/` contents).
- **Fits**: Yes — the audit's current grain is "do the expected source files exist with the expected shape." Runtime state files (`commit_consent`, `spec_approvals/*.approval`, `swarm/<slug>.json`) are not enumerated in audit expectations. Adding `push_consent` to the audit would invent a new accounting category.
- **Tradeoffs**: The audit can't verify that the new state file ever gets written — only that the code that writes it exists. Acceptable: that's the audit's grain by design.

### Candidate E2 — Add a runtime-state-file enumeration to the audit

- **Summary**: New audit check that scans `.claude/state/` against an expected list of well-known files (`commit_consent`, `last_test_result`, `workflow.json`, plus the new `push_consent`).
- **Fits**: Partial — the audit would need to tolerate absence (these files are runtime-created, not source-tree shape), which makes the check toothless ("file may or may not exist, here's the list of known names").
- **Tradeoffs**: Adds audit surface for no enforcement gain. Skip.

### Recommendation

**E1 (project.json key check + EXPECTED_COMMANDS bump only).** Three concrete audit edits:
1. `EXPECTED_COMMANDS` (line 68) gains `"grant-push"`.
2. `cmds_claimed` regex (line 174) updated from "three consent gates + one bootstrap" to "four consent gates + one bootstrap" — paired with the same text update in `seed.md` and `CLAUDE.md`.
3. `expected_paths` (line 514-543) gains three new rows: `consent.push_ttl_seconds`, `git.protected_branches`, `git.branch_pattern`.

The runtime state file `push_consent` is left implicit (matches how `commit_consent` is treated today).

**What would flip the decision**: a separate request to expand audit grain to runtime state. Not in scope here.

---

## Open questions for the spec author

- **Glob library footprint.** The recommended A1 (Python fnmatch) means the new branch-matching call site shells to `python3`. Each `git commit` / `git push` Bash invocation triggers an extra subprocess. On macOS, python3 cold-start is ~50ms. Acceptable for an interactive flow; the spec should NOTE this and decide whether to factor into a single python3 invocation that does both the branch read and the policy decision.
- **Glob semantics tie-break.** If we adopt A1, do we want `**` for any-depth? Python `fnmatch` doesn't special-case `**`; `feat/*` matches `feat/foo/bar` already because `*` is "any string." So `**` is unnecessary in this grammar. Document this in the spec to avoid confusion with GitHub branch protection's `**` syntax (which DOES special-case it).
- **Detached-HEAD test coverage.** The B1 recommendation should be exercised in `tests/git-commit-guard-regex.test.mjs` (or a new sibling) with a synthetic `HEAD` return.
- **`branch_pattern` test cases.** C1's "block commit, allow push" asymmetry should have explicit test cases for both directions on the same off-pattern branch.
- **TTL alignment.** Scout flagged that `consent.commit_ttl_seconds=300` and `consent.gate_marker_ttl_seconds=120`. The new `consent.push_ttl_seconds` defaults to 300 (matching commit), and the new `.push_consent_grant` marker reuses `gate_marker_ttl_seconds` (matching the other markers). Confirm in spec.
- **Q-003 interaction.** Closing Q-004 leaves Q-003 (Bash-matcher regex over-match) open. The spec author should consider whether tightening `FORBIDDEN_RE` to drop the `git push` leg is a partial Q-003 remediation worth claiming — or whether Q-003 stays explicitly open until a full tokenizer pass.
