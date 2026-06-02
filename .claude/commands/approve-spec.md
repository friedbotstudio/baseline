---
description: Record human approval of a spec. The Spec Approval Guard hook blocks Claude from ever writing approval tokens; this command is the only sanctioned path. Must be user-invoked.
argument-hint: "<slug | path-to-spec>"
allowed-tools: Read, Bash(date:*), Bash(git:*), Write
disable-model-invocation: true
---

The user has reviewed and approved the spec referenced by `$ARGUMENTS`. Record approval.

How this works structurally: when the user typed `/approve-spec <arg>`, the `consent_gate_grant` UserPromptSubmit hook ran *before* this body was passed to Claude and wrote a short-lived consent marker at `.claude/state/.spec_approval_grant` whose slug is the bare slug derived from `<arg>`. The `spec_approval_guard` PreToolUse hook reads that marker on the approval-token Write and allows it when the marker is fresh and the approval filename's bare slug matches. Claude cannot forge the marker — that's what makes the gate structural.

**State-write discipline (binding — see `.claude/CONSTITUTION.md` §2 "State-write discipline").** The approval token at `.claude/state/spec_approvals/<slug>.approval` is a **Tier 1 consent artifact**: it SHALL be written with the **Write tool only**. You SHALL NOT write it via Bash (no `>`/`>>` redirect, heredoc, `tee`, `cp`, or `sed -i`) — `destructive_cmd_guard` blocks Bash writes to consent paths, and the `spec_approval_guard` marker is validated only on the Write tool. Use Bash solely to compute the two scalar values below (`date +%s`, `git log`). Resolve and verify the spec path with the **Read tool**, never shell `dirname`/`basename`/`[ -f ]`.

Steps:

1. **Derive the bare slug** from `$ARGUMENTS` in-context (no shell needed): strip any directory prefix and a trailing `.md`. E.g. `docs/specs/foo.md` → `foo`, `foo` → `foo`. The same canonicalization runs inside `consent_gate_grant`, so the marker slug and the expected slug always agree.
2. **Resolve the spec path**:
   - If `$ARGUMENTS` contains a `/`, treat it as a path (absolute or relative to repo root).
   - Otherwise the path is `docs/specs/<slug>.md`.
   Confirm the spec file exists by reading it with the **Read tool**. If the Read fails, stop and ask for the correct slug or path.
3. **Write the approval token with the Write tool** to `.claude/state/spec_approvals/<slug>.approval` (the Write tool creates the parent directory). Contents:
   - Line 1: `APPROVED`
   - Line 2: epoch timestamp (run `date +%s`)
   - Line 3: absolute path to the spec file
   - Line 4: git short SHA of the spec file at this moment (if in a git repo; run `git log -1 --format=%h -- "<resolved-path>"`, otherwise `N/A`)
4. Confirm to the user: "Approved spec `<slug>`. Approval token written to `.claude/state/spec_approvals/<slug>.approval`. Downstream phases that depend on this spec may now proceed."

Do NOT mark the spec itself as "Approved" inside the markdown — the Spec Approval Guard hook blocks that. The approval token is the authoritative record.
