# Brainstorm brief — commit-closure-stamp-carry

## Actor

The /commit phase (Phase 11, Step 6) running inside a workflow — i.e. Claude executing /commit. Secondary actor: the maintainer who later reads git history and trusts a commit's closure claims.

## Trigger

A workflow whose workflow.json → source_backlog_keys is populated reaches /commit (the commit that closes backlog work).

## Current State

sweep.mjs stamps the named backlog entry (status: picked-up + superseded-at: <today>) AFTER the commit lands. /commit defines no step to commit that edit, so it strands uncommitted in the working tree, survives /clear, and is at risk of being auto-deleted by the next /memory-flush on its superseded-at date before ever entering git. Additionally: the commit body may claim 'Closes <key>' while the committed entry still reads status: open; and the leftover dirty tree is never surfaced to the operator.

## Desired State

When a workflow closes backlog work: (1) the closure stamp lands in the SAME commit as the work itself (atomic — never a trailing separate commit); (2) the operator can see if any closure record is ever left uncommitted; (3) a commit that claims 'Closes <key>' cannot contradict the committed state of that entry.

## Non Goals

Do not weaken or bypass the --amend hard-block (Art. VII). Do not make any writer other than sweep.mjs edit backlog.md. DERIVED CONSTRAINT: because the stamp must ride the same commit (atomic), it cannot contain a self-referential commit SHA — the SHA-bearing 'SHIPPED (commit X)' provenance note is dropped or reworked into an SHA-free form.

## Solution Leakage

Request phrased 'make /commit carry the stamp' — constrained outcome, not a specific mechanism (the RCA deliberately lists candidate mechanisms without picking). Mechanism choice deferred to the spec.
