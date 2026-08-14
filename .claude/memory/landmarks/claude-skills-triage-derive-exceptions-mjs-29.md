---
key: .claude/skills/triage/derive-exceptions.mjs:29
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Foundation — derives a workflow's `exceptions[]` from the chosen track's DAG instead of hand-authoring them. `deriveExceptions(trackNodes, allPhases, internalPhases, authored)` treats a phase with no node in the track as structurally unreachable, therefore excepted; unions that with any authored exceptions, then subtracts the consent gates. Cures the drift class where a phase skill declares a prereq its own track can never satisfy (`integrate` wanting `security` on the chore DAG; `/spec` wanting `research` on the power DAG, which blocked a real spec write).
- Companion: `.claude/skills/triage/SKILL.md` (Step 0 materialization calls it), `.claude/workflows.jsonl` (the track DAGs it reads), `tests/derive-exceptions.test.mjs`, `tests/skill-prereq-contracts.test.mjs` (asserts no skill declares a prereq its track cannot satisfy).
- Caveat: TWO things are deliberately never excepted, and both are load-bearing. (1) `CONSENT_DENY_LIST` (`approve-spec`, `approve-swarm`, `grant-commit`, `commit`) is subtracted last and unconditionally — excepting `approve-spec` would let `track_guard` authorise tdd artifact writes with NO approval token on disk, a gate BYPASS. Nothing in `workflows.jsonl` forces a track to declare a gate node, so a lean or malformed track would silently reach that state; the module fails CLOSED, treating a missing gate node as a malformed track rather than a licence to skip. (2) A track's `internal_phases[]` are conditionals its own skill resolves at RUNTIME (did the trigger fire?) — derivation cannot pre-judge them because at triage time the diff does not exist yet. The phase universe is derived from all tracks, never hardcoded: a static roster would rot the moment a track adds a phase, which is the drift class this module exists to kill.
