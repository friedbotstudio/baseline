# Brainstorm brief — residual-epic-approval-cd-bypass

## Actor

Claude / the harness itself — structural self-binding. The constrained actor is the agent, not an external attacker.

## Trigger

When an epic approved-flag flip is attempted without genuine gate-A consent, via a directory-relative write (cd/pushd into the epic state dir then a bare-basename redirect) that evades the directory-anchored write detector.

## Current State

cd .claude/state/epic && echo '{"approved":true}' > foo.json is NOT blocked today: writesEpicApproval anchors on the .claude/state/epic/ directory substring, but after the cd the redirect target is a bare <slug>.json with no epic signal. Separately, the read side trusts the persisted approved===true boolean rather than re-deriving it.

## Desired State

Epic approval is derived at read time from the persistent spec_approvals/<slug>.approval token, retiring the trusted approved===true boolean. The bypass is closed on both the write surface and the read surface.

## Non Goals

Keep the existing write-surface detectors (writesEpicApproval) as defense-in-depth — do not remove them. Do not touch the consent-gate token-writing flow (/approve-spec writing spec_approvals/<slug>.approval). Leave the two LOW items accepted (content-var-assembly of the literal approved token; finite write-verb allowlist). Do not touch non-epic (spec/swarm) approval consumption.

## Solution Leakage

Request names fix path (a): track_guard re-derives approval at read time. This solution was deliberately chosen by the user at /triage (path a over the incremental path b); captured as a pre-committed decision, not re-probed.
