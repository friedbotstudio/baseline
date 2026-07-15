# Pattern Research — enforcement oracle framework (C2 + C3 + C4)

## Prior art (retrieved)

The heavy lifting on *why* is already decided upstream — this memo derives only the *how* delta.

- **`decisions.md → v1-maker-checker-substrate-2026-06-06`** — the §II.A bounded charter shipped: clause 6 caps (one maker, one checker) bind until clause 7's graduation gate (≥3 governed round-trips, every blocking finding mechanically grounded, 0 false-positive blocks, clean `/security` of the oracle artifacts, maintainer ratification). **Constraint, not open question:** C3 must stay inside clause 6 (no LLM fan-out of checkers) until that gate is met.
- **`decisions.md → tier-dial-oracle-floors-2026-06-16`** — "BLOCKING is explicitly piece 5 (maker/checker RALPH stop-rule)"; `ceiling` is the effort/round budget; **"`ceiling-below-floor` must yield (never silently downgrade, mirroring `verify_pass_guard`'s PASS-when-FAIL lesson)."** This is the C3 RED-state requirement, already ratified. Validated build sequence: piece 4 (oracle-bound refit = C2) → piece 5 (blocking stop-rule = C3).
- **`docs/archive/2026-06-05/maker-checker-amendment/research.md`** — external evidence: *"multi-agent debate without verification reduces performance"* (NeurIPS 2025 poster 117644; arxiv 2601.04742). **The verifier/oracle is the load-bearing component; the bound must be tied to verification capability, not head-count.** Directly kills any "add a third LLM voter" arbitration design.
- **Ledger #0002** (via `decisions.md`) — CO-C (quality-oracle) = backlog `-d186` (C2) + `-4c43` (C3); C4 hard-depends on B1 only (landed). This whole workflow is Epic 3's remaining spine.

Delta to derive below: (1) C4's concrete scoring mechanism, (2) C3's stop-conditions + a *mechanical* arbitration, (3) how the code-time review skills join a spec-review-scoped fan-out.

---

## Q1 — Design-judge scoring model + threshold (C4; AC-006/007)

**API references (current, verified live this session — MCP tool schemas, not training recall):**
- `mcp__playwright__browser_navigate({url})` — load the rendered surface.
- `mcp__playwright__browser_snapshot({boxes, depth, filename, target})` — accessibility tree; **`boxes:true` returns each element's `[box=x,y,width,height]` viewport-relative CSS px (`getBoundingClientRect`)**. Deterministic, diffable, "better than screenshot".
- `mcp__playwright__browser_take_screenshot({type:'png'|'jpeg', scale:'css'|'device', fullPage, filename})` — pixel capture for the advisory vision read.
- `@playwright/mcp@latest` chrome `--isolated` (`.mcp.json`). No browser → the tool call errors → the judge SKIPs (AC-007).

### Candidate A: Pure structural/heuristic score (deterministic, no LLM)
- **Summary**: score the rendered surface against the B1 **Quality criteria** cell (which B1 already forces to be *measurable*) using the snapshot `boxes` + computed styles — element presence, contrast ratio, responsive breakpoints, layout tolerance, CLS. No model in the loop.
- **Fits**: strongly (Scout: "mechanical oracles are pure `.mjs`… fail-open velocity levers; the graduation gate is fail-closed"). Pure oracle → §II.A clean, no subagent, reproducible.
- **Tests**: deterministic — a fixture page + a fixture criteria row → a fixed pass/fail.
- **Tradeoffs**: cannot judge *subjective* fidelity ("doesn't feel like a SaaS template"). The B1 **Reference target** (a URL/mock/Figma frame) is not machine-comparable unless it is itself a rendered page.

### Candidate B: Main-context LLM-vision judge
- **Summary**: screenshot + reference image → a Claude vision scoring pass **in main context** (not a subagent), emitting a numeric fidelity score that gates verify.
- **Fits**: partially. Article II is satisfied only if the read stays in main context — but a *gating* vision score is non-deterministic and non-reproducible, and "below threshold FAILS verify" needs a stable number. A flaky judge that fails a good UI is the AC-006 nightmare.
- **Tradeoffs**: reproducibility (same input, different score across runs); makes `verify` model-dependent; hard to unit-test without mocking the model (which seed.md forbids for internal code, though vision-of-an-external-render is a gray area).

### Candidate C: Hybrid — mechanical teeth + advisory vision *(recommended)*
- **Summary**: the **BLOCKING** score is Candidate A (mechanical, scored against the B1 Quality-criteria cell). A Candidate-B vision read runs too but is **ADVISORY only** — surfaced to the human, never auto-fails verify (same pattern as integrate's cross-engine smoke, Scout B7: "advisory… never flips the verify verdict"). The Reference target is the vision anchor; the Quality criteria are the mechanical gate.
- **Fits**: best. Teeth are deterministic + reproducible + §II.A-clean; subjective fidelity is captured without making the build model-dependent. B1's design was *built for this* — it forces measurable quality criteria precisely so C4 can score them mechanically.
- **Threshold home**: the **tier dial** — add `design-judge` (or reuse `review`) to `CANONICAL_CHECKERS` so its floor/ceiling live in `project.json → tier.level` / `tier.overrides`, consistent with every other checker. A `velocity.design_judge` key only for the enable/disable + SKIP-on-no-browser toggle. No parallel threshold system.
- **Tradeoffs**: two code paths (mechanical + vision). Mitigated: the vision path is thin and advisory, and reuses integrate's screenshot plumbing.

**Recommendation: Candidate C.** What flips it: if a reviewer decides subjective fidelity MUST gate (not just advise), escalate to B — but then accept a non-deterministic verify and design a reproducibility harness first. The mechanical-teeth default matches the ratified "oracle is load-bearing" prior art.

---

## Q2 — Stop-rule round budget + arbitration (C3; AC-004/005)

### Candidate A: Ceiling-driven rounds + grounding-gated arbitration + RED-yield *(recommended)*
- **Summary**: the loop reads the per-checker **`ceiling`** from the tier dial as the round budget (regulated tier → 2–3, Scout). Each round: maker acts → checker runs (mechanical oracle) → `applyReplan` **records** the round (append-only, already built). Stop conditions: **converged** (checker CLEAN → PASS), **dry-round** (a round produces no maker change AND no new finding → stop), **oscillation** (a finding toggles across rounds → stop), **ceiling-hit-below-floor** (rounds exhausted, still below the checker's floor → **RED**). RED writes a yield state and hands to the human — never a silent advisory downgrade (ratified in `tier-dial-oracle-floors`).
- **Arbitration is MECHANICAL, not a vote**: a maker↔checker disagreement is broken by **grounding** — only findings backed by a concrete mechanical artifact (`finding.artifact != null`, the existing `normalizeFinding` gate) may BLOCK; an ungrounded checker finding degrades to ADVISORY and cannot wedge the loop. This is the NeurIPS-backed "tie the bound to verification capability, not head-count" rule made concrete — **no third LLM voter**.
- **Fits**: strongly. Reuses `ceiling` (Scout: "resolved-but-unread — C3 is its first consumer"), `applyReplan` (records), `evidence-ledger` (`false_positive_blocks`), and `normalizeFinding` (grounding). Reconciles with `graduation-gate` cleanly: the **stop-rule governs one run's rounds**; the **graduation gate governs whether the checker earns permanent trust** (≥3 governed round-trips ∧ 0 FP ∧ security-clean) — orthogonal, both kept.
- **Tests**: deterministic — inject a checker that stays RED N rounds → assert RED-yield at ceiling; inject an ungrounded finding → assert it degrades to advisory (AC-005); inject convergence → assert PASS.
- **Tradeoffs**: "oscillation" detection needs a finding-identity key (checker+check+artifact-hash) to compare across rounds; defining it precisely is the real work.

### Candidate B: Fixed round cap (ignore the ceiling)
- **Summary**: hard-code a round cap (e.g. 3) independent of tier.
- **Tradeoffs**: throws away the tier dial's per-checker/per-tier ceiling that was built for exactly this; a regulated repo and an internal tool get the same budget. Rejected — duplicates config that already exists.

**Recommendation: Candidate A.** What flips it: if a reviewer wants arbitration to escalate to the human *before* the ceiling (not only at ceiling-hit-below-floor), add an early `ask_human` on first oscillation — a small extension of A, not a different design.

**Article II flag:** the maker/checker loop stays within clause 6 (one maker, one checker; checkers are mechanical oracle scripts). No amendment needed **as long as the "maker" is the main-context model driving deterministic `.mjs` checkers** and no checker fan-out spawns agents (`assertFanoutAllowed` stays the backstop). The spec MUST pin exactly where any LLM call sits. If C3 ever needs concurrent LLM checkers, that is a §II.A clause-7 graduation event — flag, do not slip it in.

---

## Q3 — Checker interface shape (C2; AC-001/002/003)

### Candidate A: Extend the registry as-is + enrich `ctx` with a phase tag *(recommended)*
- **Summary**: keep `DEFAULT_CHECKER_REGISTRY` (`name → (ctx) => {findings}`) — it already serves 3 checkers cleanly (Scout). Do **not** generalize the interface. Two concrete moves:
  1. **Enrich `ctx`** from `{slug, rootDir, specContent, intakeContent}` to also carry `{diffContent, changedFiles}`, and tag each checker's **phase** (`spec-review` vs `code-review`). The harness runs the spec-review subset before `approve-spec` (today's boundary) and the code-review subset at the verify/integrate boundary. This is the missing bridge Scout flagged: `security`/`simplify`/`code-structure` score the **diff**, not the spec, so they need a code-time invocation of the same interface.
  2. **Refit each review skill to an `oracle.mjs`** mirroring `spec-rollout-enforceability-review/oracle.mjs` (`run*(ctx) → {findings}`, `normalizeFinding`, DI'd `resolveCheckerThreshold`):
     - **`security`** → an oracle that parses the `docs/security/<slug>-*.md` report into findings (count of Critical/High vs the `security` floor of 0 → BLOCKER when mandatory). The prose report stays; the oracle reads it. Read-only preserved.
     - **`simplify`** → an oracle emitting a `flagged`-count verdict from the verdict table (advisory unless a `flagged` item is a real defect); reuses `reverify-guard.mjs` for the skip path.
     - **`code-structure`** → **ADVISORY-only** (see below). A tractable mechanical subset of its Detection Rules (file > ~80 substantive lines; an orchestration file containing raw primitives by a heuristic) as `artifact:null` findings that never BLOCK. Do **not** fake teeth on arbitrary-code structural analysis.
- **Fits**: best (YAGNI — the interface works; generalizing it is speculative). Preserves the gate-A `CLEAN/BLOCKED` projection (`spec_approval_guard.mjs:72`) because spec-review checkers are unchanged; code-review checkers write a *parallel* projection at the verify boundary, not the gate-A one.
- **Deferred diagram checks land in `spec-diagram-review/oracle.mjs`** (all mechanical, BLOCKER-capable when mandatory):
  - **class-to-DDL**: parse `<<new>>`/`<<changed>>` class fields, require a matching `ALTER`/`ADD COLUMN` in the `#### Migration DDL` block.
  - **AC-to-sequence**: each `AC-NNN` with a `§Behavior #N` ref must resolve to a titled sequence (shares logic with `spec-lint checkTraceability` — factor into the oracle).
  - **Container-to-Component**: each `Container(...)` in the C4_Container diagram whose internals change must appear in a `C4_Component` boundary.
- **Tradeoffs**: enriching `ctx` + a second (code-review) fan-out invocation is real surface. Mitigated: same interface, same merge, same projection format — just a different call site and a diff-carrying ctx.

### Candidate B: A second, separate code-review fan-out module
- **Summary**: leave the spec-review fan-out alone; build a distinct `code-checker-fanout.mjs`.
- **Tradeoffs**: two near-identical runners drift (the exact guard↔lint divergence B1 just fixed with a shared lib). Rejected — one interface, phase-tagged, is DRY-correct.

**Recommendation: Candidate A.** What flips it: if enriching `ctx` proves to break a spec-review checker's assumptions, fall back to B with a **shared merge/persist lib** so the two runners can't diverge.

---

## Open questions (for the human at `/spec`)

1. **Does subjective visual fidelity gate, or only advise?** (Q1) The recommendation makes it advisory; the mechanical Quality-criteria score is the teeth. Confirm this is the intended bar for AC-006 — if fidelity must gate, the spec needs a reproducibility design for the vision score.
2. **`code-structure` as advisory-only.** (Q3) Confirm it is acceptable that the `code-structure` checker never emits a BLOCKER (structural analysis of arbitrary code is not mechanically sound enough to wedge a build). The alternative is scoping it to a narrow, defensible mechanical subset.
3. **Where does the code-review fan-out fire?** (Q3) At the `verify` boundary, the `integrate` boundary, or both? This affects whether a code-review BLOCKER blocks the commit or just the verify verdict.
4. **`design-judge` as its own tier-dial checker vs. reusing `review`.** (Q1/Q2) A new `CANONICAL_CHECKERS` entry is cleaner but touches the tier-dial coverage test; reusing `review` avoids that but conflates two concerns.
5. **Round-budget source under `regulated`.** (Q2) Confirm reading `ceiling` per-checker (2–3 here) is right, vs. a single global cap — the recommendation reads the dial.
