# Brainstorm brief — memory-decision-point-redesign

## Actor

The phase skills / harness that read memory at decision points (scout, spec, tdd, security, integrate), plus the maintainer who relies on captured lessons being honored and the store staying navigable.

## Trigger

(1) A decision point where a captured lesson should constrain the work but is not surfaced (spec-authoring is the clearest case). (2) Store growth pressing a canonical file toward the 500-line cap, forcing destructive pruning of real history (landmines.md is already 502/500).

## Current State

Seven fixed canonical files plus gitignored continuity classes (_resume, _thread, _pending). Each canonical file is capped at 500 lines; landmines.md is already over at 502. 191 entries are loaded wholesale at session start. Lessons are captured but recur: backlog -7f3a proves the outcome-AC anti-pattern re-appeared across consecutive workflows (AC-007 then AC-011/012) despite being recorded and re-recorded. Memory is a passive archive, read only if a phase happens to open the right file.

## Desired State

A one-fact-per-file store with a network-graph index loaded upfront (cheap context) and traversed scoped-to-phase, so a captured lesson becomes an ACTIVE constraint surfaced at the decision point (delivering roadmap T4 / -7f3a). No single file grows unbounded. Source and verbatim provenance are preserved through migration of the ~191 existing entries. Scope covers the seven canonical files AND the continuity classes (_resume, _thread, _pending). The store serves machine-traversal as the primary consumer and human vault navigation as a first-class secondary consumer, so link/file conventions stay vault-compatible while the index format is optimized for context injection.

## Non Goals

(1) Claude Code session-level user memory (the MEMORY.md store outside .claude/memory) is out of scope. (2) The content/meaning of existing lessons is not being changed — migration is lossless, not a rewrite. (3) No runtime dependency or external graph database — the index and store remain plain files (baseline zero-runtime-dep, seed.md U6).

## Solution Leakage

Recorded as the engineer chosen direction (not re-probed, underlying need is stated): Obsidian-style one-fact-per-file store; network-graph index for traversal; replace the seven-fixed-file model. Underlying need = scale without a single huge file + cheap upfront context + active constraint at the decision point.
