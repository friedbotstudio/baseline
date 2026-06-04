# Brainstorm brief — git-workflow-topology-model

## Actor

Automated agents (Claude) performing git operations on the maintainer's behalf during a workflow phase.

## Trigger

An agent is about to land committed work, and nothing project-specific declares where work belongs, so a generic 'branch off the default branch first' instinct decides instead.

## Current State

The baseline enforces git SAFETY (consent gates, forbidden-flag blocks, worktree isolation) but not git TOPOLOGY. With nothing declared, the agent's generic instinct won and created a feature branch + committed there, contrary to this repo's established direct-to-main practice (~93 linear commits, zero merge commits, semantic-release on push to main/next).

## Desired State

The project's branching practice is DECLARED, DETECTED where possible, and HARD-ENFORCED at the moment work would land - a commit contradicting the declared practice is PREVENTED, not merely warned. A generic instinct can no longer override an established practice.

## Non Goals

(1) The wider review/share/ship lifecycle (push, PR, merge, release) is out of scope. (2) Enforcement for branching models beyond the immediate need (gitflow/trunk) is not built now - reserved values. (3) Human-contributor workflows are not the target (commit-boundary enforcement covers them incidentally).

## Solution Leakage

Request pre-specifies the solution shape: a project.json git.workflow_model enum (direct-to-main | github-flow | ask; gitflow/trunk reserved->ask), extending the existing git_commit_guard rather than adding a 23rd hook (count stays 22), an Article VII precedence clause, a swarm-worktree carve-out (enforce only on the primary working tree at /commit, not dispatch worktrees), and best-effort detection at /init-project. Captured for the spec; the underlying need is: an established branch practice must structurally override an agent's generic instinct, with a hard stop at the landing point.
