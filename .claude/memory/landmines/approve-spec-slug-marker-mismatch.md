---
key: approve-spec-slug-marker-mismatch
category: landmines
scope: [scout, spec, tdd, security, integrate]
source: user-instruction (2026-05-11T19:45Z, mid-workflow on slug `design-ui-orchestrator` at Gate A)
verbatim: > before we move, mark this error in approval flow; we will revisit and fix this later
---

- Path: `.claude/hooks/consent_gate_grant.sh` (marker writer) + `.claude/hooks/spec_approval_guard.sh` (validator) + `.claude/commands/approve-spec.md` (filename-derivation rule)
- Trap: `/approve-spec <arg>` writes a consent marker at `.claude/state/.spec_approval_grant` keyed to `<arg>` verbatim. `spec_approval_guard` then requires the approval-token filename basename (minus `.approval`) to slug-match that marker. When the user types just the slug (`design-ui-orchestrator`) and Claude follows the documented `<slug>.md.approval` filename pattern, the basename is `design-ui-orchestrator.md` and the marker is `design-ui-orchestrator` — slug mismatch → DENY. The first denial burns one tool call; the marker's 60-second TTL is short enough that a single retry can exceed it, forcing the user to re-type the consent command.
- Reproduction (2026-05-12, `design-ui-orchestrator` workflow): user typed `/approve-spec design-ui-orchestrator` (slug-only). Attempt 1 wrote `design-ui-orchestrator.md.approval` → DENY (slug mismatch). Attempt 2 wrote `design-ui-orchestrator.approval` → DENY (marker expired, 67s old, TTL 60s). User re-typed `/approve-spec`; attempt 3 wrote `design-ui-orchestrator.approval` → ALLOW.
- Mitigation today: type `/approve-spec <slug>` (no `.md` extension, no path) and Claude writes `.claude/state/spec_approvals/<slug>.approval` (no `.md` in the filename). One-shot success inside the 60s TTL. Confirmed working at attempt 3 of the reproduction.
- Fix candidates (decision deferred):
  - **A**: `consent_gate_grant.sh` normalizes argv (strip leading path + `.md`) so the marker slug is always canonical; approval-file pattern stays `<slug>.md.approval`.
  - **B**: `spec_approval_guard.sh` accepts either basename form (`<slug>` or `<slug>.md`) against the same marker.
  - **C**: `.claude/commands/approve-spec.md` always strips `docs/specs/` + `.md` from the user's argv before deriving the filename, so both input forms map to the same approval-file path.
  - **D** (belt-and-suspenders): all three. Matches "Claude cannot forge consent, but a typo shouldn't break the gate."
- Why it matters: the gate is structurally correct (Claude cannot forge), but the rough edge undermines confidence — a user thinks "I approved twice and the system still rejected me" when the second rejection was a TTL race, not a logic failure. Article IV gate language ("structurally un-invokable") implies the gate fires only on real violations.
- Affects archive too: `.claude/skills/archive/archive.sh` looks for `<slug>.md.approval` in the spec_approvals dir; an approval token written under the workaround name (`<slug>.approval`) won't move into the bundle. Observed on `design-ui-orchestrator` archive 2026-05-12 — 5 artifacts archived, spec approval token left behind.
- Verified-at: 3c74ba8
- Last-touched: 2026-06-20
