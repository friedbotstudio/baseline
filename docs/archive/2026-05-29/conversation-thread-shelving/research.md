# Pattern Research — conversation-thread-shelving

Scope: internal harness feature. **No third-party library APIs are involved** — the implementation uses Node built-ins (`node:fs`, `node:path`, `node:util parseArgs`) already pervasive in `.claude/hooks/` and `.claude/skills/*/`. `package.json` runtime deps are `@clack/prompts` (CLI TUI) and dev-only eleventy/semantic-release — none touch this feature. context7 was therefore not invoked (it covers third-party libraries, not Node core). All candidates below are architectural, grounded in the scout report's file:line map.

The four decisions map to the four intake open questions. Each is presented as an option space with a recommendation; the human reviewer decides at `/spec`.

---

## Decision 1 — Switch-detection at the Stop event (intake OQ-2, OQ-4; AC-4)

The hard constraint (scout: `.claude/settings.json:61-68`, `harness_continuation.mjs:121-126`): two Stop hooks already chain, and `harness_continuation` owns the single `{"decision":"block"}` output. A second hook emitting any stdout decision risks fighting it.

### Candidate 1A — Passive collector beside `memory_stop`, confirm deferred to SessionStart/`/resume`
- **Summary**: A switch-detector runs at `Stop` (folded into `memory_stop.mjs` or a sibling lib), compares the current turn's subject against the active thread marker, and on divergence STAGES a switch-candidate to a gitignored disk file (e.g. `.claude/state/shelve_candidate`). It emits NOTHING on stdout — no decision, fully passive like `memory_stop` today. The confirm surfaces on the next `SessionStart` injection or when the user runs `/resume`/`/shelve`.
- **Fits**: Yes — mirrors `memory_stop.mjs:1-45`'s passive-collector contract ("never writes canonical, best-effort, never fails the hook"). No block-decision collision (scout risk #1). Honors Article IX.3 (stage, don't silently write) and AC-4 (propose via confirm, not auto-write).
- **Tests it enables**: Pure-function test of the detector (`detectSwitch(prevSubject, currTurn) → bool`); disk-staging assertion; "emits no stdout decision" assertion; coexistence test that `harness_continuation` still fires.
- **Tradeoffs**: The confirm is not instantaneous at the moment of switch — it lands at next session-start or next `/shelve`/`/resume`. For a single-rolling-trail model that is acceptable (the trail is the durable record; timing of the confirm is cosmetic). Detector lives at the same hook as the `cf4a` extractor — must stay surface-separate (scout risk #4).

### Candidate 1B — New dedicated Stop hook that emits an `AskUserQuestion`-style block
- **Summary**: A third Stop hook that, on detected switch, emits a `block` decision to force a confirm prompt that turn.
- **Fits**: No — directly collides with `harness_continuation`'s `block` (scout risk #1); two hooks racing to own the re-prompt. Also grows the audited "22 hooks" count and the `CLAUDE.md`/`src/CLAUDE.template.md` byte-mirror for an enforcement-shaped hook (Article VIII; scout co-change).
- **Tradeoffs**: Immediate confirm, but the coordination cost with `harness_continuation` (who wins when both want to block?) is a real correctness hazard during active workflows. Rejected on collision risk.

### Candidate 1C — Heuristic-only detection vs LLM-assisted detection in the hook
- **Summary**: Sub-decision orthogonal to 1A/1B: does the *detector* use a cheap heuristic (subject-keyword divergence, workflow-slug change, explicit topic markers) or an LLM pass?
- **Fits**: Heuristic-in-hook fits the "hooks are plain logic, best-effort, fast" pattern (Article VIII; all existing hooks are synchronous Node). An LLM pass cannot run *inside* a Stop hook (hooks are non-interactive Node processes with no model access) — it would require spawning a worker, which is Decision 2.
- **Tradeoffs**: Heuristic = cheap, deterministic, testable, but lower recall (may miss subtle pivots — the exact failure mode the `cf4a` backlog item documents for the analogous intent-regex). LLM-assisted = higher recall but needs a worker hop and is non-deterministic. Recommend **heuristic detection to STAGE a candidate, LLM judgment to COMPOSE the shelve** (the summary), splitting the concern cleanly.

**Recommendation (D1): Candidate 1A + heuristic staging (1C-heuristic).** Passive collector, no stdout decision, stages a candidate; the LLM-quality work (summarization) is deferred to the shelve compose step (Decision 2), not the hook. Flip condition: if the reviewer wants an *immediate* same-turn confirm, revisit 1B with an explicit hook-ordering contract that makes `harness_continuation` yield.

---

## Decision 2 — The shelve worker / compose model (intake Constraints "Article II", "background-worker discipline"; AC-3, AC-5)

The tension (scout risk; intake non-goal note): composing a good shelve entry (summary + *which* cues are salient) is LLM judgment. Article II says judgment cannot be routed to a non-`swarm-worker` subagent, and the baseline "ships exactly ONE subagent." So a generic "shelve subagent" is constitutionally out.

### Candidate 2A — Inline main-context compose (the `/shelve` skill does the summarizing)
- **Summary**: There is no background worker. `/shelve` is a main-context skill: it reads the active thread's transcript signals (reusing `composeSnapshot`'s `walk()` for raw material), and the MAIN context model writes the summary + selects verbatim cues, then appends to the trail. "Background worker" from the brief is reinterpreted as "the skill's compose step," which runs where judgment is allowed.
- **Fits**: Yes — Article II ("decisions live in main context") is satisfied by construction; no new subagent; no judgment in a Task brief. Reuses `lib/resume_writer.mjs:66-110` (`walk`) for transcript extraction. The Stop-hook detector (D1) only *stages*; the actual compose is main-context.
- **Tests it enables**: The mechanical pieces are pure-function testable (trail append format, cue extraction from a fixture transcript, dedup); the judgment piece is exercised by the skill SOP, not unit-asserted (same as every other compose skill).
- **Tradeoffs**: The shelve is not truly "background" — it happens when `/shelve` runs (explicit) or when the staged candidate is acted on at next turn/session-start. For a local single-rolling-trail this is fine. Cost: a turn's worth of main-context tokens per shelve. Mitigated because shelve is infrequent (only on real pivots).

### Candidate 2B — `Bash run_in_background` worker that runs a deterministic composer (no LLM)
- **Summary**: A `.mjs` composer runs detached via `run_in_background`, building the shelve entry purely mechanically (verbatim `composeSnapshot`-style extraction, no summarization judgment).
- **Fits**: Partially — it is genuinely background and Article-II-clean (no judgment, pure recipe). But it CANNOT summarize or pick salient cues (no model) — it can only do `_resume`-style mechanical extraction, which is exactly the shallow snapshot the intake says is insufficient ("feel continuous" needs real summary + chosen cues, AC-5).
- **Tradeoffs**: Zero main-context token cost, fully deterministic/testable, but delivers a worse artifact than 2A. Could be a fallback for the *staging* write (dump raw signals) with 2A upgrading it to a real summary on `/resume`.

### Candidate 2C — `swarm-worker` subagent
- **Summary**: Reuse the one sanctioned subagent.
- **Fits**: No — `swarm-worker`'s sole sanctioned use is `Skill(scenario)`+`Skill(implement)` in a worktree during `/swarm-dispatch` (Article II, explicit). Repurposing it for shelving violates its charter. Rejected.

**Recommendation (D2): Candidate 2A (inline main-context compose), optionally with 2B as a mechanical fallback for the staged candidate.** The detector stages cheaply (D1); `/shelve` (and the act-on-staged path) compose in main context where salience judgment is legal. This dissolves the Article II tension entirely — there is no judgment-bearing background worker. Flip condition: if token cost of inline compose proves painful in practice, add the 2B mechanical pre-fill so `/resume` has *something* even before a main-context upgrade. **This is the most load-bearing decision and the strongest codesign candidate** (see end).

---

## Decision 3 — Trail file shape, durability, bounding (intake OQ-1, OQ-3; AC-1, AC-2, AC-6, AC-7)

### Candidate 3A — Single append-only `_thread.md`, gitignored content + `src/memory/_thread.template.md`, reuse `composeSnapshot` for content
- **Summary**: One file `.claude/memory/_thread.md`. Each shelve appends a dated section (summary / verbatim cues / open questions / in-flight files + next step). Content gitignored (`.gitignore` new entry beside `:14-19`); committed structure via `src/memory/_thread.template.md` overlaid by `scripts/build-template.sh` stage 2 + CLI install + `obj/template/.claude/manifest.json` (Article XI). Survives `/memory-flush` automatically because it is NOT in `sweep.mjs:26-31 CANONICAL_FILES` and not the `_pending` reset target (`memory-flush SKILL.md:148-150`).
- **Fits**: Yes — exact mirror of the `_pending.md`/`_resume.md` ship pattern (scout: `src/memory/*.template.md`, `.gitignore:1-30`). Single-rolling-trail = AC-6 by construction. Reusing `composeSnapshot`'s `walk()` for raw signals avoids a parallel transcript parser.
- **Tests it enables**: AC-1 (run flush, assert `_thread.md` unchanged); AC-2 (assert gitignored — `git check-ignore`); AC-6 (one file, append semantics); AC-7 (verbatim cue round-trip preserves exact bytes).
- **Tradeoffs**: Reusing `composeSnapshot` *wholesale* is wrong — its write semantics overwrite every turn (scout risk #2); reuse only the read/`walk` half, write append-only. Must explicitly document "not auto-wiped" in `README.md` + add a regression test so a future flush change can't silently regress AC-1.

### Candidate 3B — Separate per-thread files under `.claude/memory/threads/`
- **Summary**: One file per shelved thread.
- **Fits**: No — the intake explicitly rejected multiple discrete threads ("but then what's backlog doing? So it should be single rolling trail"). Rejected on requirement.

### Bounding sub-decision (OQ-1) — three options, all compatible with 3A:
- **(i) Soft cap + roll-off**: cap the trail at N sections / M KB; oldest sections roll off (deleted or moved to a cold `_thread.archive.md`). Keeps session-start injection under the 10KB envelope (`memory-session-start-size-cap` test).
- **(ii) Inject only the most-recent section at SessionStart**: the full trail stays on disk unbounded, but only the latest thread's summary is injected (bounded read, unbounded store). `/resume` can page older sections on demand.
- **(iii) No bound**: let it grow; rely on the developer to prune. Violates the 10KB envelope risk; not recommended.
- **Recommendation**: **(ii) inject-most-recent + (i) soft roll-off as a later refinement.** (ii) alone satisfies AC-1/AC-5 and respects the envelope without data loss; (i) can be added if files grow unwieldy. Avoids premature complexity (YAGNI).

**Recommendation (D3): Candidate 3A + bounding (ii).** Single `_thread.md`, append-only, ship-template + gitignore, survives flush by omission from `CANONICAL_FILES`, inject most-recent section at SessionStart.

---

## Decision 4 — `/shelve` + `/resume`: command vs skill (intake AC-3, AC-5)

### Candidate 4A — Skills (`.claude/skills/shelve/`, `.claude/skills/resume/`)
- **Summary**: Both are `SKILL.md` SOPs invoked via the `Skill` tool. `/shelve` composes + appends (main-context, Decision 2A). `/resume` reads `_thread.md`'s most-recent section and surfaces summary + cues + open questions + in-flight files/next step into context.
- **Fits**: Yes — every capability in the repo except the 6 consent/init commands is a skill (scout: `.claude/commands/` holds only consent/init). `/shelve` *needs* main-context compose (judgment), which is exactly what a skill is for. `/resume` needs to read + present into context — also skill-shaped.
- **Tradeoffs**: Skills are model-invoked; the user types `/shelve` and the harness routes via `Skill`. Fine — matches `/scout`, `/spec`, etc. Adds 2 to the skill count + manifest (Article XI), but skills are the sanctioned extension point.

### Candidate 4B — Commands (`.claude/commands/shelve.md`, `resume.md`)
- **Summary**: User-typed prompt commands like `/grant-commit`.
- **Fits**: No clean fit — `.claude/commands/*.md` are reserved for the consent/init handshake paired with `consent_gate_grant` (UserPromptSubmit). `/shelve`/`/resume` carry no consent semantics. Using a command would also bypass the skill-tool routing the harness/Skill system expects.
- **Tradeoffs**: Commands inject their body as a prompt — they can't run multi-step compose logic the way a skill SOP + `.mjs` helpers can. Rejected on fit.

**Recommendation (D4): Candidate 4A (both as skills).** `/shelve` = compose+append skill; `/resume` = read+surface skill. Mechanical helpers (`append-thread.mjs`, `read-trail.mjs`) ship as `.mjs` beside the SKILL.md (Article XI / spec-shippability: no new Python helpers).

---

## Recommendation (overall)

Build: **(D1) passive heuristic switch-detector** folded beside `memory_stop` that stages a candidate with no stdout decision; **(D2) inline main-context `/shelve` compose** (no judgment-bearing subagent — dissolves the Article II tension); **(D3) single append-only `.claude/memory/_thread.md`**, gitignored-content/committed-template, surviving `/memory-flush` by omission from `sweep.mjs CANONICAL_FILES`, most-recent-section injection at SessionStart; **(D4) `/shelve` + `/resume` as skills** with `.mjs` helpers.

This keeps the feature additive (no enforcement change), constitutionally clean (Article II/IX.3 satisfied by staging + main-context compose), and testable against all 7 ACs without mocking internal modules.

## Codesign recommendation

**Decision 2 (worker/compose model) is load-bearing enough to warrant codesign mode** — it sits directly on the Article II boundary (where judgment may run) and the "one subagent" constraint, and the engineer (project owner) authored those constitutional rules, so their verbatim rationale should be canonical if they diverge from the 2A recommendation. Decision 1 (hook collision) is secondary-but-related. Per Article II, `/research` cannot flip flow state — if the reviewer wants engineer decision-capture at `/spec`, opt in via `/triage --codesign` or set `workflow.json → codesign_mode: true` before `/spec`. Decisions 3 and 4 are well-constrained by existing patterns and do not need codesign.

## Open questions for /spec to resolve
1. Confirm-surface timing for an auto-staged switch (D1): next-SessionStart injection vs first-action-on-next-turn vs a `/resume`-time prompt? (AC-4 says "propose via confirm" but not *when*.)
2. Does `_thread.md` subsume `_resume.md` or sit beside it? (intake OQ-3 — recommend *beside*: `_resume` stays per-turn ephemeral, `_thread` is durable; but confirm.)
3. Bounding policy concretely (D3 sub-decision): most-recent-only injection — is one section enough context to "feel continuous," or does resume need the last K sections?
4. Should the staged-candidate mechanical pre-fill (D2 candidate 2B fallback) ship in v1, or is inline-compose-only sufficient?
5. Codesign opt-in for Decision 2: does the engineer want to formally capture the worker-model decision, or accept the 2A recommendation as-is?
