---
key: an-observed-value-is-recorded-as-a-bounded-typed-rendering
category: decisions
scope: [spec, tdd, security, integrate]
governs: .claude/skills/codebugger/**,docs/debug/**
source: user-instruction
raised-on: 2026-08-15
raised-in-context: codebugger-explanation-trace
owner: engineer
verified-at: 8fb72a5
last-touched: 2026-08-15
---

> Committed, typed rendering (Recommended) — One committed docs/debug/<slug>.md. The Observed cell records a bounded rendering — "undefined", "array, length 0", "string, 44 chars, starts 'sk-'" — never the raw value.

- **Decision.** A `codebugger` explanation trace is committed as one file, and every `Observed` cell holds a **bounded typed rendering** — type, length, boundary comparison, or an explicit redaction marker. A raw value read out of a paused process never reaches the file.
- **What forced it.** `@debugmcp/mcp-debugger`'s README asserts secrets are "masked before reaching the agent". That claim could not be verified: the only redaction reachable in its documentation is `docs/logging-format-specification.md`, describing the **log** path (values truncated to 200 chars, ≤ 10 variables per entry, environment values replaced with a count summary, sensitive keys scrubbed by pattern). Nothing documents the tool result returned to the agent. Baseline installs into other people's repositories, so committing unverified program memory to permanent git history is the least reversible failure in the design.
- **Why it is also the better evidence, not just the safer one.** The claim a root cause turns on is almost always a type, a boundary, or an absence. "array, length 0" states the observation; a raw dump buries it.
- **Rejected alternatives.** Commit raw values like intake and scout — rejected on the redaction gap above. Split the trace, keeping raw rows gitignored at `.claude/state/debug/` and committing only the summary — rejected because a reviewer on another machine could not then see the rows the root cause cites, which breaks the one property the feature exists to create.
- **Re-verification.** If the maintainer confirms agent-path redaction *from source* rather than the README, the raw-value option becomes viable and this decision should be revisited. Until then, treat "mcp-debugger redacts secrets" as an unverified vendor claim — see the caveat on [[mcp-debugger]].
