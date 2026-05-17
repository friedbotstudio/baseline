# Pattern Research — memory-flush as workflow Phase 10.6

**context7 applicability**: this change touches no third-party libraries. It is structural / configurational / skill-prose work over CLAUDE.md, src/CLAUDE.template.md, docs/init/seed.md, src/seed.template.md, and the harness/triage/memory-flush/commit/chore skill SOPs + the memory_session_start.sh hook. No external API surface area is involved. context7 MCP queries are not applicable; this memo cites no external library docs.

The intake fixed the high-level decision (slot memory-flush at end-of-workflow). What remains is a set of structural sub-decisions where the design isn't obvious and the spec author benefits from seeing the options laid out with tradeoffs. The memo is organized around the six decision axes the intake / scout left open.

---

## Axis 1: Phase placement

### Option 1A: Phase 10.6 — between `/archive` and `/grant-commit`

- **Summary**: Insert memory-flush after archive (Phase 10.5) and before the grant-commit consent gate. Slug-scoped artifacts have already moved to `docs/archive/<date>/<slug>/`; canonical memory writes happen against a "settled" workflow tree.
- **Fits the existing conventions**: archive (Phase 10.5) is the precedent for a sub-phase that runs late in the workflow without being a top-level phase. The harness loop is task-driven (TaskList → Skill invocation), so adding a new sub-phase is mechanically identical to adding archive was — one new task in triage's seed template, one new line in harness's documentary arrow chain, one new prereq in commit.
- **Co-located commit**: yes. Canonical memory writes (`.claude/memory/<canonical>.md`) modify tracked files; the working tree carries them into the workflow's `/commit`.
- **Conversation context**: slightly compressed vs. running before archive — the archive step moved 5–7 files via `git mv`, which doesn't compress narrative context much. The model still has full scout/spec/integrate context in scrollback. Acceptable.
- **Tradeoffs**:
  - **+** Matches the "everything before commit is in one commit" property.
  - **+** Runs after the binding `/integrate` verdict, so the workflow's correctness is known before memory writes go to disk.
  - **+** Track_guard is unaffected (memory-flush writes target `.claude/memory/*.md`, not slug-scoped artifacts).
  - **−** Curator sees slug artifacts in `docs/archive/<date>/<slug>/` rather than at their original locations. Minor; the spec/scout/research files are still readable in the archive bundle.

### Option 1B: Phase 10.4 — between `/document` and `/archive`

- **Summary**: Insert memory-flush after document, before archive. Slug artifacts are still at their original locations (`docs/{intake,scout,research,specs,security}/<slug>.md`) when the curator runs.
- **Fits**: also fits — harness loop semantics are identical. But it breaks the archive convention (archive is currently the *last* non-commit phase).
- **Co-located commit**: yes — same as 1A.
- **Conversation context**: slightly better than 1A — document just finished, the most recent prose work is in scrollback, slug artifacts are still where the scout report cited them.
- **Tradeoffs**:
  - **+** Curator's mental model maps directly to the scout's "primary touchpoints" file paths (`docs/scout/<slug>.md:42` style references still resolve).
  - **+** Slightly fresher context — no "moved 5 files via git mv" step compressing the working memory.
  - **−** Reorders the established convention: archive is currently the last non-commit phase. Adding memory-flush before archive means the slug bundle in `docs/archive/<date>/<slug>/` doesn't include the canonical memory writes anyway (those land in `.claude/memory/` not the bundle), so the reorder doesn't buy anything tangible.
  - **−** A failure in memory-flush would leave a dirty `docs/<phase>/` tree that the archive phase then bundles. Recovery requires re-running archive after memory-flush succeeds. Vs. 1A: a failure leaves the archive bundle clean and the workflow can resume cleanly from memory-flush.

### Option 1C: Phase 11a — after `/commit`

- **Summary**: memory-flush runs after the workflow's commit, in a separate follow-up commit. Considered and rejected at intake; included here for completeness.
- **Tradeoffs**:
  - **+** Curator runs against committed code (so re-verification of canonical entries cites real SHAs).
  - **−** Breaks the "co-located commit" property — canonical memory writes ship as a separate commit. The workflow's commit isn't atomically self-contained.
  - **−** Introduces a "memory-debt" tail to every workflow: a workflow that crashes after `/commit` but before memory-flush leaves canonical memory drifting from the diff that motivated it.
  - **−** Doesn't satisfy the intake's pristine-tree-at-end-of-task constraint (the tree is pristine after `/commit`, but the workflow isn't done — there's a follow-up commit pending).

### Recommendation for Axis 1

**Adopt 1A (Phase 10.6 between archive and grant-commit).** It matches the existing archive convention, preserves co-located commit and atomic workflow semantics, and the conversation-context compression of running after archive is minor (archive is mechanical file moves; it doesn't replace narrative context).

What would flip the decision: if a workflow's archive step were to compress so much narrative context that the curator routinely couldn't decide candidate fates, we'd switch to 1B. With current archive behavior (file moves only), this hasn't been observed.

---

## Axis 2: Chore-track parity

### Option 2A: chore always runs memory-flush

- **Summary**: chore SKILL.md gains a Step 6.5 `Invoke Skill(memory-flush) — mandatory`, mirroring its existing Step 6 `Invoke Skill(archive) — mandatory`.
- **Fits**: yes. Chore's design principle (per CLAUDE.md Article IV bullet on chore + chore SKILL.md preamble) is "stripped-down, not a bypass." Skipping memory-flush would be a bypass of the same kind chore-philosophy rejects.
- **Tradeoffs**:
  - **+** Symmetric with TDD/spec tracks; no special-case rule about "memory-flush only on TDD."
  - **+** Chore can produce memory candidates (e.g., a dependency bump triggers a context7 query that the extractor flags as a library candidate; a documentation edit touches a stable architectural seam worth noting).
  - **+** Idempotent no-op handles the common case where chore touches nothing the extractor cares about — the empty-pending fast path returns success in ≤ 3 tool calls.
  - **−** Adds one task to every chore workflow's TaskList. Cheap; the fast path is free on empty pending.

### Option 2B: chore runs memory-flush conditionally

- **Summary**: chore evaluates a trigger (e.g., "did the diff touch any path under `.claude/skills/` or `src/`?") and runs memory-flush only when triggered.
- **Tradeoffs**:
  - **+** Saves the no-op invocation cost on pure documentation-edit chores.
  - **−** Introduces another judgment surface — chore already has "simplify/integrate/document are conditional" rules; adding "memory-flush is conditional" multiplies the decision graph.
  - **−** Bug surface: a chore that misclassifies the trigger silently skips a real flush. Idempotent no-op (Axis 4) is cheaper than this risk.
  - **−** Asymmetric with the other tracks; chore would be the only track with skip-able memory-flush.

### Option 2C: chore never runs memory-flush

- **Summary**: chore SKILL.md doesn't invoke memory-flush. Only TDD/spec/intake tracks do.
- **Tradeoffs**:
  - **+** No new task in chore TaskList.
  - **−** Pure bypass — the kind chore explicitly rejects. A chore-track dependency bump that triggers a context7 query produces a candidate; the candidate accumulates indefinitely because no track ever flushes it.
  - **−** Inconsistent with CLAUDE.md Article IV's framing of chore as "stripped-down, not a bypass."

### Recommendation for Axis 2

**Adopt 2A (chore always runs memory-flush).** Symmetric with other tracks, consistent with chore's design philosophy, and the idempotent-no-op fast path makes the cost negligible on empty-pending. Add a Step 6.5 to chore SKILL.md between archive and the harness_state write.

What would flip the decision: if the no-op fast path turned out to cost more than ~3 tool calls per invocation (e.g., because Step 0's canonical sweeps grew expensive), 2B would be worth reconsidering. With sweep.py's current shape (auto-close is a single file scan; stale-sweep is condition-gated), 2A's no-op cost is bounded.

---

## Axis 3: SessionStart "K candidates pending" nag wording + behavior

### Option 3A: Pure silence on K=0; debt-mode wording on K>0+no-workflow; silent on K>0+active-workflow

- **Summary**:
  - K=0 → no line emitted (drop the current "No pending memory candidates." line).
  - K>0 AND `workflow.json` absent → emit `**{n} candidate(s) carried over from a prior workflow** — run \`/memory-flush\` to clear before starting new work.`
  - K>0 AND `workflow.json` present → no line emitted (Phase 10.6 will handle).
- **Tradeoffs**:
  - **+** Minimum session-start noise. The hook's index table at the top of additional-context already shows the pending count; the prose line is redundant on K=0.
  - **+** Debt-mode framing is honest — the candidates ARE debt from a prior workflow that didn't end-flush.
  - **+** Silent on active workflow avoids redundant nagging when the workflow will resolve it.
  - **−** No positive confirmation. A user who wants to see "memory is clean" has to read the index table instead of finding a prose statement.

### Option 3B: Positive confirmation on K=0; current "before workflow phase work" wording on K>0

- **Summary**: leaves the hook largely as-is. K=0 → emit "No pending memory candidates." K>0 → current wording about workflow-phase work.
- **Tradeoffs**:
  - **+** Backward-compatible.
  - **−** The "before workflow phase work" wording is the bug — it's the framing that's caused 19 candidates to accumulate (the model defers past the SHALL because it's mid-conversation answering a user question).
  - **−** No distinction between debt and active-workflow scenarios.

### Option 3C: Information-only on K=0; debt-mode wording on K>0+no-workflow; "Phase 10.6 will handle these" on K>0+active-workflow

- **Summary**: hybrid — adds a positive "Phase 10.6 will handle" reminder during active workflows.
- **Tradeoffs**:
  - **+** Most informative — the user knows whether action is needed (debt) or auto-handled (active workflow).
  - **−** Adds one more line to every session-start additional-context block. Marginal noise.
  - **−** Reveals workflow-internal mechanics to a user who may not have invoked /harness yet.

### Recommendation for Axis 3

**Adopt 3A.** Pure silence on K=0 (the index table already says it), debt-mode wording on K>0+no-workflow (honest framing of where the candidates came from), silent on K>0+active-workflow (the active workflow's Phase 10.6 will resolve it; the redundant nag is what's currently causing the model to defer past Article III.4).

What would flip the decision: if a user reports confusion about "did Phase 10.6 actually run?" we could move to 3C and add the "Phase 10.6 will handle these" line during active workflows. For now, 3A is the cleanest.

---

## Axis 4: Idempotent no-op detection

### Option 4A: Skill-side detection — memory-flush self-detects empty pending

- **Summary**: memory-flush SKILL.md's first action is to read `_pending.md`, count `## CANDIDATE:` blocks, and short-circuit if zero. The skill still runs Step 0 (canonical-file sweep — auto-close + stale + prose-scan), then emits a one-line Step 6 report.
- **Fits**: yes. The skill is the source of truth about what's worth doing; it should know when there's nothing to do.
- **Tradeoffs**:
  - **+** Workflow-and-ad-hoc invocation parity — both go through the same skill, both get the same fast-path detection.
  - **+** Single test surface (the skill's behavior on empty pending). Easier to assert.
  - **+** Step 0 still runs unconditionally, which is the right semantic — Step 0 closes canonical entries; it's not gated on pending content.
  - **−** The harness still pays a `Skill(memory-flush)` invocation cost even when the skill will no-op. Bounded (~3 tool calls); the cost is the read + the workflow.json append + the report emit.

### Option 4B: Harness-side detection — harness skips invocation on empty pending

- **Summary**: harness reads `_pending.md` before invoking `Skill(memory-flush)`. If empty, marks the task completed, logs `skipped memory-flush (empty pending)`, appends to workflow.json, continues.
- **Tradeoffs**:
  - **+** Saves the Skill invocation entirely.
  - **−** Splits responsibility: the harness knows about memory-flush internals (which file to read, what "empty" means). Violates encapsulation.
  - **−** Ad-hoc `/memory-flush` invocation bypasses the harness's fast-path; the skill still needs Option 4A's logic for the user-invoked case. Net: two implementations.
  - **−** Step 0 (canonical sweep) doesn't run when pending is empty, losing the auto-close path for any entries with `resolved-at:` fields. This is a real regression on the memory-lifecycle-closure feature.

### Option 4C: Both — harness pre-checks, skill safety-nets

- **Summary**: harness does the read, skill does the read again on entry, both fast-path.
- **Tradeoffs**:
  - **+** Maximum efficiency on the common case.
  - **−** Two code paths to maintain. The marginal cost of the Skill invocation in 4A is small enough that 4C's complexity isn't worth it.

### Recommendation for Axis 4

**Adopt 4A (skill-side detection).** Encapsulates the no-op decision inside the skill. Workflow and ad-hoc invocations behave identically. Step 0's canonical sweep still runs (preserving auto-close behavior from the memory-lifecycle-closure feature). The ~3 tool-call cost of invocation is bounded.

What would flip the decision: if Step 0's canonical sweep grew to ≥10 tool calls per invocation, 4B's harness-side skip would become attractive. Current sweep.py is one read + one regex per canonical file = ~6 reads, well under the threshold.

---

## Axis 5: Q-001 closure mechanism

The memory-lifecycle-closure spec (landed 2026-05-13, archived at `docs/archive/2026-05-13/memory-lifecycle-closure/`) added auto-close mechanics to sweep.py: an entry on `pending-questions.md` carrying `resolved-at: <ISO>` is deleted by sweep.py's `--mode auto-close` pass.

### Option 5A: Inline `resolved-at:` field, swept by this workflow's Phase 10.6

- **Summary**: During this workflow's /tdd, add `- resolved-at: 2026-05-16` to Q-001's body. Phase 10.6 invokes Skill(memory-flush) → Step 0a runs sweep.py auto-close → Q-001 is deleted in the same workflow's commit.
- **Fits**: yes. Uses the existing auto-close mechanism without inventing new ceremony.
- **Tradeoffs**:
  - **+** Self-referential closure: the workflow that resolves Q-001 also runs the sweep that deletes it. Single commit.
  - **+** No new code paths.
  - **+** The earlier inline resolution attempt in `.claude/memory/pending-questions.md` (lines 17-25 today) already includes a `Resolution:` line — adding the structured `resolved-at:` field is a one-line edit.
  - **−** Requires the /tdd implementation sequence to edit pending-questions.md BEFORE Phase 10.6 fires. Mitigated by making this an explicit AC in the spec.

### Option 5B: Manual deletion via memory-flush Step 2

- **Summary**: Phase 10.6 fires; the curator (Claude in main context) reads pending-questions.md, sees Q-001 has a Resolution line in body but no `resolved-at:` field, and manually deletes the block via Edit. Bypasses the structured-closure mechanism.
- **Tradeoffs**:
  - **+** No edits to Q-001 ahead of time — the curation step decides.
  - **−** Asymmetric with how memory-lifecycle-closure intends entries to close. The spec said "auto-close handles structured-closure entries; prose-scan surfaces unstructured ones for confirm." Treating Q-001 as prose-scan adds one user prompt; treating it as structured-closure auto-deletes.
  - **−** Q-001's body already has a `Resolution:` line (from current `pending-questions.md` content seen earlier). Prose-scan would surface it for confirmation. So Option 5B is equivalent to "answer 'y' at the prose-scan prompt during Phase 10.6". Workable but more interactive.

### Option 5C: New `/q-001 close` command or similar

- **Summary**: invent a new slash command that adds `resolved-at:` to a named question.
- **Tradeoffs**:
  - **+** Generalizable to future Q-NNN closures.
  - **−** YAGNI — one entry needs closing right now; we don't need a command for a recurring use case yet. Adds command count, audit-baseline check surface, etc.

### Recommendation for Axis 5

**Adopt 5A (inline `resolved-at:` field).** Uses existing auto-close infrastructure, self-referential closure in a single commit, no new ceremony. Q-001's body already carries a Resolution line; adding the structured field is one line. The /tdd phase edits pending-questions.md before Phase 10.6 fires; the spec encodes this as an explicit AC ordering constraint.

What would flip the decision: if the memory-lifecycle-closure auto-close turned out to be broken on Q-001's specific shape (it's the oldest entry in `pending-questions.md` from 2026-04-27, predating the source-provenance schema), we'd fall back to 5B (manual via Step 2). A pre-flight test in /tdd should verify auto-close fires on the actual Q-001 block before relying on it.

---

## Axis 6: Active-workflow detection signal for the nag

### Option 6A: Presence of `.claude/state/workflow.json`

- **Summary**: hook checks file existence; if present → active workflow → silent on K>0.
- **Fits**: yes. workflow.json is the durable workflow signal; archived to `docs/archive/<date>/<slug>/workflow.json` at /commit time, removed from `.claude/state/`.
- **Tradeoffs**:
  - **+** Survives session boundaries (a workflow started yesterday is still "active" today until /commit).
  - **+** The same signal track_guard, harness, and triage use. Single source of truth.
  - **−** A workflow that crashed mid-flight leaves workflow.json on disk indefinitely; the nag would stay silent until the user resumes or aborts. Manageable: stale workflow.json is a different problem and surfacing it isn't memory-flush's job.

### Option 6B: Presence of `.claude/state/.harness_active` marker

- **Summary**: hook checks marker file; if present → active workflow → silent on K>0.
- **Tradeoffs**:
  - **+** Session-local — the marker is created on /harness start, deleted at session boundary by `memory_session_start.sh` itself.
  - **−** Doesn't capture "user is in the middle of a workflow but hasn't run /harness yet this session." If user does `/intake` directly (without /harness wrapping), no marker exists; the nag fires.
  - **−** Inconsistent with how the rest of the harness machinery thinks about "active workflow."

### Recommendation for Axis 6

**Adopt 6A (workflow.json presence).** Single source of truth across triage, harness, track_guard, and now the SessionStart nag. Survives session boundaries, which is the correct semantic for "active workflow."

What would flip the decision: if stale workflow.json from crashed workflows became a common surface where users lost track of memory debt, we'd add a freshness check (modified-within-N-days) on top of presence. Not needed initially.

---

## Recommendation summary

| Axis | Pick | One-line rationale |
|---|---|---|
| 1. Phase placement | 1A (Phase 10.6 between archive and grant-commit) | Matches archive precedent, preserves co-located commit, runs after binding /integrate verdict. |
| 2. Chore-track parity | 2A (chore always runs memory-flush) | Symmetric, consistent with "stripped-down, not bypass," no-op fast-path makes cost negligible. |
| 3. SessionStart nag | 3A (silent on K=0; debt-mode on K>0+no-workflow; silent on K>0+active-workflow) | Minimum noise, honest debt framing, no redundant nag during workflows. |
| 4. Idempotent no-op | 4A (skill-side detection) | Encapsulates the decision, single test surface, preserves Step 0 sweep semantics. |
| 5. Q-001 closure | 5A (inline `resolved-at:` field, swept by this workflow's Phase 10.6) | Uses existing auto-close infrastructure, self-referential closure in a single commit. |
| 6. Active-workflow signal | 6A (`.claude/state/workflow.json` presence) | Single source of truth across triage/harness/track_guard; correct cross-session semantics. |

**Design summary for /spec to formalize**: memory-flush becomes Phase 10.6 between `/archive` (10.5) and `/grant-commit` (11), invoked by harness/triage/chore via TaskList wiring identical to archive's. The skill self-detects empty pending and short-circuits Steps 1–5 while still running Step 0 sweeps. The memory_session_start hook checks for `.claude/state/workflow.json` and emits the "K candidates carried over from a prior workflow" nag only when K>0 AND no workflow.json. Q-001 closes via an inline `resolved-at: 2026-05-16` field added during /tdd that this workflow's own Phase 10.6 sweeps. The constitution's "11-phase" headline stays — 10.6 is a sub-phase under the existing top-level count, consistent with how 10.5 archive already works.

## Open questions

- **Test framework selection.** The scout flagged that `tests/` already holds .mjs test files using node's built-in test runner. The new test file should follow that pattern (`tests/memory-flush-phase.test.mjs`). Spec to confirm the test runner + assertion shape.
- **Audit-baseline assertion shape.** Should the audit grow a new check for "memory-flush appears in harness/triage/chore phase chains"? Today it doesn't validate workflow-phase content — only counts of hooks/skills/commands. Spec to decide whether this is in-scope.
- **Recovery from Phase 10.6 failure.** If memory-flush fails mid-curation (e.g., a canonical file write fails the size-cap check), does the workflow yield like any other phase failure? Default yes (existing harness pattern); spec to make explicit.
