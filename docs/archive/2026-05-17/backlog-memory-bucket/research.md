# Pattern Research — backlog-memory-bucket

This memo surfaces candidate approaches for the five design decisions identified in the intake's Open Questions and scout's Constraints. Decisions are deferred to `/spec`; this memo lays out the option space with tradeoffs grounded in in-repo evidence.

**No external libraries.** This work extends an existing Python heredoc inside `memory_stop.sh` and a markdown SOP at `memory-flush/SKILL.md`. There is no third-party API surface — `context7` is not applicable. All evidence is in-repo.

---

## Q1 — Intent-pattern matching strategy

### Candidate A1: Anchored line-start regexes (precision-favoring)

- **Summary**: Mirror the proven pattern at `sweep.py:38–42` (PROSE_PATTERNS for R1/R2/R3 closure detection). Patterns anchored on `^` with `re.I | re.M` flags so they match only at line starts of bullets, headings, or paragraph leads — never mid-sentence.
- **Pattern shape (illustrative, not final)**:
  ```python
  INTENT_PATTERNS = [
      re.compile(r'^(?:\s*[-*]\s*)?TODO[\s:]', re.I | re.M),
      re.compile(r'^(?:\s*[-*]\s*)?(next\s+we\s+(?:should|need\s+to|must)|let\'?s\s+also|backlog\s+this)\b', re.I | re.M),
      re.compile(r'^(?:\s*[-*]\s*)?(we\s+should\s+also|after\s+this(?:\s+lands)?|eventually\s+we\s+(?:should|need))\b', re.I | re.M),
  ]
  ```
- **Fits**: Yes — directly mirrors `sweep.py`'s R1/R2/R3 style for closure-phrase detection. Scout's "Patterns in use here" section calls out that anchored line-start regexes are the proven precision pattern in this codebase.
- **Tests it enables**: Fixture-based tests with positive (line-anchored) and negative (mid-sentence) inputs, identical in shape to the AC-002 prose-scan tests in `.claude/skills/memory-flush/tests/run.sh:215–227` (`test_when_body_has_resolved_midsentence_then_not_surfaced`).
- **Tradeoffs**: Misses intent expressed inside prose paragraphs ("...so the next thing we should do is..."). That's the *point* — the user's verbatim constraint explicitly chose recall sacrifice over false-positive risk. Accepting that trade is the precondition of the work, not a flaw.

### Candidate A2: Keyword whitelist with word-boundary matching

- **Summary**: Build a list of trigger phrases and use `\b...\b` matching anywhere in text, not line-anchored.
- **Pattern shape**:
  ```python
  INTENT_TRIGGERS = re.compile(
      r'\b(TODO|FIXME|XXX|backlog\s+this|next\s+(?:we|step)|let\'?s\s+also|we\s+should\s+also)\b',
      re.I,
  )
  ```
- **Fits**: Partially — this codebase *does* use word-boundary regexes for other matchers (`audit.sh:664+` NUM pattern uses word boundaries), but for distinct reasons (parsing structured count claims, not extracting natural-language intent).
- **Tests it enables**: Same fixture pattern as A1.
- **Tradeoffs**: Higher recall, materially higher false-positive rate. `Q-003` in `pending-questions.md` is the cautionary tale — regex-over-string in `git_commit_guard` produces false positives that force `-F /tmp/msg.txt` workarounds. Same family of problem here: extracting structured signal from unstructured text without context awareness.

### Candidate A3: Lightweight intent classifier (heuristic scoring)

- **Summary**: Compute a score per sentence based on trigger-word density, sentence position (lead vs trailing), and surrounding cues (imperative voice, future-tense markers). Threshold for emission.
- **Fits**: No — adds complexity for a marginal recall gain. No precedent in this codebase for stat-style scoring; every other extraction is regex-based.
- **Tests it enables**: Harder to test deterministically; thresholds drift.
- **Tradeoffs**: Overkill. The user constraint is "precision over recall"; a heuristic classifier optimizes the wrong direction.

### Recommendation (Q1): **A1 (anchored line-start regexes)**

Mirror `sweep.py:38–42`. Start with a conservative ~6 patterns and iterate the test fixture set during /tdd. The pattern would flip toward A2 only if real usage shows the line-anchored regexes miss obvious cases — but the AC explicitly states mid-sentence matches are unacceptable, so A1 is the default that respects the constraint.

---

## Q2 — Extraction surface (user / assistant / both)

### Candidate B1: User prompts only

- **Summary**: Walk transcript events with `role == "user"`, extract intent from `type == "text"` blocks (after stripping `<system-reminder>`, `<command-name>`, `<local-command-*>` noise per `resume_writer.py:110–114`).
- **Fits**: Yes — strongest signal (the user is the actual source of intent).
- **Tradeoffs**: Misses intent verbalized by Claude during conversation. The intake's AC-2 explicitly requires assistant-text extraction, so this alone violates the AC.

### Candidate B2: Assistant text only

- **Summary**: Walk events with `role == "assistant"`, extract intent from `type == "text"` blocks.
- **Fits**: No — the intake's AC-1 explicitly requires user-prompt extraction.
- **Tradeoffs**: Risks an echo-chamber effect — Claude reading its own backlog candidates from `_pending.md` or `_resume.md`, then re-verbalizing them in the next turn, then re-extracting. Not load-bearing if dedup keys are stable (Q5).

### Candidate B3: Both user and assistant text, distinct provenance

- **Summary**: Walk events from both roles. Emit candidates with role-tagged provenance (`source: user-instruction` vs new value — see Q3). Apply the same intent-pattern set to both, but with stricter anchoring for assistant text (e.g., only line-leading bullets, not paragraph leads) to suppress Claude's natural tendency to write narrative summaries that contain trigger phrases.
- **Fits**: Yes — satisfies both AC-1 and AC-2. Acknowledges the asymmetric false-positive risk between the two roles.
- **Tests it enables**: Per-role fixture tests; explicit echo-chamber regression trap.
- **Tradeoffs**: Two extraction loops to test instead of one. The stricter assistant-text anchoring is a defensible heuristic but adds a knob.

### Recommendation (Q2): **B3 (both, distinct provenance)**

Required by AC-1 + AC-2. Implement with shared regex set + per-role anchoring tuning. The echo-chamber risk is real but bounded by stable dedup keys (Q5).

---

## Q3 — Provenance enum extension

### Candidate C1: Add `source: assistant-deferral`

- **Summary**: Extend the enum in `.claude/memory/README.md → Source provenance` with one new value. Backlog candidates from `role: user` keep `source: user-instruction` (existing) with `verbatim:` block; backlog candidates from `role: assistant` carry `source: assistant-deferral` with `verbatim:` block of Claude's own sentence.
- **Fits**: Yes — clean semantic match. The verbatim block obligation extends to assistant-deferral entries on the same principle (the entry body is interpretation; the verbatim is canonical).
- **Tests it enables**: README schema validation; promotion-gate test in `/memory-flush` that a backlog candidate with `source: assistant-deferral` carries a verbatim.
- **Tradeoffs**: Schema change. `README.md` table + prose + the `/memory-flush` SKILL.md rejection rule all need a coordinated update. Scout confirmed no validator hard-codes the existing six values (the enum is documentation, not code-enforced beyond the verbatim-required check), so the change surface is bounded.

### Candidate C2: Reuse `inferred-from-code`

- **Summary**: Treat assistant-derived backlog as `inferred-from-code` (since Claude inferred the intent during code reading).
- **Fits**: No — semantically wrong. `inferred-from-code` means "derived by reading the codebase" (the verbatim is N/A). Assistant-deferral has a verbatim (Claude's sentence) and is derived from conversation, not from code.
- **Tradeoffs**: Pollutes the existing enum's semantics; future memory-grep work distinguishing code-derived from chat-derived facts gets harder.

### Candidate C3: Unified `conversation-extraction` value + body `role:` field

- **Summary**: Single new value covering both user and assistant text-derived candidates. The body carries `role: user|assistant` to disambiguate.
- **Fits**: Partial — simpler enum, but loses the verbatim-required asymmetry. User-instruction already requires a verbatim; assistant-extraction also benefits from a verbatim. The schema needs both regardless of how the enum is named.
- **Tradeoffs**: One less enum value to maintain, one more body field to validate. Wash.

### Recommendation (Q3): **C1 (extend enum with `assistant-deferral`)**

Most honest semantics, clearest verbatim contract (the verbatim block requirement extends to the new value with no special-case). Document the new value in `README.md` + add it to `/memory-flush`'s verbatim-required check.

---

## Q4 — Closure-field register for backlog

### Candidate D1: Add new register (`picked-up-at:` + `dropped-at:`)

- **Summary**: Introduce two new closure fields. `picked-up-at: <ISO>` marks the entry as taken into a workflow (e.g., an `/intake` was drafted from it). `dropped-at: <ISO>` marks an explicit drop. Both trigger auto-close deletion at the next `/memory-flush` Step 0 sweep, like `resolved-at:` / `superseded-at:` today.
- **Fits**: Partial — matches the intake's explicit `status: open|picked-up|dropped` schema. New code in `sweep.py:143` (`closure_field_for`) and `memory_session_start.sh:99–100` (`_is_stale` closure check) to handle the two-field union.
- **Tradeoffs**: Cleanest mapping to the three-state status. But deletion-on-close loses the audit trail of which backlog items historically got picked up — the file becomes "open only." That may be the right design (the canonical files aren't archives), but the `/pm` skill downstream may want history.

### Candidate D2: Reuse `superseded-at:` semantically

- **Summary**: Treat both picked-up and dropped as `superseded-at:` — the open-intent fact is no longer current. Body field `- status: picked-up|dropped` records which transition. Auto-close deletes the block as usual.
- **Fits**: Yes — zero new closure fields. The existing `superseded-at` register already means "the fact is no longer true," which fits both transitions ("not open anymore"). Body `status:` is descriptive prior to close; closure field is the deletion trigger.
- **Tests it enables**: Reuses the existing AC-001 auto-close test pattern in `tests/run.sh:118–130` — extend the fixture to cover a backlog entry with `status: picked-up` + `superseded-at:` and verify it's deleted.
- **Tradeoffs**: Loses the structural distinction at the closure-field level (you'd grep the body to know if a superseded entry was picked-up vs dropped). For the `/pm` use case, this is recoverable from git history of `backlog.md` plus the body's `status:` field at the moment of close.

### Candidate D3: Decay-exempt + body-status-only

- **Summary**: Treat backlog entries as never stale (verifying intent against code is semantically nonsensical) and never auto-closed by `/memory-flush` sweeps. Status transitions are pure body edits. Deletion happens only by explicit curator action or size-cap pruning.
- **Fits**: Partial — semantically clean (backlog is intent, not fact, so `verified-at:` is a stretch and decay doesn't apply). But size-cap pruning still needs to happen, and `last-touched` is the existing prune signal — so the entries aren't truly decay-exempt, just stale-exempt.
- **Tradeoffs**: Diverges most from the existing pattern. Special-case logic in `sweep.py:155–166` (`is_stale`) and `memory_session_start.sh:98–109` (`_is_stale`) — every file is uniform today; carving out backlog adds branching.

### Recommendation (Q4): **D2 + decay-exempt narrow scope**

Use `superseded-at:` for closure (no new register, minimal code surface). But explicitly mark backlog as **stale-exempt** in the stale predicate at `memory_session_start.sh:98–109` and `sweep.py:155–166` — backlog entries don't go stale by commit-distance or day-count because intent is not a verifiable fact. Size-cap pruning still applies via `last-touched` ordering, but the SessionStart stale-block surfacing and the Step 0c stale-sweep skip backlog entries.

The combination keeps the schema minimal (one less new field than D1) while honoring the "intent isn't a verifiable fact" insight from D3.

---

## Q5 — Stable-key derivation for backlog candidates

### Candidate E1: Short content hash (8-char sha256 prefix)

- **Summary**: Compute `hashlib.sha256(normalized_intent.encode()).hexdigest()[:8]` where `normalized_intent` is lowercased, whitespace-collapsed, leading-trigger-word stripped. Key shape: `## CANDIDATE: backlog → <8-char-hash>`.
- **Fits**: Robust within-session dedup (same intent → same hash) and cross-session dedup (deterministic across flush cycles).
- **Tradeoffs**: Opaque. Curator reading `_pending.md` sees `## CANDIDATE: backlog → 3f2ac891` and must read the body for the verbatim. Slightly worse UX for human review.

### Candidate E2: Slug-from-first-N-words

- **Summary**: Derive a kebab-case slug from the first ~8 normalized words of the intent. Key shape: `## CANDIDATE: backlog → add-retry-to-webhook-worker`.
- **Fits**: Human-readable; curator can scan candidate names without reading bodies.
- **Tradeoffs**: Different intents that start with the same N words collide. Example: "next we should add retry logic" and "next we should add retry tests" both slug to `next-we-should-add-retry`. Within-session dedup over-collapses.

### Candidate E3: Slug + hash disambiguator (hybrid)

- **Summary**: Combine — `<8-word-slug>-<4-char-hash>`. Key shape: `## CANDIDATE: backlog → add-retry-to-webhook-worker-3f2a`.
- **Fits**: Human-readable AND collision-resistant. Cross-session dedup works because both halves are deterministic.
- **Tradeoffs**: Slightly longer key. Marginal extra code (concat + 4-char hash trim) vs E1 or E2 alone. The hash piece guards against the "same prefix, different intent" collision in E2.

### Recommendation (Q5): **E3 (slug + hash disambiguator)**

Best UX (curator can read key directly) plus correctness (hash guards collisions). Implementation: ~6 lines inside the existing python3 heredoc in `memory_stop.sh`. Normalization (lowercase, whitespace-collapse, strip trigger phrase) shared between slug derivation and hash input so they stay aligned.

---

## Synthesis — recommended path

Compose the recommendations into a single coherent design:

1. **Pattern set** (Q1): ~6 anchored line-start regexes; `^(?:\s*[-*]\s*)?<trigger>\b` style; precision-favoring. Start with: `TODO[:\s]`, `next we (should|need to|must)`, `let'?s also`, `we should also`, `backlog this`, `after this (lands|ships)`.

2. **Surfaces** (Q2): Walk both user and assistant text blocks. Reuse `resume_writer.py:72–88`'s `_extract_text_blocks` helper pattern; reuse the noise filters at `resume_writer.py:110–114` (skip `<system-reminder>`, `<command-name>`, `<local-command-*>`).

3. **Provenance** (Q3): Extend the enum with `source: assistant-deferral`. User-derived backlog stays `source: user-instruction`. Both carry verbatim blocks.

4. **Closure** (Q4): Reuse `superseded-at:` for picked-up + dropped (body `status:` field disambiguates). Mark backlog entries as **stale-exempt** in the stale predicate.

5. **Dedup keys** (Q5): Slug (first ~8 normalized words) + 4-char sha256 hash suffix. Stable across sessions.

This shape keeps schema changes minimal (one new enum value, one new canonical file, one stale-predicate carve-out) while satisfying every intake AC.

---

## Open questions

The following remain for the spec author to decide:

- **OQ-1**: Should the closure-field auto-close on `superseded-at:` preserve the entry's verbatim and status in a transition log (e.g., a one-line append to `docs/archive/backlog/<date>.log`) so the `/pm` skill can reconstruct history? Or is `git log .claude/memory/backlog.md` sufficient as the history record?

- **OQ-2**: Should `memory_stop.sh` emit at most N backlog candidates per turn (rate limit), or all matches? A turn with 5 separate intent lines could flood `_pending.md`. Recommend: cap at 3 per turn, log the truncation count.

- **OQ-3**: What's the bootstrap entry for `backlog.md` so the audit's `entry_count > 0` rule passes on first commit? Suggest a self-referencing bootstrap entry: `## bootstrap` with body explaining the file's purpose, `source: inferred-from-code`, `status: dropped`, `superseded-at: <date>` so it auto-closes on the first /memory-flush sweep after install — leaving the file empty-bodied (acceptable; the rule is "at least one entry" at *install* time).

- **OQ-4**: The intake's optional `depends-on: [[other-backlog]]` field — should `/memory-flush` validate that linked targets exist at promotion time, or accept dangling links per the existing `[[name]]`-can-be-future-write semantics in `README.md → CLAUDE.md → Auto memory § Step 1`? Recommend: accept dangling, mirror existing convention.

- **OQ-5**: Should the spec add a smoke test that runs `bash .claude/skills/audit-baseline/audit.sh` end-to-end as an AC check, or rely on `/integrate` Phase 9 to catch audit regressions? Recommend: in-spec AC for audit pass — the audit is the binding `test.cmd`.
