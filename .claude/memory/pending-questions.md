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

## Q-007

- Question: Should `.claude/skills/memory-flush/next-q-id.mjs` be added as a landmark in `landmarks.md`?
- Context: surfaced as a candidate during brainstorm-and-codesign Phase 10.6. The file is touched-once this session (low-frequency). landmarks.md is currently over its 500-line size-cap (513 lines), so adding another entry without pruning would extend the violation.
- Options considered:
  - (a) Add the landmark + prune one stale entry from landmarks.md in the same write.
  - (b) Skip landmark addition; the file is small (next-q-id allocator helper) and discoverable by name from `/memory-flush` SKILL.md Step 2.
  - (c) Defer to a dedicated landmarks.md pruning workflow (memory-engine-hardening v2).
- Verified-at: 8436ede
- Last-touched: 2026-05-29

## Q-008

- Question: Should `src/memory/_resume.template.md` be added as a landmark in `landmarks.md`?
- Context: surfaced as a candidate during brainstorm-and-codesign Phase 10.6. The template ships into consumer projects as the resume-snapshot skeleton; it's referenced from `memory_session_start.mjs` and `memory_pre_compact.mjs`. Same over-cap constraint as Q-007.
- Options considered:
  - (a) Add the landmark + prune.
  - (b) Skip (the template is documented in seed.md §4.5 Memory).
  - (c) Defer.
- Verified-at: 8436ede
- Last-touched: 2026-05-29
