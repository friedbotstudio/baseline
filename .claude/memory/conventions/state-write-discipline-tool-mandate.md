---
key: state-write-discipline-tool-mandate
category: conventions
scope: [scenario, implement, tdd]
source: user-feedback
convention: Every SOP that writes under `.claude/state/` obeys a two-tier tool mandate. Canonical text: `.claude/CONSTITUTION.md` §2 "State-write discipline". **Tier 1 — consent artifacts** (`commit_consent`, `push_consent`, `*.approval` under `spec_approvals/`·`swarm_approvals/`, `.*_grant` markers): written with the **Write tool only**. Bash writes (`>`/`>>`, heredoc, `tee`, `cp`, `sed -i`) are blocked by `destructive_cmd_guard → writesConsentPath`, and the approval guards validate the gate marker only on Write/Edit/MultiEdit. **Tier 2 — workflow/runtime state** (`workflow.json`, `harness_state`, `last_test_result`, `.harness_active`, `tdd/<slug>.json`): prefer the Write tool; Bash only via shell builtins (`>`), with `rm -f` the sole external-binary exception (marker deletes). **Path/existence checks** use Read/Glob, never `dirname`/`basename`/`[ -f ]`.
why: the enforcement layer is tool-aware. An SOP that says "write the token" without binding the tool invites a Bash redirect that is structurally guaranteed to be blocked — observed: `/approve-spec` tried a Bash heredoc → destructive-guard block, then `command not found: dirname` under a stripped PATH. Binding the tool removes the detour.
applies-to: any command/skill SOP that writes under `.claude/state/`.
verified-at: 3c74ba8
last-touched: 2026-06-20
---

> verbatim (user, 2026-06-02):
> I'd say use constitution style legalese to harden the SOP for all such skills so that it doesn't take detour.
- how to apply: the 4 gate commands (approve-spec, approve-swarm, grant-commit, grant-push) and the harness/integrate/tdd/verify SKILLs cite §2 directly and name the tier. New SOPs that write state cite §2. Never grant `Bash(tee:*)` in a gate command's `allowed-tools` (it's a consent-path write-verb the destructive guard blocks).
