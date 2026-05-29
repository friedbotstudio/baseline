# Stage 2 interview protocol — Socratic discipline

The brainstorm skill exists because the pre-feature `/intake`, `/spec`, and `/tdd` entry skills opened their templates and walked sections sequentially, forcing the model to commit to a problem shape before exploring whether that shape was correct. This document describes the discipline that prevents the new helper from falling into the same trap.

## Hard rule

**You SHALL NOT propose a solution during Stage 2.** This rule is structurally enforced by `discipline.mjs → scanTurn(text)`, which the SKILL.md SOP calls on every probe BEFORE emitting it. The scanner catches:

- **Solution verbs** — `implement`, `refactor`, `add X` (where X is a system component), `use Y`, `we could`, `what if we`, `should we`, `i recommend`.
- **Library names** — Redis, PostgreSQL, Kafka, React, etc. A probe that names a library is proposing a tool, not exploring the need.
- **Solution patterns** — `circuit breaker`, `exponential backoff`, `async/await`, and similar architectural patterns.

If `scanTurn` returns violations, the probe is rewritten until it no longer leaks solution shape. In production, a violation that reaches the engineer is a test failure (AC-003).

## What probes look like

| Field | Conforming probe | Solution-leaking probe (forbidden) |
|---|---|---|
| `actor` | "Who experiences this problem today? An on-call engineer, a customer, or someone else?" | "Should we add monitoring for the on-call engineer?" |
| `trigger` | "When does this come up? Is it tied to a specific event or workflow step?" | "Have you considered using a webhook trigger?" |
| `current_state` | "What does the pain look like in their day-to-day? Walk me through a concrete recent example." | "We could add retry logic to handle the failures." |
| `desired_state` | "What outcome would feel like success for you?" | "I recommend implementing exponential backoff." |
| `non_goals` | "What is explicitly NOT in scope here?" | "Should we refactor the worker to use async/await?" |

The conforming probes share three properties: they ask about the engineer's experience, they avoid system components, and they never name a technology.

## When the engineer proposes a solution

The engineer may propose a solution in their answer ("I think we should add Redis"). The discipline rule applies to **model-generated turns**, not engineer answers. When this happens:

1. Capture the proposed solution verbatim in the brief's `solution_leakage` section.
2. Probe the underlying need: "What would Redis let you do here that you can't do today?"
3. Continue Stage 2 with the answer to that probe.

The engineer's proposed solution is data; the brainstorm helper does not endorse, evaluate, or recommend it. Endorsement happens in `/research` (option scanning) and `/spec` (architecture decisions, with codesign mode if active).

## Iteration cap

Stage 2 caps at 5 probe iterations. The cap is structural — the probe loop in `probe-loop.mjs` exits when `iterations === 5` regardless of whether gaps remain. Unclosed gaps surface as `open_questions` in the brief; the calling entry skill carries them forward to the next phase.

Stage 3 confirm-and-persist has its own 5-iteration cap on `Yes / Edit / Restart` cycles. After 5 rejections, the skill returns `final_state: "needs_human"` and the calling skill surfaces the divergence.

## Why this matters

The pre-feature failure mode was that a vague request like "make X faster" produced an intake doc with Problem="X is slow", Goal="Make X faster", AC="X is faster" — without anyone asking what triggered the perception of slowness, who was affected, or whether "faster" was even the right frame. The brainstorm helper exists to make that failure mode structurally impossible by separating requirement capture (this skill) from solution-shape commitment (`/research` and `/spec`).

The discipline is not a stylistic preference. It's the mechanism that makes the separation real.
