# Brainstorm brief — sprint-pool-redispatch-fix

## Actor

Pool lead session + idle peer sessions on the sprint-pool channel.

## Trigger

A peer claims a task whose brief is un-decidable and yields it; the lead arbitrates in main context and calls release_task to re-dispatch the task with a concrete brief.

## Current State

(a) The re-dispatched task never re-notifies the peer: watcher.mjs pollOnce dedups via a monotonic seen Set keyed task:<id> (peer) / yield:<id> (lead), and the key is never reset when the task leaves the claimable set, so a pending->claimed->pending task is suppressed forever. (b) releaseTask resets the task to pending but leaves the matching yields.json record at status:open, so on a server restart the lead watcher re-fires the already-arbitrated yield and the yields ledger misrepresents reality.

## Desired State

(a) Edge-triggered re-notification: each poll prunes seen entries whose task is no longer claimable / whose yield is no longer open, so a task (or yield) re-entering the active set re-emits exactly once. A still-active task is not re-pushed within one episode. (b) releaseTask atomically (same withLock) flips the matching open yield record to status:resolved alongside the task re-dispatch, so a crash cannot leave task=pending with yield=open.

## Non Goals

The fs.watch-instead-of-750ms-polling upgrade (separate, larger change). Cross-machine or peer-authentication concerns. Any edit to baseline-owned sprint-channel files (store/lock/safe-id are imported read-only).

## Solution Leakage

*(not captured)*
