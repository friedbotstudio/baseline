---
key: skill-arguments-mined-as-user-instruction-d10-residual-4a19
category: backlog
scope: []
status: open
raised-on: 2026-07-13
raised-in-context: extractor-noise-and-prereq-drift (observed at gate C, post-fix)
source: assistant-deferral
estimated-effort: small-medium (the detection signal is the hard part, not the filter)
verified-at: 1414f27
last-touched: 2026-07-13
caveat: related [[memory-system-redesign-landmines-captured-but-not-honoured-at-decision-point-7f3a]] — same root system. The `"the fix is"` cue firing on ordinary assistant prose is a SEPARATE, deliberate trade (D1: the cue has real recall; several such candidates ARE genuine decisions). Do not conflate the two.
governs: .claude/hooks/lib/memory_stop.mjs
---

> verbatim (assistant, 2026-07-13, observed live in `_pending.md` immediately after the T1 fix landed): "10 of the 20 pending candidates are tagged `Source: user-instruction`, and they are my own `Skill()` arguments — test fixtures and briefs, quoted into skill args, arriving in the transcript as `role: user`."

- Intent: stop `memory_stop` mis-attributing **Claude's own `Skill()` arguments** as `source: user-instruction`. This is the residual of D10 (`extractor-noise-and-prereq-drift`): `stripSkillEnvelope` deliberately KEEPS the `ARGUMENTS:` section, because a human's genuine deferral typed into `/triage "…"` lands there. Correct for a human-typed invocation — but when CLAUDE passes the arguments (every model-invoked skill), that same rule mines Claude's own briefs, test fixtures, and quoted examples and stamps them with the human's provenance.
- Evidence (live, post-fix): `_pending.md` re-accumulated 20 candidates in one workflow. The flush-report recursion and the contract-prose-as-user-instruction classes were GONE (T1 worked). But entries like `we-should-also-stage-the-rollout-behind-a-0592` and `build-a-fixture-whose-head-is-re-invocation-2754` are verbatim quotations of MY OWN skill args, tagged `Role: user`.
- Why it matters beyond noise: Article IX.6 makes `source: user-instruction` entries carry a **verbatim blockquote treated as canonical** — "when verbatim and interpretation conflict, verbatim wins". Mis-attributing Claude's text as the human's corrupts the provenance substrate that the Governance Sufficiency Model (Ledger #0002 D4) is built on. This is a correctness problem, not a tidiness one.
- Approach (resolve at spec time): the transcript likely distinguishes a human-typed slash command from a model `Skill()` invocation (the re-invocation preamble is one tell; `<command-name>` wrappers are another). Mine `ARGUMENTS:` only when the invocation was human-originated. Do NOT simply drop all ARGUMENTS — that re-breaks D10 and loses real human deferrals.
