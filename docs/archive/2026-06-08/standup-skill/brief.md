# Brainstorm brief — standup-skill

## Actor

The baseline maintainer and Claude itself, at the start of a working/planning session and on-demand when scoping the next release.

## Trigger

Session start (wants orientation every time), AND deliberate on-demand invocation when planning a release or choosing the next thing to build.

## Current State

The recap is assembled by hand each time: read CHANGELOG, run git log against the last tag, read backlog.md and pending-questions.md, then reason ad hoc. Slow, and inconsistent session to session.

## Desired State

One mechanism yields a structured, consistent readout — what shipped (last release), what is staged-but-unreleased (commits since last tag, the semver bump they will trigger, pushed-vs-origin), the backlog bucketed (open/picked-up/dropped with epic parent->child resolution), open questions condensed — plus a recommended next pickup with a one-line rationale. Surfaced at session start AND runnable on demand, kept separate from the existing memory/resume snapshot.

## Non Goals

- Not a maintained roadmap artifact.
- Not a workflow phase.
- Does not write CHANGELOG (semantic-release owns it).
- Does not auto-start or commit any work.
- Does not replace or modify the existing session-start memory index / resume snapshot.

## Solution Leakage

- Recorded, not probed (pre-decided in the originating conversation): ships SKILL.md + a deterministic gather.mjs helper.
- Commits classified by conventional-commit type to infer the semver bump.
- Open question 1: at session start there is no main-context judgment loop, so the auto-surfaced standup is necessarily the mechanical recap (gather output); the judgment-based recommended pickup may need a lighter heuristic at session start vs the full version on-demand. (research/spec to resolve)
- Open question 2: the session-start surfacing mechanism — a NEW SessionStart hook vs having the existing memory_session_start hook call the gather helper — has a governance cost (a new hook bumps the 22-hook count). "Stay separate" was about content, not necessarily a separate hook. (research/spec to resolve)
