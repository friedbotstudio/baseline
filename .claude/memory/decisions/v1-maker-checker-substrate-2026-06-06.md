---
key: v1-maker-checker-substrate-2026-06-06
category: decisions
scope: [spec]
caveat: the `§II.A` amendment that LEGALIZES this has SHIPPED — CLAUDE.md Art. II cites it ("A single bounded maker/checker round-trip MAY run on the Workflow runtime under §II.A"), full text at `docs/init/seed.md §II.A — Bounded maker/checker charter (v1)`. It is a BOUNDED exception, not a permanent Article II rewrite: seed.md §II.A clause 7 sets a graduation gate (≥3 governed round-trips with every blocking finding mechanically grounded, zero false-positive blocks, a clean `/security` of the checker's oracle artifacts, and maintainer ratification) before any permanent rewrite; clause 6 caps bind until then. Decision recorded to prevent re-litigating the agent-teams / Agent-SDK alternatives. When applying the future permanent rewrite, heed `landmines.md → constitutional-amendment-tripwires-headroom-seedmirror-python3ledger` (CLAUDE.md 38,500-byte budget, seed.template parity, python3 ledger).
source: freeform PoC archived at `docs/archive/2026-06-05/maker-checker-poc/` (brief.md, spec.md). Vision + 8-piece decomposition at `docs/vision/baseline-v1-thought-compiler.md` Part 5. Backlog `-c732` (minimal exception — OPEN, pending the intake-full corroboration workflow), `-9360` (full charter).
verified-at: cd062af
last-touched: 2026-06-21
---

- Decision: the v1 maker/checker execution substrate is Claude Code's dynamic **Workflow runtime** (Hybrid model): own the durable plan, the oracle/proof-obligation contract, the consent gates, and hook enforcement IN-REPO; **rent** the Workflow runtime for execution; fall back to **Mirror-lite** turn-by-turn swarm when the runtime is unavailable or disabled.
- Rationale: the runtime is **subscription-native** (counts as normal plan usage, NOT Agent-SDK/API billing), gives deterministic code-driven control flow (what Article II + the v1 vision want), worktree isolation per agent, and schema-validated structured output. PoC this session (3 workflow runs) confirmed all three axes: the maker→checker round-trip works; a checker produced a grounded finding (a failing test, reproduced independently outside the workflow); and the constitutional PreToolUse hooks FIRE on workflow agents (`tdd_order_guard`, `verify_pass_guard`, `swarm_boundary_guard` each blocked a workflow-agent write with a verbatim message) — so makers ride the rented runtime under full governance.
- Rejected alternatives:
  - **Agent-SDK orchestrator (Mirror-true)**: subscription ToS forbids driving the SDK with subscription credentials; per-token API billing detonates the economics of a token-heavy multi-agent loop. Breaks the flat-rate model the baseline depends on.
  - **Agent teams**: teammates CANNOT spawn subagents (verified against `code.claude.com/docs`), and teammates share one working dir with no worktree isolation.
  - **Mirror-lite only** (model-driven turn-by-turn): forgoes deterministic code-driven orchestration; retained as the FALLBACK, not the substrate.
