# Brainstorm brief — swarm-first-run-hardening

## Actor

The baseline maintainer (and Claude doing baseline-on-baseline development) running swarm-mode workflows.

## Trigger

Dispatching a swarm-mode workflow — specifically: multi-wave plans (D1), shared-mode work touching .claude/skills/** (D2), workers that finish scenario but not implement (D4), plan decomposition (D5), and spec authoring that precedes dispatch (D7).

## Current State

The first real swarm-mode dispatch (workflow -424f, 7 tasks / 3 waves / shared isolation) surfaced five unresolved defects, each of which required manual main-context rescue or per-wave hand diff-audits to work around: D1 (HIGH) Agent isolation:worktree forks worktrees from a stale base lacking prior-wave output, and swarm_merge.mjs git-applies without committing, so wave-N+1 branches from a base missing wave-N output; baseline_ref:HEAD also mismatches the worktree's real base. D2 (MED-HIGH) swarm.exempt_path_prefixes includes .claude/, so swarm_boundary_guard does NOT enforce write_sets under .claude/skills/** — exactly where baseline self-dev happens — leaving shared mode's only safety mechanism blind to its dominant use case. D4 (MED) two of seven workers stopped after Skill(scenario) without running Skill(implement) and emitted no {task_id,status} JSON line; dispatch had no detection and SendMessage to resume was unavailable, so main context completed implement from their RED tests. D5 (MED) swarm-plan decomposed as if every task were worker-safe, placing design-laden / live-shipped-code / not-yet-shipped-API tasks into worker waves that then needed mid-build pull-back to main context. D7 (LOW) the plan↔consumer API surface was not pinned in the spec, so the decomposition was incomplete pre-dispatch and an artifacts channel was added mid-build.

## Desired State

Swarm dispatch is safe and reliable enough to run without ad-hoc main-context rescue. D1: root cause (Agent-tool constraint vs baseline-controllable bug) is determined first in the research phase, then resolved as EITHER a code fix (derive baseline_ref from the worktree's actual merge-base / commit wave output between waves) if baseline-controllable, OR a documented constraint (worktree mode = single-wave only, steer multi-wave plans to shared mode) if it is an Agent-tool limit — the spec pins whichever research finds. D2: a shared-mode post-wave diff-audit in swarm-dispatch verifies wave changes against the union write_set, covering .claude/skills/**. D4: swarm-dispatch detects a worker result missing the {task_id,status} JSON line and treats it incomplete (resume if possible, else main-context complete). D5: swarm-plan classifies each task worker-safe vs needs-main-context up front so the plan and gate-B reflect the real split. D7: spec-authoring guidance ensures the spec pins the exact API surface each migration needs so decomposition is complete pre-dispatch. Definition of done: each safeguard EXISTS and is covered by unit tests; live swarm validation is a tracked future run, NOT a blocker for closing this workflow.

## Non Goals

D3 and D6 are already shipped (swarm-d3d6-hardening) and are out of scope. The following were considered and DELIBERATELY LEFT OPEN as potential goals (NOT excluded — research/spec have latitude to pull them in): the v1 multi-agent maker/checker RALPH machinery (epic -9d4c); flipping the swarm.isolation project default; redesigning the broader swarm-worker subagent contract beyond D4's dispatch-side detection; and gating done on a live swarm validation run.

## Solution Leakage

The request names CANDIDATE fixes, captured as candidates only (the spec decides actual shapes): derive baseline_ref from the worktree merge-base; post-wave diff-audit in swarm-dispatch; {task_id,status} JSON-line detection; worker-safe-vs-main-context classifier in swarm-plan; spec API-surface pinning. D1's fix shape is explicitly deferred to the research phase rather than pre-committed.
