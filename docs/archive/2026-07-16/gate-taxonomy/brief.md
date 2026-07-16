# Brainstorm brief — gate-taxonomy

## Actor

The baseline Claude Code session acting as orchestrator — the entity that, before performing an operation, must decide whether to act autonomously or ask the human. Secondary: the human, surfaced only on an "ask" verdict.

## Trigger

A pending operation reaches a decision point where the system must choose "safe, just do it" vs "critical, ask a human". Today those points are the Article IV/VII consent gates and guard hard-blocks; under future autonomy, any action the orchestrator is about to take.

## Current State

The act-vs-ask boundary is expressed only as scattered prose — XI.12's four categories in the annex (consent-adjacent scope, irreversible/destructive ops, policy flips, contradictory requirements) — plus independently hard-coded consent gates (approve-spec, approve-swarm, grant-commit, grant-push) and guard hard-blocks (git_commit_guard FORBIDDEN_RE, destructive_cmd_guard). No single reusable mechanical classifier exists, so a future autonomous path has no principled place to consult for act-vs-ask.

## Desired State

A reusable, deliberately-coarse classifier mapping an operation (closed set: git ops, destructive bash, consent-token writes, phase-skips/exception-adds, spec write-set widenings) to a verdict {safe | ask, category, reason}, grounded in the four XI.12 categories, with unknown operation kinds defaulting to "ask" (fail-safe). PLUS a read-only advisory mapping that asserts each existing live consent point resolves to a taxonomy category — validating the classifier's generality WITHOUT changing any enforcement.

## Non Goals

- Not building autonomy itself — C6 precedes it (vision: build the gate taxonomy before the autonomy).
- Not changing or replacing the existing structural consent gates or guard hard-blocks — they stay as-is; the classifier is advisory-only this slice.
- Not the AI-native debugging skill (the successor half of vision piece 8).
- Not v2 signal-driven actions (deploy, migration, external publish) — closed input set only, no generic open abstraction (YAGNI).
- Not fine-grained per-operation policy — deliberately coarse, fragment when closer.

## Solution Leakage

- Roadmap deliverable naming ("classifier", "generalize into a reusable classifier", "label") — retained as the deliverable name, not premature implementation.
- Underlying need preserved: a single principled act-vs-ask decision point that exists before autonomy can act wrongly.
- Note: the exact category→verdict mapping and the operation-descriptor shape are routine engineering forks — recorded in the spec's ## Decisions (owner: engineer), reviewed at gate A, not human's-call probes.
