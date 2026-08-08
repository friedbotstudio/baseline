---
key: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c
category: backlog
scope: [memory-flush]
source: user-instruction
status: open
raised-on: 2026-06-01
raised-in-context: vision conversation (branched /btw session) during the changelog-classify-from-entries workflow
estimated-effort: large
verified-at: 21556a5
last-touched: 2026-06-17
caveat: Full vision + audit captured at `docs/vision/baseline-v1-thought-compiler.md` (tracked; vision committed in 75257cb, design-pass status in Part 6). This is the big next epoch, NOT a quickfix. Sequence per the doc: (1) amend seed.md §Article II then CLAUDE.md to permit bounded agent-team execution under an orchestrator (workers decide inside an orchestrator-owned frame; scope/write_set escalation bounces up); (2) plan-as-durable-diffable-state schema (mirror workflow.json discipline); (3) maker/checker RALPH protocol with checkers BOUND TO MECHANICAL ORACLES (the load-bearing constraint — two LLMs alone agree on hallucinations); (4) the "safe vs ask-a-human" gate taxonomy BEFORE any autonomy; (5) AI-native debugging skill (explanation-trace as the reviewable object). Each of 1–5 deserves its own intake→spec→approve cycle. v2 (signal-driven AI-native OS: Sentry/GA4/CRM/CI connectors → diagnose → fix → deploy) rides on a trusted v1. Open questions (maker/checker deadlock cap, where reactivity lives, the merge/synthesis oracle, auto-deploy rollback + kill switch) are listed in the doc. **Decomposed 2026-06-05 into the 8 child entries below (keys `*-c732`, `*-1a2d`, `*-f029`, `*-d186`, `*-4c43`, `*-424f`, `*-9360`, `*-9008`). The refined checker mechanism + 8-piece sequencing live in the vision doc Part 5, which supersedes its Part 3.** This parent stays open as the epic umbrella; close it only when all 8 children are picked-up or dropped. **Design-pass status (2026-06-17): Slice A is 2/3 done — piece 1 (`-c732`, §II.A charter, 75257cb) and piece 3 (`-f029`, mutation oracle, 6c85282) shipped; the mutation oracle is advisory-only (floorless, never writes last_test_result). Validated forward sequence: 2→4→6→5. Open questions resolved — Q1→§5.4 (green/red stop), Q3→§5.2 AC-conformance = merge oracle; Q2/Q4 deferred to v2; §5.6 leans option (b). Full status: vision doc Part 6.**
---

> verbatim (user, 2026-06-01):
> We need to amend the constitution first to allow Agent team system with multiple parallel agents working of parts like check and balance ... The main thread is the orchestrator and other threads are background worker agents ... the spec after approval must trigger plan mode for orchestration ... The plan is executed by one or multiple maker nodes, and one or more checker nodes are used to review and critique the solution in a RALPH loop ... Once we build this level of machinary we will label it baseline v1 (a thought compiler).


---
