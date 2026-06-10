# Brainstorm brief — harden-epic-approved-flip

## Actor

The harness SOP (main-context writer of the epic `approved` flag) and `track_guard` (the reader that honors discovery-skips for epic-children). The epic-child workflow is the would-be beneficiary of an illegitimately skipped discovery.

## Trigger

When an epic state file (`.claude/state/epic/<epic>.json`) has `approved: true` written without — or ahead of — the real gate-A `/approve-spec` consent (a forged or buggy flip), and an epic-child workflow subsequently runs against that epic.

## Current State

The `approved: true` flip is performed by trusted main-context SOP and is not guard-enforced. A forged `approved: true` on the epic state file is honored by `track_guard`, which lets an epic-child skip the mandatory discovery phases (intake, scout, research, spec, approve-spec).

## Desired State

The epic-state `approved` write is permitted only while a fresh slug-matched approve-spec consent marker exists; a self-written or forged flip with no fresh marker is blocked. The trust gap is closed structurally, mirroring how `spec_approval_guard` already gates the spec-approval token write.

## Non Goals

- The `/approve-spec` gate-A flow itself stays unchanged — this work keys off the consent marker that gate already produces; it does not add a new approval step or alter spec-approval consent.

## Solution Leakage

- mirror the spec_approval_guard pattern
- allow the epic-state approved write only while a fresh slug-matched marker exists
- block self-written flips otherwise
