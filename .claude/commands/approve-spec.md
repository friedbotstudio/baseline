---
description: Record human approval of a spec. The Spec Approval Guard hook blocks Claude from ever writing approval tokens; this command is the only sanctioned path. Must be user-invoked.
argument-hint: "<slug | path-to-spec>"
allowed-tools: Read, Bash(mkdir:*), Bash(date:*), Bash(basename:*), Bash(git:*), Write
disable-model-invocation: true
---

The user has reviewed and approved the spec referenced by `$ARGUMENTS`. Record approval.

How this works structurally: when the user typed `/approve-spec <arg>`, the `consent_gate_grant` UserPromptSubmit hook ran *before* this body was passed to Claude and wrote a short-lived consent marker at `.claude/state/.spec_approval_grant` whose slug is the bare slug derived from `<arg>`. The `spec_approval_guard` PreToolUse hook reads that marker on the approval-token Write and allows it when the marker is fresh and the approval filename's bare slug matches. Claude cannot forge the marker — that's what makes the gate structural.

Steps:

1. **Derive the bare slug** from `$ARGUMENTS`:
   - `slug="${ARGUMENTS##*/}"` (strip any directory prefix)
   - `slug="${slug%.md}"` (strip a trailing `.md`)
   The same canonicalization runs inside `consent_gate_grant`, so the marker slug and the expected slug always agree.
2. **Resolve the spec path**:
   - If `$ARGUMENTS` contains a `/`, treat it as a path (absolute or relative to repo root).
   - Otherwise the path is `docs/specs/<slug>.md`.
   Verify the spec file exists at the resolved path. If not, stop and ask for the correct slug or path.
3. **Write the approval token** to `.claude/state/spec_approvals/<slug>.approval` with:
   - Line 1: `APPROVED`
   - Line 2: epoch timestamp (`date +%s`)
   - Line 3: absolute path to the spec file
   - Line 4: git short SHA of the spec file at this moment (if in a git repo; use `git log -1 --format=%h -- "<resolved-path>"`, otherwise `N/A`)
4. Confirm to the user: "Approved spec `<slug>`. Approval token written to `.claude/state/spec_approvals/<slug>.approval`. Downstream phases that depend on this spec may now proceed."

Do NOT mark the spec itself as "Approved" inside the markdown — the Spec Approval Guard hook blocks that. The approval token is the authoritative record.
