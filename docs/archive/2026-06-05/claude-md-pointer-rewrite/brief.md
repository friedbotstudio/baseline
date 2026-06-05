# Brainstorm brief — claude-md-pointer-rewrite

## Actor

Claude in-session (the harness reads CLAUDE.md into context every session) and the maintainer who adds new binding rules to the constitution over time.

## Trigger

When a new binding rule must be added but the constitution sits near the 40,000-char cap (Art I.6), forcing a trim of existing content to make room.

## Current State

A single-file constitution (CLAUDE.md, Articles I-XI) sits close to the 40k char cap. The annex .claude/CONSTITUTION.md (no byte cap) already holds reference appendices, enforcement narration, and amendment history.

## Desired State

Comfortable headroom restored under the 40k cap, achieved by relocating non-binding / reference / narrative material from CLAUDE.md into the uncapped annex, WHILE every rule keeps identical binding force, location aside.

## Non Goals

- Changing the precedence chain (seed.md > CLAUDE.md > implementation, Art I.4).
- Changing the 22-hook to Article enforcement mapping (Art VIII); no enforcement weakens.
- Letting any rule lose binding force by moving to the annex; binding rules stay binding wherever they live.
- Dropping audit-baseline citations (Article XI, seed §17) or breaking the byte-equal src/CLAUDE.template.md mirror.
- Shrinking always-loaded context size is NOT a confirmed success measure (maintainer did not select it); headroom under the cap is the goal, not minimal token count.

## Solution Leakage

- rewrite CLAUDE.md to act as a pointer to .claude/CONSTITUTION.md
- move binding rules to the on-demand annex
- spend reclaimed budget on quick-reference cards (e.g. a memory-system cheat sheet)
