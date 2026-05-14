---
owners: [any phase]
category: cross-session open questions
size-cap: 500
key: Q-NNN
verifies-against: none
---

# Pending questions

Questions the current session couldn't resolve. Surfaced at next session start so context isn't lost across yields.

Each entry's stable key is auto-numbered `Q-NNN`.

---

## Q-001

- Question: Should phase skills automatically invoke `/memory-flush` at start, or only when the SessionStart hook surfaces a "K candidates pending" nag?
- Raised in: 2026-04-27 memory-system build.
- Blocker for: clean session-start UX vs. interrupting flow.
- Options considered: (a) auto-invoke if pending count > 0; (b) nag only, let user decide; (c) auto-invoke with a "skip" command.
- Verified-at: HEAD
- Last-touched: 2026-04-27

---

## Q-002

- Question: Should the spec phase require an enforceable runtime check (preflight, smoke, or error-mapping AC) for every one-time human prerequisite it identifies — instead of parking it in a Rollout-section bullet?
- Raised in: 2026-05-14 post-release. The release-workflow spec correctly identified "Pages source must be 'GitHub Actions'" in scout, research (Q-E), and spec rollout (line 553), but never wrote an AC for runtime detection. The prerequisite was missed at deploy time; failure surfaced as a misleading Jekyll build log on the repo root rather than a clear "Pages source wrong" message.
- Blocker for: deciding whether to amend the `spec` skill (or CLAUDE.md Article IV phase 4 rules) with a "silent-failure prerequisites require enforcement ACs" clause.
- Options considered:
  - (a) Amend spec skill: every Rollout prerequisite SHALL be paired with either a preflight AC or a smoke-test AC; no bare narrated prerequisites.
  - (b) Add a `spec-rollout-enforceability-review` skill (alongside diagram/traceability reviews) that scans Rollout sections and flags prerequisites without a matching AC.
  - (c) Leave it as judgment; document the heuristic in `conventions.md` instead of binding rule.
- Concrete remediation deferred: bootstrap script (`scripts/bootstrap-pages.mjs` calling `gh api -X PUT /repos/{owner}/{repo}/pages -f build_type=workflow`) and/or a preflight step in `release.yml` that fails fast when `build_type != "workflow"`.
- Verified-at: HEAD
- Last-touched: 2026-05-14

---

## Q-003

- Question: Should the Bash-matcher guards (`git_commit_guard`, `destructive_cmd_guard`, `process_lifecycle_guard`) tokenize the Bash command before pattern-matching, instead of running regexes over the raw command string?
- Raised in: 2026-05-14, during the regex over-match fix in commit `064102d`. The current `git_commit_guard` FORBIDDEN_RE pattern-matches across the whole Bash command string, which has two failure modes: (1) the original bug — paths starting with `.` falsely matched the literal-dot hard-block (fixed by commit `064102d`); (2) a remaining bug — commit messages that legitimately describe any forbidden operation (e.g., "this commit fixes a bug in `git reset --hard` handling") trigger the guard, forcing a `-F /tmp/msg.txt` workaround. Both failure modes share a root cause: regex over command-string is ambiguous about syntactic context (path vs. flag vs. quoted-string).
- Blocker for: deciding whether the next guard hardening pass is regex-tightening (cheap, incremental, still ambiguous) or a proper Bash tokenizer + argv inspection (correct, more code, needs a parser).
- Options considered:
  - (a) Status quo + workarounds: keep the regex, document the `git commit -F <file>` escape hatch in `landmines.md`, accept that operators occasionally rewrite messages.
  - (b) Regex tightening: extend the negative-lookahead approach to every alternative in FORBIDDEN_RE and add anchoring for quoted contexts. Lower bound on false-positives but does not eliminate them.
  - (c) Proper tokenizer: parse the Bash command (e.g., via `bashlex` in Python or a small in-repo tokenizer) into argv, then inspect each `git ...` invocation's argv list. Eliminates the entire false-positive class. Larger change; needs a Python dep or a hand-rolled tokenizer.
- Scope on adoption: applies to every Bash-matcher hook (`git_commit_guard`, `destructive_cmd_guard`, possibly `process_lifecycle_guard`). The decision is shared infrastructure.
- Companion landmine pending: if (a) is chosen, write a `landmines.md` entry capturing the `-F /tmp/msg.txt` workaround for commit messages that mention forbidden git ops.
- Verified-at: 1feee24
- Last-touched: 2026-05-14

---

## Q-004

- Question: Should `git_commit_guard` honor the user-named-operation carve-out for `git push` that CLAUDE.md Article VII grants, or remain a hard structural block on push regardless?
- Raised in: 2026-05-14, after `/grant-commit` with the note "and push" and a follow-up "commit and push" prompt. Article VII reads: "You SHALL NEVER, unless the user names the exact operation in their current request: `git push`, `git push --force`, `--force-with-lease`, ..." — i.e., push is permitted when the user explicitly names it. The hook's FORBIDDEN_RE pattern-matches `\bgit\s+push\b` unconditionally and emits a hard block, with no inspection of the user's prompt context (it can't see prompts; it sees Bash commands). Result: the constitution allows what the hook forbids. Workaround used in this session: user types `! git push origin main` to run push outside Claude's tool boundary.
- Blocker for: deciding whether push should remain Claude-impossible (force the human-in-the-loop step every push) or whether the hook should accept a session-scoped consent marker similar to `commit_consent` so push becomes a gateable operation.
- Options considered:
  - (a) Status quo: keep the hard block. Push always requires `! git push` from the user. Rationale: pushing is irreversible (touches the remote) and the friction is a feature; the user-shell `!` prefix is an explicit "I am taking responsibility" signal. Two-line CLAUDE.md amendment to acknowledge the divergence: "Article VII permits push when named; `git_commit_guard` enforces a stricter rule (always-block) intentionally."
  - (b) Add a `push_consent` gate: introduce `/grant-push` (alongside `/grant-commit`) that writes `.claude/state/push_consent` with a short TTL; the hook allows push when the token is fresh. Symmetric with the commit-consent pattern; preserves the "user explicitly named" requirement structurally; eliminates the `!` shell workaround. Cost: another consent gate to wire (UserPromptSubmit hook + Bash matcher leg).
  - (c) Inspect the prompt: have `consent_gate_grant` (UserPromptSubmit) write a `.push_grant` marker when it detects "and push" / "push" in the user's `/grant-commit` arguments, and have `git_commit_guard` honor that marker for the next push. Cheaper than (b) but couples push to commit-consent semantics in a non-obvious way.
  - (d) Drop the hook block; trust Article VII enforcement at the model layer. Lowest friction; loses the structural guarantee that push can never happen by accident. Probably wrong for a baseline; recorded for completeness.
- Constitutional implication: Article VII and Article VIII currently disagree about push. Either Article VII should be tightened to "push is never allowed by Claude; always use `! git push`" (matching the hook), or Article VIII's hook spec should be loosened to allow a consent-gated push path (matching the constitution). The disagreement is the bug.
- Verified-at: 1feee24
- Last-touched: 2026-05-14

