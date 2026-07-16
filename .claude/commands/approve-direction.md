---
description: Record human approval of a workflow's direction (the intake + its acceptance criteria + the CO-A evidence). The Direction Approval Guard hook blocks Claude from ever writing approval tokens; this command is the only sanctioned path. Must be user-invoked. Replaces the retired /approve-spec gate (D3/CO-E gate-collapse) — the spec is now machine-reviewed, not human-gated.
argument-hint: "<slug | path-to-intake>"
allowed-tools: Read, Bash(date:*), Bash(git:*), Bash(node:*), Write
disable-model-invocation: true
---

The user has reviewed and approved the DIRECTION of the workflow referenced by `$ARGUMENTS` — the problem, goal, and acceptance criteria in the intake, plus the CO-A evidence (demonstrated understanding + risk acceptance). Record approval. This single gate authorizes the whole build direction; the spec and implementation between here and the commit are machine-reviewed (spec-traceability, checker fan-out, shippability, drift-check, design-calls), never human-eyeballed.

How this works structurally: when the user typed `/approve-direction <arg>`, the `consent_gate_grant` UserPromptSubmit hook ran *before* this body was passed to Claude and wrote a short-lived consent marker at `.claude/state/.direction_approval_grant` whose slug is the bare slug derived from `<arg>`. The `direction_approval_guard` PreToolUse hook reads that marker on the approval-token Write and allows it when the marker is fresh and the approval filename's bare slug matches. Claude cannot forge the marker — that's what makes the gate structural.

**State-write discipline (binding — see `.claude/CONSTITUTION.md` §2 "State-write discipline").** The approval token at `.claude/state/spec_approvals/<slug>.approval` is a **Tier 1 consent artifact**: it SHALL be written with the **Write tool only**. (The token path is `spec_approvals/` for continuity — `epic_approval_guard` and `track_guard` derive their forge-proof root from it; D-2.) You SHALL NOT write it via Bash (no `>`/`>>` redirect, heredoc, `tee`, `cp`, or `sed -i`) — `destructive_cmd_guard` blocks Bash writes to consent paths, and the `direction_approval_guard` marker is validated only on the Write tool. Use Bash solely to compute the two scalar values below (`date +%s`, `git log`, and the content hash). Resolve and verify the intake path with the **Read tool**, never shell `dirname`/`basename`/`[ -f ]`.

Steps:

1. **Derive the bare slug** from `$ARGUMENTS` in-context (no shell needed): strip any directory prefix and a trailing `.md`. E.g. `docs/intake/foo.md` → `foo`, `foo` → `foo`. The same canonicalization runs inside `consent_gate_grant`, so the marker slug and the expected slug always agree.
2. **Resolve the intake path**:
   - If `$ARGUMENTS` contains a `/`, treat it as a path (absolute or relative to repo root).
   - Otherwise the path is `docs/intake/<slug>.md`.
   Confirm the intake file exists by reading it with the **Read tool**. If the Read fails, stop and ask for the correct slug or path.
3. **Write the approval token with the Write tool** to `.claude/state/spec_approvals/<slug>.approval` (the Write tool creates the parent directory). Contents:
   - Line 1: `APPROVED`
   - Line 2: epoch timestamp (run `date +%s`)
   - Line 3: absolute path to the intake file
   - Line 4: git short SHA of the intake file at this moment (if in a git repo; run `git log -1 --format=%h -- "<resolved-path>"`, otherwise `N/A`)
   - Line 5: the intake **content hash** — `computeSpecContentHash` of the intake bytes from `.claude/hooks/lib/spec-content-hash.mjs` (the hasher is content-agnostic; D-4). Compute it in Bash (read-only): `node -e "import('./.claude/hooks/lib/spec-content-hash.mjs').then(m=>import('node:fs').then(fs=>console.log(m.computeSpecContentHash(fs.readFileSync('<resolved-path>')))))"`. This line lets the harness resume detect a post-approval intake amendment and re-yield.
4. Confirm to the user: "Approved direction `<slug>`. Approval token written to `.claude/state/spec_approvals/<slug>.approval`. The spec and implementation now proceed under machine review; the next human gate is /grant-commit (approve-landing)."

Do NOT mark any spec or intake as "Approved" inside the markdown — the Direction Approval Guard hook blocks that. The approval token is the authoritative record.
