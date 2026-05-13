---
description: Record human approval of a swarm plan. swarm-dispatch will not run until this approval token exists. Must be user-invoked — Claude cannot approve.
argument-hint: "<slug — matches .claude/state/swarm/<slug>.json; .md is stripped if present>"
allowed-tools: Read, Bash(mkdir:*), Bash(date:*), Bash(basename:*), Write
disable-model-invocation: true
---

The user has reviewed the swarm plan referenced by `$ARGUMENTS` and approved it for dispatch.

How this works structurally: when the user typed `/approve-swarm <slug>`, the `consent_gate_grant` UserPromptSubmit hook ran *before* this body was passed to Claude and wrote a short-lived consent marker at `.claude/state/.swarm_approval_grant` whose slug is the bare slug derived from `<arg>`. The `swarm_approval_guard` PreToolUse hook reads that marker on the approval-token Write and allows it when the marker is fresh and the approval filename's bare slug matches. Claude cannot forge the marker — that's what makes the gate structural.

Steps:

1. **Derive the bare slug** from `$ARGUMENTS` defensively (in case the user passed a path or a `.md`-suffixed name):
   - `slug="${ARGUMENTS##*/}"` (strip any directory prefix)
   - `slug="${slug%.md}"` (strip a trailing `.md`)
   The same canonicalization runs inside `consent_gate_grant`.
2. Verify the plan exists at `.claude/state/swarm/<slug>.json`. If not, stop and ask for the correct slug.
3. Read the plan and confirm it has `status: "planned"` and a non-null `waves` array (i.e., the validator ran). If not, tell the user to re-run `/swarm-plan` first.
4. Write `.claude/state/swarm_approvals/<slug>.approval` with:
   - Line 1: `APPROVED`
   - Line 2: epoch timestamp (`date +%s`)
   - Line 3: plan path (`.claude/state/swarm/<slug>.json`)
   - Line 4: task count + wave count from the plan (e.g., `tasks=7 waves=3`)
5. Confirm to the user: "Swarm plan approved for `<slug>`. Run `/swarm-dispatch <slug>` to begin parallel execution. Tasks declared at plan time are the ONLY files each wave may write to — the boundary guard enforces this."

Do NOT mark the plan file itself as approved in any status field — the approval token is the authoritative record (mirrors /approve-spec).
