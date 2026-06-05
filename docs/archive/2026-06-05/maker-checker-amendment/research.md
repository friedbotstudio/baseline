# Pattern Research — seed.md §II.A bounded maker/checker amendment

This memo has a corroboration charge (not a from-scratch option hunt): validate the maker/checker PoC findings against external literature and extract improvements that should shape the `§II.A` amendment text — especially the **graduation criteria** and the **boundedness mechanism**. The maker/checker design is already decided + empirically probed; the candidates below are for the two genuinely-open decisions.

**No third-party package APIs are introduced**, so `context7` has no applicable lookup (consistent with the PoC spec's libraries table). The only platform surface is Claude Code's dynamic Workflow runtime, already exercised empirically across three PoC runs. External grounding here is the research literature on generator-verifier loops, not a library API.

## Corroboration of PoC findings against external practice

| PoC finding (archived spec) | External verdict | Evidence |
|---|---|---|
| Oracle-bound checker: mechanical evidence (failing test / guard block) is **blocking**; bare opinion is **not a finding**. | **CORROBORATED, strongly.** | The **generation-verification gap** is a studied, real phenomenon: LLMs generate correct solutions but cannot reliably verify them; GPT-4 self-critique *diminishes* performance via false positives ([arxiv 2310.08118](https://arxiv.org/pdf/2310.08118), [Hazy/Stanford Weaver](https://hazyresearch.stanford.edu/blog/2025-06-18-weaver)). Grounding every checker claim in "concrete, verifiable evidence (compiler-verified builds, static-analysis findings, precise file/line)" is the recommended design for grounded code review ([arxiv 2510.10290](https://arxiv.org/pdf/2510.10290)). |
| Research/documentation evidence is **advisory** (surfaced, labeled lower-confidence), never blocking on its own. | **CORROBORATED.** | LLM-as-judge carries documented biases — position, verbosity, and **self-preference** (NeurIPS 2024: evaluators favor their own generations); frontier models exceed **50% error on bias tests** ([Adaline](https://www.adaline.ai/blog/llm-as-a-judge-reliability-bias), [arxiv 2509.26072](https://arxiv.org/pdf/2509.26072)). A non-mechanical finding *should* be advisory, not blocking. |
| Bounded to **one maker + one checker**; scaling to many agents deferred. | **CORROBORATED + QUALIFIED.** | Multi-agent debate *can* improve correctness, but "**multi-agent debate without verification reduces performance**" — unverified agents produce noisy/contradictory signal ([NeurIPS 2025 poster](https://neurips.cc/virtual/2025/poster/117644), [arxiv 2601.04742](https://www.arxiv.org/pdf/2601.04742)). QUALIFIER: the bound should be tied to *verification capability*, not just a head-count — adding agents is only safe once the oracle-grounding mechanism is proven. This directly informs the graduation gate. |
| Checker writes + **runs** its own adversarial test to ground a finding. | **CORROBORATED, with a circularity caveat.** | Metamorphic / executable-oracle grounding is the established answer to the "oracle problem" ([arxiv 2406.06864](https://arxiv.org/pdf/2406.06864): metamorphic prompt testing caught **75% of erroneous GPT-4 programs at 8.6% false-positive**). CAVEAT: deriving the test from the implementation-under-test creates a "**circularity of error**" — tests pass because they encode the bug ([arxiv 2602.10522](https://arxiv.org/html/2602.10522)). The checker's oracle must derive from *intended behavior / spec*, not the maker's code. |
| Deterministic code-driven orchestration (Workflow runtime) over model-driven turn-by-turn (Mirror-lite retained as fallback). | **CORROBORATED indirectly.** | The verification literature consistently treats the *verifier/oracle* as the load-bearing reliability component; deterministic control flow + schema-validated output reduce the orchestration-level variance that LLM-as-judge studies flag as a failure mode. No source contradicts the choice. |
| Hook governance reaches workflow agents (`tdd_order_guard`, `verify_pass_guard`, `swarm_boundary_guard` fire). | **Not externally corroborable — project-specific empirical fact.** | Verified in-session in the PoC; external literature has nothing to say about this baseline's hooks. Treat as settled by the PoC evidence, not by research. |

**Net:** every load-bearing PoC decision is corroborated. The single QUALIFIER worth encoding in the amendment is the *anti-circularity* rule for the checker's oracle, and the single sharpening is that **boundedness should be keyed to verification capability**, not an arbitrary count/date.

## Candidate A: Graduation gate keyed on measured oracle-grounding reliability *(recommended)*

- **Summary**: `§II.A` stays a bounded exception until the checker demonstrates *measured* verification reliability across governed runs — not "it worked once." Graduation criteria: (1) ≥ N governed maker→checker round-trips where every blocking finding was mechanically grounded; (2) a measured false-positive rate on blocking findings below a stated threshold; (3) a clean `/security` review of the checker's oracle artifacts; (4) an explicit maintainer ratification of a future permanent Article II rewrite.
- **Fits**: Yes — directly answers intake Open-Q1. Matches the literature's core message: the verifier is the risk, so graduation must prove the verifier, not the plumbing (which the PoC already proved).
- **Tradeoffs**: Requires defining "measured false-positive rate" concretely enough to be checkable; the baseline has no telemetry harness, so N and the FP bar are maintainer-judged from the workflow run record, not auto-computed. Honest limitation: these are human-audited criteria, not a mechanical gate.

## Candidate B: Candidate A + a numeric floor as a cheap backstop

- **Summary**: Everything in A, plus a hard numeric floor written into the text — e.g. "no graduation before K successful governed round-trips" — as a belt-and-suspenders that is trivially checkable even without telemetry.
- **Fits**: Yes — answers intake Open-Q2 (boundedness backstop) in the affirmative with the *minimum* additional machinery.
- **Tradeoffs**: A round-number K is somewhat arbitrary; risks reading as bureaucratic. But it costs ~1 sentence and gives a cheap, unambiguous floor under the judgment-based criteria. Low downside.

## Candidate C: Temporal / re-ratification backstop

- **Summary**: `§II.A` auto-lapses on a date or after a commit-count unless re-ratified by amendment.
- **Fits**: Weakly. Nothing in the literature supports a *time*-based bound; the risk is capability-shaped, not calendar-shaped. A sunset also adds a failure mode (the exception silently lapsing mid-use).
- **Tradeoffs**: Creates an expiry cliff with no evidentiary basis. Rejected as the primary mechanism; not worth the added fragility.

## Recommendation

Adopt **Candidate B** — graduation gate keyed on measured oracle-grounding reliability (A), plus a one-line numeric floor. Rationale: the external evidence says the verifier is the thing that must be proven before scaling, so an *evidence-keyed* graduation gate is the defensible bound; a small numeric floor makes it cheaply checkable without telemetry the baseline doesn't have. Reject the temporal backstop (C) — boundedness here is capability-shaped, not calendar-shaped.

Two text improvements to fold into the amendment regardless of which candidate wins:
1. **Anti-circularity rule** for the checker's oracle: the grounding test/relation SHALL derive from intended behavior or the spec, never from the maker's implementation (prevents the "circularity of error").
2. **Self-preference caveat**: because maker and checker may share a model family, a *non-mechanical* finding from the checker is advisory by construction — the amendment's existing evidence-ranking already encodes this; keep it explicit and cite *why* (self-preference bias).

What would flip the recommendation: if the maintainer wants graduation to be a pure maintainer-judgment call ("I'll decide when I've seen enough"), drop to **Candidate A** and omit the numeric floor — the floor only earns its place if a checkable minimum is wanted.

Placement (carried from scout, decided at `/spec`): the **binding** clause + graduation gate go tersely into `CLAUDE.md` Article II and `seed.md §4.2`; the **full narrative + corroboration rationale** go to the `.claude/CONSTITUTION.md` annex (no byte cap). This is forced by the **16-byte CLAUDE.md slack** (scout) — the annex-pointer pattern is not a preference, it is the only way to stay under the 38500-byte budget.

## Open questions

- **Concrete graduation numbers.** What are N (round-trips) and the false-positive threshold? The literature gives a reference point (metamorphic prompt testing: 75% detection at 8.6% FP) but not a baseline-specific target. Maintainer sets these at `/spec`.
- **Where graduation criteria are checked.** No telemetry harness exists; criteria are audited from the `/workflows` run record by the maintainer. Is that acceptable, or does graduation itself need a small measurement artifact? Decide at `/spec`.
- **`-9360` reconciliation.** The PoC spec's dependency graph still lists `-9360` as a separate "full charter" downstream of the PoC. The brainstorm resolved that `-c732` *absorbs* `-9360`. The spec must reconcile the backlog (`.claude/memory/backlog.md` keys `-c732`, `-9360`) so the graduation gate points at a *future, unnamed* permanent rewrite, not the retired `-9360` label.
