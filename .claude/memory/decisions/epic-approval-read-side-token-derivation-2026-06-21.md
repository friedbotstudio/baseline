---
key: epic-approval-read-side-token-derivation-2026-06-21
category: decisions
scope: [spec]
verified-at: ed897cc
last-touched: 2026-06-21
source: archived bundle at `docs/archive/2026-06-21/residual-epic-approval-cd-bypass/` (brief, spec, security, spec.approved). Closes backlog `residual-cd-pushd-into-epic-dir-approval-bypass-eda6`.
---

- Decision: `track_guard.epicInheritanceSatisfied` derives an epic-child's discovery-skip authorization from the existence of `.claude/state/spec_approvals/<epic>.approval` (the forge-proof gate-A token), NOT from the epic-state `approved` boolean. The `approved` flag is retained as a human-readable state marker but is no longer read for authorization. The epic-state file is still read for structural validity (must exist + parse). This closes the residual `cd`/`pushd`-into-dir write bypass (`-eda6`): a forged `approved:true` is now inert at the read boundary regardless of which write vector set it.
- Rationale: the prior read side trusted a value any file-write could forge; the `-abad` work hardened the write surface but left a `cd`-relative Bash residual (the directory-anchored detector misses a bare-basename redirect after a `cd`). Deriving from the token closes the write AND read surface in one move and makes every write-surface detector belt-and-suspenders rather than load-bearing — the durable fix the `-abad` security review named as the open follow-up.
- Rejected alternatives:
  - **Incremental detector broadening** (flag `cd`/`pushd`/`-C`/`--directory` epic-dir references) — closes only the write surface; the read side keeps trusting the forgeable boolean; over-block risk for reads after a `cd`.
  - **Require token AND `approved===true`** — adds no security over token-only (token is the unforgeable root) and reintroduces the forgeable boolean as a load-bearing dependency, defeating "retire the trusted boolean."
- How to apply: the token slug is keyed on `state.epic`; the child must also resolve its scout/research/spec pins, binding it to that epic's genuine artifacts. Write-surface detectors (`epic_approval_guard`, `writesEpicApproval` via `destructive_cmd_guard`) are unchanged. Governance updated in lockstep: `seed.md §18.9` condition 2 + narrative, `CONSTITUTION.md` epic_approval_guard annex entry.
