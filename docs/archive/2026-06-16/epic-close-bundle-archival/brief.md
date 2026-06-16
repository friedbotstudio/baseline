# Brainstorm brief — epic-close-bundle-archival

## Actor

The maintainer running epics; the mechanical actor is the harness/Claude Code orchestration acting when an epic finishes.

## Trigger

The last open child of an epic reaches status: committed — i.e., every entry in .claude/state/epic/<epic>.json children[] is status: committed.

## Current State

The epic track (seed §18.9) deliberately omits the archive phase so the sliced spec/scout/research stay live at docs/{specs,scout,research}/<epic>.md for epic-child workflows to pin. When all children ship, nothing archives that discovery bundle or marks the epic finished. Result: finished-epic discovery files accumulate in the live docs/ tree, there is no signal separating a done epic from an in-flight one, and the epic track is the lone exception to the baseline rule that every workflow archives its bundle on completion.

## Desired State

When the last child commits, the epic discovery bundle (sliced spec/scout/research at docs/.../<epic>.md) moves to docs/archive/<YYYY-MM-DD>/<epic>/, matching the standard archive convention, AND the epic is marked closed via an explicit closed / closed-at marker in .claude/state/epic/<epic>.json. Done epics leave the live docs tree and are queryable as closed without scanning the filesystem.

## Non Goals

Do not touch or re-move children own already-archived slice artifacts. Leave any epic with a still-open child completely alone — no partial archiving. No git-history rewrite — the move is a normal working-tree change committed normally. Retain the epic state record (do not delete .claude/state/epic/<epic>.json) so its history stays inspectable.

## Solution Leakage

The request pre-names a mechanism ("/epic-close step OR last-child hook") and the verbs "moves the bundle" / "closes the epic". The step-vs-hook trigger mechanism is NOT locked here — it is the load-bearing design decision the spec must settle. Idempotency (re-running after close is a no-op) is a named requirement to design in the spec.
