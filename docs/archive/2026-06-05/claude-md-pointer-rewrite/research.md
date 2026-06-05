# Pattern Research — CLAUDE.md → annex headroom restructure

No third-party libraries are involved (governance/docs restructure), so **context7 is not applicable** — there is no external API to verify. The "candidates" below are *relocation strategies*, evaluated against the scout's constraint surface.

## Size map (measured, grounds every candidate)

CLAUDE.md = 38,479 chars / 40,000 hard cap / 38,500 soft target (1,521 / 21 headroom).

| Article | chars | % | character of content |
|---|--:|--:|---|
| X — Project-specific rules (X.1–X.5) | 10,003 | 26% | long tables (impeccable scoping, design routing, brainstorm, codesign) — mostly elaboration |
| IV — Workflow ordering | 5,536 | 14% | the 11-phase table + track prose |
| VIII — Hooks | 3,507 | 9% | 22-row table + per-hook behavior prose |
| XI — Skill provenance | 3,307 | 9% | manifest mechanics prose |
| IX — Project memory | 2,739 | 7% | |
| V — Harness SOP | 2,587 | 7% | |
| III — Session-start | 2,545 | 7% | includes verbatim greeting blocks |
| VII — Git rules | 2,527 | 7% | forbidden-flags list |
| VI, II, I, Appendix, preamble | ~6,700 | 17% | mostly already terse |

Annex (`.claude/CONSTITUTION.md`, 24,607 chars, no cap) already has: §1 amendment history, §2 enforcement-mechanism narration, §3 Appendix A, §4 Appendix B — a ready home for relocated per-Article detail.

## Candidate A: Thin pointer-per-Article (deep relocation)

- **Summary**: Reduce every Article in CLAUDE.md to its binding SHALL/SHALL-NOT clauses + required marker literals + a pointer to a new annex subsection carrying the full rule text, tables, examples, and narration. CLAUDE.md becomes an index of binding clauses.
- **Fits**: Partially. It is the literal framing of the original request, and the annex already hosts narration (scout: annex §2). But it touches all 11 Articles and the preamble — high surface.
- **Tests it enables**: Marker/heading-survival test (must keep every `REQUIRED_BINDING_MARKER` + `## Article N`), cap+headroom test at a much lower target (could reach ~28–30k), byte-equal mirror, audit citations.
- **Tradeoffs**: Largest headroom gain, but highest risk and effort. Per-Article "binding vs narration" line-drawing is judgment-heavy across the whole file; high chance of accidentally orphaning a marker literal or weakening a rule's in-context presence. Reversibility: low — a wholesale rewrite is hard to partially revert. Biggest YAGNI risk: relocating Articles that are already terse (I, II, VI) buys almost nothing for real churn.

## Candidate B: Narration-only trim (conservative, no structural change)

- **Summary**: Keep CLAUDE.md's structure and all binding rules in place. Move only unambiguously non-binding bulk to the annex: long enforcement-narration paragraphs, embedded examples, and the verbatim greeting/quote blocks (Art III). Compress the Art VIII per-hook behavior prose (the terse table already carries the binding mapping).
- **Fits**: Strongly. Lowest-risk read of "carries binding rules only" (Art I.6 already says narration belongs in the annex). Matches the existing hand-maintained-mirror pattern.
- **Tests it enables**: Same guards, modest target (realistically ~34–35k).
- **Tradeoffs**: Smallest blast radius, easiest to review and revert. But the headroom gain is modest — it may not deliver "comfortable" headroom if the maintainer wants a large margin. Leaves Article X (the 10k giant) largely untouched, which is where the real weight is.

## Candidate C: Hybrid — convert the heavy Articles, trim the rest (RECOMMENDED)

- **Summary**: Apply Candidate-A pointer-style **only to the heaviest, most-elaborative Articles** — Article X (10k, mostly tables that elaborate already-binding routing rules), and the behavior-prose of Article IV/VIII — relocating their detail tables and examples to new annex subsections while leaving a terse binding clause + pointer in CLAUDE.md. Apply Candidate-B light trims to the rest. Leave the already-terse Articles (I, II, VI) alone.
- **Fits**: Best. Targets the 26%/14%/9% Articles where chars actually live (scout size map); leaves low-value Articles untouched (YAGNI). Annex destination structure already exists.
- **Tests it enables**: Cap+headroom at a meaningful new target (~31–33k achievable by moving most of X's tables + IV/VIII prose); marker/heading survival (keep the binding clause + literals in CLAUDE.md); byte-equal mirror; audit citations; seed-first amendment.
- **Tradeoffs**: Moderate effort and risk, concentrated in a few Articles rather than spread across all. Reversibility: medium — changes are localized to named Articles. Requires care that X.1–X.5 binding rows keep a clause in CLAUDE.md (e.g. the `spec_design_calls_guard`, `design-ui` routing obligations) even as their explanatory tables move.

## Recommendation

**Candidate C (hybrid).** It puts the effort where the chars are (Article X is a quarter of the file) without the whole-file blast radius of A or the thin payoff of B. The decision flips to:
- **Candidate A** if the maintainer wants CLAUDE.md to genuinely become a thin index (a stated architectural preference beyond just headroom), accepting the rewrite risk.
- **Candidate B** if the maintainer wants the smallest, most-auditable diff and is content with ~34–35k.

On the **target**: recommend setting a concrete enforced soft target of **≤ 34,000 chars (≥ 6,000 headroom)** — a 4× margin improvement over today's 1,521, comfortably absorbing several future Article additions, and reachable by Candidate C without the risk of A. This means lowering `CLAUDE_TARGET_MAX` (currently 38,500) at its single site (`code-browser-primary-navigation.test.mjs:39`); the 40,000 hard cap stays.

## Open questions

- **End-state preference** (spec/codesign decision): thin-index (A) vs heavy-Articles-only (C) vs minimal-trim (B)? Recommendation is C.
- **Concrete target**: confirm ≤ 34,000 (recommended), or a different margin (≤ 32k for ~8k headroom is also reachable with C).
- **Quick-reference cards**: in scope for this workflow or deferred? If in scope, they live in the annex (no cap) and are read-on-demand — they do **not** consume CLAUDE.md budget, so they neither help nor hurt the headroom goal. Candidate-neutral; can be a follow-up.
- **Article X binding-row retention**: which X.1–X.5 rows keep a terse clause in CLAUDE.md vs move wholesale? Needs row-by-row judgment at spec time (the `spec_design_calls_guard` / `design-ui` / `brainstorm` / `codesign` obligations are binding and must keep a CLAUDE.md clause).
