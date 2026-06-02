---
description: Record human approval of a swarm plan. swarm-dispatch will not run until this approval token exists. Must be user-invoked — Claude cannot approve.
argument-hint: "<slug — matches .claude/state/swarm/<slug>.json; .md is stripped if present>"
allowed-tools: Read, Bash(date:*), Write
disable-model-invocation: true
---

The user has reviewed the swarm plan referenced by `$ARGUMENTS` and approved it for dispatch.

How this works structurally: when the user typed `/approve-swarm <slug>`, the `consent_gate_grant` UserPromptSubmit hook ran *before* this body was passed to Claude and wrote a short-lived consent marker at `.claude/state/.swarm_approval_grant` whose slug is the bare slug derived from `<arg>`. The `swarm_approval_guard` PreToolUse hook reads that marker on the approval-token Write and allows it when the marker is fresh and the approval filename's bare slug matches. Claude cannot forge the marker — that's what makes the gate structural.

**State-write discipline (binding — see `.claude/CONSTITUTION.md` §2 "State-write discipline").** The approval token at `.claude/state/swarm_approvals/<slug>.approval` is a **Tier 1 consent artifact**: it SHALL be written with the **Write tool only**. You SHALL NOT write it via Bash (no `>`/`>>` redirect, heredoc, `tee`, `cp`, or `sed -i`) — `destructive_cmd_guard` blocks Bash writes to consent paths, and the `swarm_approval_guard` marker is validated only on the Write tool. Read the plan JSON with the **Read tool**; use Bash solely for `date +%s`.

Steps:

1. **Derive the bare slug** from `$ARGUMENTS` in-context (no shell needed): strip any directory prefix and a trailing `.md`. The same canonicalization runs inside `consent_gate_grant`.
2. Confirm the plan exists at `.claude/state/swarm/<slug>.json` by reading it with the **Read tool**. If the Read fails, stop and ask for the correct slug.
3. From the plan you just read, confirm it has `status: "planned"` and a non-null `waves` array (i.e., the validator ran). If not, tell the user to re-run `/swarm-plan` first.
4. **Write the approval token with the Write tool** to `.claude/state/swarm_approvals/<slug>.approval` (the Write tool creates the parent directory). Contents:
   - Line 1: `APPROVED`
   - Line 2: epoch timestamp (run `date +%s`)
   - Line 3: plan path (`.claude/state/swarm/<slug>.json`)
   - Line 4: task count + wave count from the plan (e.g., `tasks=7 waves=3`)
5. Confirm to the user: "Swarm plan approved for `<slug>`. Run `/swarm-dispatch <slug>` to begin parallel execution. Tasks declared at plan time are the ONLY files each wave may write to — the boundary guard enforces this."

Do NOT mark the plan file itself as approved in any status field — the approval token is the authoritative record (mirrors /approve-spec).
