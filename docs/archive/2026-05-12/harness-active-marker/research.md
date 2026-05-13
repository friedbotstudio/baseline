# Pattern Research — harness-active-marker

The architectural shape is decided (session-scoped marker file + SessionStart cleanup + three-rung hook). This memo addresses the implementation-level questions surfaced by intake/scout.

No third-party library API is introduced by this work — the hook stays bash + python3 stdlib (`os`, `json`, `time`); the tests stay on `node:test` + `node:fs/promises` + `node:child_process`, all already in use. No context7 lookups required (verified against existing `tests/harness_continuation.test.mjs:1-60` fixture pattern, which already imports exactly these stdlib modules).

## Q1 — Write ordering of marker vs harness_state

The hook reads marker first (cheap `[ -f ... ]`), then `harness_state` (file read + JSON parse). With two writes-per-tick (marker create/delete + harness_state write), partial-failure modes differ by order.

### Candidate A1: marker FIRST, harness_state SECOND

- **Summary**: For `continue` writes, the harness creates the marker, then writes `harness_state.state = "continue"`. For `yield` writes, the harness deletes the marker, then writes `harness_state.state = "yield"`.
- **API references**: bash `echo "$slug" > marker` + `rm -f marker` for marker ops; standard `Write` tool for harness_state. All already in use.
- **Fits**: scout-position match. The marker is the dispositive "are we in the loop" signal; harness_state is the "what's the next action" signal. Reading marker first matches "is this even relevant" being checked before "what's the intent".
- **Tests it enables**: every AC from intake; partial-write resilience can be unit-tested by manually creating each scenario.
- **Tradeoffs**:
  - **Partial-write on `continue` (crash between step 1 and step 2)**: marker exists, `harness_state` still carries prior value. If prior was `yield` (most common — we yielded on the previous tick to wait for user input), hook reads marker → reads state=yield → silent. Correct outcome (we crashed mid-write; no continuation should fire).
  - **Partial-write on `yield` (crash between step 1 and step 2)**: marker absent, `harness_state` still carries prior value (likely `continue` from the just-ended tick). Hook reads marker absent → silent. Correct outcome.
  - **Worst case overall**: an extra in-turn block fires if a `continue` write's step 1 lands but step 2 doesn't — but the next harness tick reconciles. Eventual consistency.
  - **Conceptual clarity**: marker = session presence; state = phase pointer. Different concerns, separate files.

### Candidate A2: harness_state FIRST, marker SECOND

- **Summary**: Inverse of A1.
- **Partial-write on `continue` (crash between step 1 and step 2)**: state=continue written, marker not created. Hook reads marker absent → silent. **Missed continuation** — the user has to type `/harness` to resume.
- **Partial-write on `yield`**: state=yield written, marker not deleted. Hook reads marker present → reads state=yield → silent. Safe.
- **Tradeoffs**: same "marker = session presence" framing, but the worst case (missed continuation on `continue` partial write) is the failure mode the redesign is fixing. Bad shape.

### Candidate A3: Collapse — `loop_active: true` boolean inside `harness_state`

- **Summary**: Single file, single write. `harness_state` = `{state, slug, reason, loop_active}`. Hook checks `state == "continue"` AND `loop_active == true`. SessionStart sets `loop_active: false` (without touching `state`).
- **Tradeoffs**:
  - **Pro**: no partial-write window — single atomic write on Unix for small files.
  - **Pro**: only one file to reason about.
  - **Con**: conflates session presence (ephemeral) with phase pointer (persistent intent). The user explicitly pushed back on this conflation when rejecting Option C from the earlier conversation: "phase pointer vs session presence are different concerns."
  - **Con**: SessionStart still has to read+modify+write `harness_state` to flip the boolean. That's the "neutralize on SessionStart" mechanism the user already called a hack.
- **Verdict**: rejected on the same grounds the user rejected earlier — concern conflation; SessionStart-as-mutator is the hack vector.

**Recommendation for Q1**: **A1** — marker first, harness_state second. Worst partial-write outcome is "extra in-turn tick fires and reconciles" rather than "missed continuation the user must restart". Matches the user's separation-of-concerns design intent.

## Q2 — Log destination for SessionStart marker-cleanup

### Candidate B1: `.claude/state/logs/memory_session_start.log`

- **Summary**: each hook owns its log; cleanup is a memory_session_start event, so log it there.
- **Tradeoffs**:
  - **Pro**: hook → log mapping stays one-to-one. Easy to grep `memory_session_start.log` for everything that hook ever did.
  - **Con**: when debugging "harness isn't auto-continuing", you wouldn't think to check memory_session_start.log. The cleanup that nuked the marker stays invisible until you look there.

### Candidate B2: `.claude/state/logs/harness_continuation.log`

- **Summary**: the marker is part of the harness-continuation lifecycle; log lifecycle events to the lifecycle log regardless of which hook performs them.
- **Tradeoffs**:
  - **Pro**: when debugging harness continuation, one log file shows the full lifecycle: fires from `harness_continuation.sh` + cleanups from `memory_session_start.sh`. The most likely debug workflow finds the relevant event in the first place looked.
  - **Pro**: precedent for cross-hook logging exists (the hook chain ordering in settings.json already mixes responsibilities; this is the diagnostic analog).
  - **Con**: hook → log mapping becomes one-to-many. Mild cognitive load on the maintainer.

### Candidate B3: Both logs

- **Summary**: write the cleanup line to both `memory_session_start.log` and `harness_continuation.log`.
- **Tradeoffs**: maximum discoverability, but duplication and twice the I/O. Overkill for an event that fires once per session.

**Recommendation for Q2**: **B2** — `harness_continuation.log`. The "where would future-me look first when this breaks" test wins: a missing marker is a harness-continuation symptom, not a memory-subsystem symptom. Single-source-of-truth for harness lifecycle.

## Q3 — Test allocation

### Candidate C1: New `tests/memory_session_start.test.mjs`

- **Summary**: create the file for the marker-cleanup test.
- **Tradeoffs**:
  - **Pro**: one-hook-one-test-file matches the existing `harness_continuation.test.mjs` pattern.
  - **Pro**: clean place for any future memory_session_start tests (none today, but the file might grow).
  - **Con**: overhead — a new test file with a single describe for one behavior.

### Candidate C2: Extend `tests/harness_continuation.test.mjs` with a `describe('memory_session_start marker cleanup')` block

- **Summary**: add the test to the existing file alongside the harness-continuation tests.
- **Tradeoffs**:
  - **Pro**: co-locates harness-lifecycle behavior. The existing file already has a "post-refactor invariants" describe block for orthogonal concerns (`:135+`), establishing precedent for non-strictly-hook-scoped tests.
  - **Pro**: zero new file overhead.
  - **Con**: the test technically exercises a different hook (memory_session_start.sh, not harness_continuation.sh) — mild semantic stretch.

### Candidate C3: Shared cross-hook integration test file

- **Summary**: introduce e.g. `tests/harness_lifecycle.test.mjs` as a new home for cross-hook lifecycle tests.
- **Tradeoffs**: introduces a new test taxonomy with one entry. Pure speculation about future needs. YAGNI.

**Recommendation for Q3**: **C2** — extend `harness_continuation.test.mjs` with a new describe block. Matches the precedent already set by the "post-refactor invariants" block; zero file overhead; the test concept is "harness-lifecycle marker behavior" which is what that file already covers.

## Smaller questions

**Q4 — `harness` key in project.json after subkey removal.** Remove the parent key entirely. The audit doesn't verify it (`audit.sh:441-460` lists no harness.* checks), and YAGNI says don't keep empty containers as placeholders for future keys. If future tunables emerge, add the key back at that time.

**Q5 — Marker content format.** Slug only (`<slug>\n`). Timestamp adds diagnostic value but is never read by the hook; if a timestamp is wanted for debugging, `stat` the file's mtime — no need to encode it in the body.

**Q6 — Marker filename.** `.harness_active`. Matches the dot-prefix convention used by `.spec_approval_grant`, `.swarm_approval_grant`, `.commit_consent_grant`, `.commit_consent_grant`. The convention signals "ephemeral runtime marker, not a durable state file."

**Q7 — Marker delete on phase-failure yield.** Yes, delete. Any `state: yield` (consent gate, integrate failure, phase error, done) means we're no longer in the loop. Marker management is uniform across all yield variants — single rule, no exceptions.

**Q8 — State vocab.** Keep the existing triad (`continue` / `yielded` / `done`). The hook only differentiates `continue` from everything else; renaming `yielded` → `yield` would be five SKILL.md churns + test rewrites for zero functional gain. Migration cost > zero, semantic gain = zero, defer.

## Recommendation

- **Q1**: A1 (marker first, harness_state second).
- **Q2**: B2 (`harness_continuation.log`).
- **Q3**: C2 (extend `harness_continuation.test.mjs`).
- **Q4**: Remove `harness` key entirely.
- **Q5**: Slug only.
- **Q6**: `.harness_active`.
- **Q7**: Delete marker on every yield variant.
- **Q8**: Keep `continue`/`yielded`/`done`.

**What would flip the recommendations:**

- **Q1 → A3**: if the project ever introduces real concurrency between harness ticks (it doesn't today and isn't planned), the single-file atomic write becomes more attractive.
- **Q2 → B1**: if a future hook chain introduces multiple hooks that affect harness state, "each hook owns its log" might scale better. Single SessionStart writer today doesn't make that case.
- **Q3 → C1**: if memory_session_start grows other independent behaviors that need testing, the dedicated file becomes worth the overhead. Today it has one behavior worth testing.
- **Q8 → rename**: if the spec also redesigns the state machine (e.g., to add an explicit `paused` state for cross-workflow pauses), bundle a vocab refresh into the same migration.

## Open questions

- None blocking. The user has decided the architecture; this memo decides the implementation seams. `/spec` can proceed using the recommendations above unless any specific recommendation gets pushback at spec time.
