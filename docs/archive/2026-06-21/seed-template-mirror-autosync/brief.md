# Brainstorm brief — seed-template-mirror-autosync

## Actor

Baseline maintainer editing the live governing constitution (docs/init/seed.md, CLAUDE.md) during a self-hosted Claude Code session.

## Trigger

A constitution edit lands in the live file without the matching edit in its src/*.template.md mirror (e.g. the §18.9 amendment in commit 77b58ad edited docs/init/seed.md but not src/seed.template.md).

## Current State

Nothing reconciles the two files. Drift surfaces only at a full test run (seed-template-parity / claude-template parity tests go red) and is patched by hand as a drive-by each time. Until caught, the canonical shippable (src/*.template.md, overlaid into obj/template by build Stage 2) can carry a stale or incorrect constitution toward a fresh install.

## Desired State

Live constitution edits reconcile into their template mirrors with no manual step; the divergence is prevented from shipping (a guarantee, not a reminder); any residual drift is surfaced earlier than a full CI run. The seed §16 reserved-placeholder carve-out is preserved through the reconciliation (template keeps *Reserved.*; CLAUDE.md stays a full byte-equal mirror).

## Non Goals

Do not change the ship pipelines source-of-truth model: src/*.template.md remains the canonical shippable that build Stage 2 overlays into obj/template, and docs/init/seed.md + CLAUDE.md remain this repos live working copies. No flipping which file is canonical for shipping.

## Solution Leakage

The request names a mechanism ("add autosync", "propagate automatically"). Captured underlying need: eliminate constitution-to-mirror drift as a class — automatic (no manual step), guaranteed-not-to-ship (hard gate, not advisory), and caught early (before a full CI run). The exact mechanism (build-time regeneration of the mirror from the live source vs a pre-commit gate vs both) is a spec/design decision, not a requirement gap.
