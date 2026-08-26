---
key: document-gate-change-granularity-4a1c
category: backlog
status: open
raised-on: 2026-08-04
raised-in-context: living-system-model-abcd
source: assistant-deferral
verified-at: 75cb997
last-touched: 2026-08-26
scope: []
governs: .claude/skills/document/document-gate.mjs
---

> The gate is page-granular, not change-granular. A one-word fix in a code comment (`install.njk`) drew the same obligation as a full paragraph rewrite. A false obligation is exactly what trains people to override a gate.

**One root cause, two opposite failures.** `document-gate.mjs` derives obligations from the set of changed PATHS. Everything below follows from that single choice, so a fix aimed at either symptom should address both.

**Over-demand — a small change draws a full obligation.** The gate cannot see how much of a page changed, so a factual one-word correction inside a code fence demands the same `technical-writer` + `copywriting` pass as a rewritten section.

- Observed 2026-08-04: `site-src/install.njk` changed by one word ("seven" to "eight" inside a directory-tree comment) and drew both registers. Resolved that run by verifying the claim and confirming both gates pass (measure 0.34), which is the delegate's real job, but the obligation was disproportionate to the change.
- **Twice more on 2026-08-26, and the two outcomes differed, which is the useful part.** `site-src/velocity.njk` replaced four hardcoded numbers with template expressions and drew `technical-writer` + `copywriting`; `docs/system/README.md` changed two table cells and drew `prose`. Both were substitutions with no sentence reworded, so a line-count or hunk-size threshold would have exempted both.
- **One of the two found a real defect anyway.** The scoped `technical-writer` pass on `velocity.njk` caught that the code plate could render "shipped default" while the sentence above it still credited the archived runs with producing the number — an inconsistency introduced by the change itself, invisible to its diff, and fixed that run. The `docs/system/README.md` pass found nothing to change. **So the over-demand half is not pure waste, and a threshold tuned on change SIZE would have skipped the run that paid.** Whatever replaces path-granularity has to keep firing on a small edit that changes what a page ASSERTS, which is not a function of how many lines moved.
- Both runs cost a delegate invocation each and neither tempted an override, because the SOP's third option — correct `document.surfaces` when the obligation is genuinely wrong — was not the honest answer either time. The obligation was right for the page and wrong for the change, which is exactly this entry's subject.

**Under-demand — behavior changes and no page does, so the gate says CLEAN.** This is the more dangerous half, because the gate reports success.

- Observed 2026-08-04, same cycle: wiring `decisionsRestingOn` into `memory_session_start` added a user-visible session-start section listing decisions that rest on a constraint that no longer holds. No page changed, so the gate fired no obligation and returned CLEAN. `site-src/memory.njk` had never documented the invalidation edge at all, which is the entire justification for `constraints` being its own category (epic decision D2).
- It was caught by `/document` step 2.5's reflective check (`public-site-reflect.mjs`) plus reading the page, not by the gate. So the gate is necessary and not sufficient, and step 2.5 is what covers this half today. Anything that makes the gate authoritative must subsume the reflective check, or the check has to become a gate of its own.

**Candidate directions, none chosen:** a per-surface line-count or hunk-kind threshold for the over-demand half; deriving obligations from touched SYMBOLS or behaviors rather than paths, so a behavior change implies its describing page; promoting `public-site-reflect` output into the gate's required map; an explicit `exempt-change` record carrying a reason the gate reads.

**Related:** the security report has no "resolved" convention either (`security-oracle-reads-any-high-heading-as-an-open-finding`). Same shape as the over-demand half — a mechanical reader with one bit of resolution where the situation has two.
