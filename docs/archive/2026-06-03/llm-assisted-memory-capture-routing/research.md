# Pattern Research — llm-assisted-memory-capture-routing

Four decision points, each with candidates + tradeoffs. Design-first; the human decides at `/spec` / `/approve-spec`. No new third-party dependency is required by the recommended path (see DP1).

Stack note: pure Node ESM (`node:test`, `spawnSync` fixtures); hooks are headless `.mjs` over `lib/*.mjs`. No package manager dep is added by the recommendation. `package.json` declares no runtime deps relevant here; the only library that *would* be implicated is `@anthropic-ai/sdk` under DP1-C, which is rejected.

---

## Decision Point 1 — Where the "LLM-assisted" capture/routing pass runs

The framing constraint is load-bearing: the Stop hook is a **headless `node` process** with no model handle and a **hard cheap-per-turn budget** (intake AC-8). "LLM at capture time" therefore cannot mean an LLM call inside `memory_stop`. The model already runs over memory in exactly one place: `/memory-flush` (main context).

### Candidate 1A — Broaden deterministic capture per-turn; defer semantic routing/weighting to `/memory-flush`
- **Summary**: Replace the line-anchored `INTENT_TRIGGERS` (`memory_stop.mjs:34-51`) with a **sentence-level** deterministic scan (split on sentence boundaries, then match a broadened salience-cue set against each sentence, not just line starts), so mid-sentence intent is captured. Stage richer raw candidates to `_pending` with a `route: unassigned` + `weight: <heuristic>` field. The **model assigns bucket (landmark/decision/open-question/backlog) and a keep/discard weight at `/memory-flush`**, where it already curates in main context.
- **Fits**: Yes — preserves the scout's capture(cheap)/transform/curation(model) separation; keeps the per-turn path deterministic and offline-robust; respects Article IX.3 (still stages to `_pending` only); no new infra or dependency.
- **Tests it enables**: fixture-corpus recall scoring on the sentence scanner (line-start + mid-sentence); `_pending` block-shape tests for the new `route`/`weight` fields; `/memory-flush` routing-suggestion tests (the model step is exercised via the existing main-context curation contract, not mocked).
- **Tradeoffs**: The genuinely *semantic* recall ("this sentence is an intent even though it matches no cue") still depends on the model — but that now happens at flush, not per-turn. Per-turn recall is bounded by how good the deterministic sentence cues are (better than today, not perfect). Two-stage (cheap capture → model route) means a candidate's bucket isn't known until flush; acceptable since `_pending` is a staging area by definition.

### Candidate 1B — Async/batched model pass between turns or at session-start
- **Summary**: Stop hook stages raw turn text to a queue; a separate model invocation (triggered at session-start, or asynchronously) processes the backlog into routed `_pending` candidates.
- **Fits**: Partial. Keeps per-turn cheap, but introduces a queue + an out-of-band model trigger the harness doesn't currently have. Session-start is a hook too (headless) — so "model at session-start" has the same no-model-handle problem unless it defers to the *next main-context turn*, which is effectively 1A-with-extra-steps.
- **Tests it enables**: queue-drain tests; ordering/idempotency tests.
- **Tradeoffs**: New stateful queue to maintain and prune; ordering/dedup complexity; the async trigger has no natural home in the current hook model. Higher blast radius if wrong. YAGNI risk: 1A already gets the recall win without the queue.

### Candidate 1C — Per-turn small-tier (Haiku) Anthropic API call from the hook
- **Summary**: `memory_stop` calls a small model per turn to extract/route candidates.
- **Fits**: No. Violates the hard per-turn budget (network latency on every Stop), adds an `@anthropic-ai/sdk` runtime dependency + API-key management into headless hooks, and breaks offline/headless/CI robustness (hooks must run without network). I did not pull context7 SDK specifics because the approach is rejected on architecture before API shape matters; if it is revived, the Anthropic SDK API must be confirmed via context7 then.
- **Tradeoffs**: Best raw per-turn recall, but at the cost of every constraint that matters here. Reversibility poor (key handling + network coupling spread into the hook layer).

**DP1 recommendation: 1A.** It is the only option that satisfies the cheap-per-turn budget, stays offline-robust, adds no dependency, preserves IX.3, and still raises recall (sentence-level capture) + adds true semantic routing (at flush). What would flip it: if the project decides per-turn model calls are acceptable (relaxing AC-8) AND accepts a network dependency in hooks → revisit 1C; if a real async job runner is added to the harness for other reasons → 1B becomes cheaper.

---

## Decision Point 2 — The durable resume thread (cf4a point 2)

Today `_resume.md` is overwritten every turn (`resume_writer.mjs:275-286`) and lost on `/clear`. `_thread.md` already exists as a **local + durable, `/memory-flush`-reset-exempt** class (Article IX.8, `thread_store.mjs`) with shelve/resume + 20-section pruning.

### Candidate 2A — Extend `_thread.md` / `thread_store` to carry the curated "what/why" working thread
- **Summary**: Reuse the existing durable trail. The "durable resume thread" becomes a curated thread entry (or a dedicated section) appended via `thread_store.appendEntry`, surfaced at session-start alongside the most-recent shelved thread.
- **Fits**: Yes, strongly — `_thread.md` already survives `/clear` and is reset-exempt; this is exactly the durability property cf4a point 2 asks for. Avoids a new artifact.
- **Tradeoffs**: Must distinguish "shelved-on-topic-switch" entries from a "current working thread" so resume surfaces the right one; the 20-section prune cap must not evict the active thread. Manageable within `thread_store`.

### Candidate 2B — New sibling durable artifact (e.g. `_worklog.md`)
- **Summary**: A third durable file dedicated to the working thread.
- **Tradeoffs**: Duplicates `_thread.md`'s durability + prune + base64 machinery; adds a file to the memory taxonomy, README, gitignore, and session-start injection. YAGNI vs 2A.

### Candidate 2C — Promote selected `_resume` content into the durable trail
- **Summary**: Keep `_resume.md` per-turn, but at shelve/`/clear`/compaction, distill its "what/why" into the durable trail.
- **Fits**: Yes — this is really a sub-mechanism of 2A (the source of the curated entry). Best treated as "how 2A populates the thread," not a separate artifact.

**DP2 recommendation: 2A, populated via 2C's distillation.** Extend the existing durable class rather than inventing a new file; source the curated "what/why" from the resume snapshot at durability-worthy moments (shelve / pre-compact). What would flip it: if spec finds the working-thread semantics genuinely conflict with shelve-on-switch semantics, split into 2B.

---

## Decision Point 3 — 91a3 boilerplate filtering location + shared noise list

Three noise-prefix sites today: `memory_stop.mjs:99` (the `NOISE_PREFIXES` constant), `resume_writer.mjs:81-82` (inline duplicate), `shelve_capture.mjs` (no filter). No recorded decision mandates capture-verbatim-vs-transform-later (decisions.md checked).

### Candidate 3A — Filter at capture (in `shelve_capture.extract`)
- **Summary**: Add `isBoilerplate(text)` in `extract`'s user branch; drop SKILL.md bodies (`^Base directory for this skill:`) and the wrapper prefixes before pushing a cue.
- **Fits**: Yes — matches `memory_stop`'s existing capture-time filtering (symmetry across capture hooks); the boilerplate is pure noise with zero downstream value, so filtering early is lossless. Simplest; deterministic; ~20-40 lines + fixture (the backlog's Tier-1).
- **Tradeoffs**: Slightly violates a "capture everything verbatim" purist stance — but that stance is not recorded as a decision, and the dropped content is provably non-signal (injected SOP text, not user authorship).

### Candidate 3B — Filter at render (`thread_store.readMostRecentMarkdown` / session-start injection)
- **Summary**: Keep capturing verbatim; strip boilerplate when surfacing.
- **Tradeoffs**: Boilerplate still bloats `_thread.md` on disk (cue caps `MAX_CUES=8`/`CUE_CHARS=800` get consumed by noise, evicting real cues — the exact 2026-05-31 failure). Filtering at render is too late: the noise already displaced signal at capture. Rejected for the cue-cap reason.

**Shared list**: lift `NOISE_PREFIXES` into `lib/common.mjs` as a single export; `memory_stop`, `resume_writer`, and `shelve_capture` all import it (intake AC-6). Add the `^Base directory for this skill:` skill-SOP marker to the shared set (or a sibling `isBoilerplate` helper co-located with it).

**DP3 recommendation: 3A + shared `common.mjs` noise source.** Filter at capture because the cue caps make render-time filtering lossy. This is the deterministic Tier-1; Tier-2 semantic weighting rides on DP1's flush-time model step. What would flip it: if a use case emerges for retaining raw boilerplate (none known), move to 3B.

---

## Decision Point 4 — Making "capture-more" testable (recall/precision metric)

### Proposal
A **fixture corpus** at `tests/fixtures/memory-capture/` of labeled utterances: each item is `{text, position: line-start|mid-sentence, expected: captured|ignored, bucket?}`. The corpus includes:
- known-positive intents at line-start (today's passing cases) and mid-sentence (today's misses, incl. the cf4a sentence);
- known-negative boilerplate (SKILL.md bodies, wrapper tags) that must NOT be captured;
- bucket labels for routed items (to score DP1's flush-time routing).

**Metrics**:
- **Recall** = captured / expected-captured, on the deterministic per-turn scanner (DP1-A). Target: 100% on the line-start set (no regression) + a defined floor on the mid-sentence set (propose ≥ the agreed threshold; "capture-more" disposition argues for a high floor).
- **Noise rate** = boilerplate-captured / total-boilerplate. Target: 0 on the known-prefix set (DP3-A is deterministic, so 0 is achievable).
- **Routing accuracy** (flush-time, DP1) = correct-bucket / routed, scored against corpus bucket labels.

Precision-vs-recall is tunable by the cue set; the corpus makes the tradeoff visible per change rather than asserted. This directly operationalizes intake success-metrics and AC-1/AC-5/AC-7.

**DP4 recommendation**: adopt the labeled fixture corpus + the three metrics; set the mid-sentence recall floor and acceptable noise rate as explicit spec ACs (the "capture-more" disposition → high recall floor, 0 known-boilerplate noise).

---

## Recommendation (rollup)
- **DP1: 1A** — broaden deterministic per-turn capture (sentence-level), defer semantic routing/weighting to `/memory-flush`'s existing main-context model step. No dependency, cheap per-turn, IX.3-safe.
- **DP2: 2A (+2C)** — extend `_thread.md`/`thread_store` for the durable working thread; populate by distilling the resume snapshot at shelve/pre-compact.
- **DP3: 3A + shared `common.mjs` noise list** — filter boilerplate at capture (cue caps make render-time lossy); converge the three noise sites.
- **DP4** — labeled fixture corpus + recall/noise/routing metrics as spec ACs.

This keeps the whole epoch dependency-free and inside the existing capture/transform/curation architecture; the only genuinely new behavior is (a) a sentence-level scanner, (b) `_pending` `route`/`weight` fields + a flush-time routing step, (c) a durable thread entry, (d) a capture-time boilerplate filter + shared noise list.

## Open questions (for the human at /spec / /approve-spec)
1. **Mid-sentence recall floor + acceptable `_pending` noise rate** — the "capture-more" disposition wants a high floor, but how much `_pending` curation burden is acceptable? Needs a number to lock DP4 ACs.
2. **`_thread.md` working-thread vs shelve-on-switch semantics** — confirm 2A can host both without the prune cap evicting the active thread; else split (2B).
3. **Flush-time routing UX** — should `/memory-flush` present the model's bucket suggestion as a default the human accepts/overrides, or just as advisory text? (Affects DP1 + the curation contract, which must stay human-final per IX.3.)
4. **Scope confirmation at the gate** — this is the design-only checkpoint; which of DP1-A / DP2-A / DP3-A actually get built first vs deferred (the user asked to reassess build scope at `/approve-spec`).
