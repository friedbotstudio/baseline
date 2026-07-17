---
key: artifact-compression-writeset-diagram-profiles-sensitive-full-2026-06-21
category: decisions
scope: [spec]
verified-at: 77b58ad
last-touched: 2026-06-21
---

> verbatim (user, gate-A + security review, 2026-06-21):
> default flag → "keep default to on"; security finding #1 → "Security-first: hooks get full"

- Decision: `spec_diagram_presence_guard`'s required diagram set is now write_set-gated, **default ON**. `resolveProfile(content, projectGet)` in `.claude/hooks/lib/write-set-profile.mjs` reads `project.json → artifacts.compression.enabled` (default true; absent ⇒ true) and `artifacts.diagram_profiles`. A spec whose write_set is fully covered by the `non-architectural` profile's `when` (`.claude/skills/**`, `docs/**`, `*.md`, `.claude/*.json`) requires only `c4_component`+`class`+`sequence`+`dependency_graph` (drops `c4_context`+`c4_container`); everything else gets the full 6. **SECURITY CARVE-OUT (load-bearing): any write_set path matching `security.sensitive_globs` forces the full set**, and `.claude/hooks/**` was deliberately REMOVED from the `non-architectural` profile's `when` — so hook specs always require all 6 diagrams even though hooks are otherwise "non-architectural by location". Tdd-state behavior pointers `{spec_slug, ac_id, anchor}` resolve via `.claude/skills/tdd/resolve-pointer.mjs → resolvePointer` (slug validated `/^[a-z0-9-]+$/` against CWE-22 traversal).
- Rationale: token-efficiency (`docs/references/token-efficiency.md`) — spec+tdd are ~77% of output tokens; the dropped C4 top-levels are near-boilerplate for an internal change while the kept diagrams carry the review-relevant detail. Default-on chosen over opt-out-parity-default because the maintainer wanted the win immediately; the resolver fails OPEN to full on any error and the kill-switch (`enabled:false`) is regression-tested byte-identical, so the risk is bounded.
- Rejected alternatives: (a) force-full on ALL sensitive_globs incl. hooks would gut the feature for the dominant baseline case (hooks) — instead hooks excluded from `when` + sensitive guard as defense-in-depth; (b) rewriting `artifact_template_guard` for write_set-gated required SECTIONS — deferred (no existing test, smaller payoff); (c) opt-out-parity default-off — overridden by the maintainer.
- How to apply: profile config lives in `project.json → artifacts.diagram_profiles`; the resolver is self-contained (glob/extract helpers copied from `spec_design_calls_guard`, NOT imported — hook-lib self-containment is intentional). NOTE: this narrowed spec AC-004 (which listed `.claude/hooks` as reducing) — the security narrowing is recorded in the archived security report, not via a spec re-approval.
- Source: archived bundle `docs/archive/2026-06-21/spec-tdd-artifact-compression/` (spec, security, brief). Backlog `-v0lv` Lever 4.
