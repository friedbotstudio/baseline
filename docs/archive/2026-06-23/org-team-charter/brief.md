# Brainstorm brief — org-team-charter

## Actor

The baseline maintainer (human lead) running multi-session baseline-on-baseline development, plus companion Claude Code peer sessions joined to the broker pool.

## Trigger

A multi-component piece of work that could be split across sessions, but where every decision — even small in-lane implementation choices — must funnel through a single decision context before progress continues.

## Current State

The solo workflow serializes all work through one main context. Swarm and sprint modes parallelize execution, but peers/workers make no decisions — every fork bounces to the single lead ('lead is sole decision locus'), so decision-making is the serial bottleneck and per-feature wall-clock approaches the sum of all decisions rather than the slowest lane.

## Desired State

A flat pod of peer sessions, each making its own in-lane implementation decisions in its own main context; only genuinely un-decidable or cross-lane forks escalate to the lead, who in turn escalates human-judgment forks to the human. Success (all three facets of one outcome): per-feature wall-clock approaches the slowest lane rather than the sum; small decisions no longer queue behind the lead; multiple lanes make real decisions concurrently rather than waiting on a pre-decided recipe.

## Non Goals

- Consent gates (approve-spec / approve-swarm / grant-commit) and the human-as-final-authority escalation chain stay structural and un-forgeable — peers deciding in-lane SHALL NOT create any path that bypasses or self-satisfies a gate.

## Solution Leakage

- The request names specific solutions — 'graduate sprint mode', a new 'org' track, an 'org-dispatch' skill, a free-form peer→lead→human channel on the broker. These are deliberate prior design decisions captured in this conversation, deferred to /spec codesign Step 1.5 rather than re-derived here.
- Deliberately NOT pre-committed as non-goals (left as open design decisions for codesign): whether a new subagent is added (vs peers-as-sessions), whether §II.A is touched, and whether the default 11-phase workflow stays an added-track-only change. Claude recommends preserving all three; the engineer decides at codesign.
