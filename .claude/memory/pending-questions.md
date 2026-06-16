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

## Q-009

- Question: Should `.claude/skills/commit/epic_close.mjs` be added as a landmark in `landmarks.md`?
- Context: surfaced as a candidate during the persist-v1-design-pass chore's Phase 10.6 (file shipped in 21556a5; actuates the epic-close fold per seed §18.9 — archives the discovery bundle + merges `closed:true` into epic state, never commits). Deferred rather than promoted because `landmarks.md` is at its 500-line size-cap and force-pruning an unrelated entry inside an off-topic chore was inappropriate. Same over-cap constraint as Q-007/Q-008. The file is self-documenting (header CLI/exit-code contract) and referenced by the commit skill, so nothing is lost by deferring.
- Options considered:
  - (a) Add the landmark + prune the oldest unverified landmark in the same write.
  - (b) Skip (the file is self-documenting; commit skill references it).
  - (c) Defer to a dedicated landmarks.md pruning workflow (resolves Q-007/Q-008/Q-009 together).
- Verified-at: 21556a5
- Last-touched: 2026-06-17
