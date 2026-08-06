---
key: unwitnessed-diagrams-are-the-only-noncitable-ones-2026-08-06
category: decisions
scope: [spec, tdd, integrate, security]
governs: .claude/skills/workspace/witness.mjs,.claude/skills/scout/SKILL.md,docs/system/**
source: engineer decision, gate-A approved 2026-08-06. Spec `docs/specs/central-system-spec.md` §Decisions, third row; narrows the architecture-map cycle's own ruling.
verified-at: d4e6216
last-touched: 2026-08-06
---

- **Decision.** Narrows **D8** of the architecture-map spec (`docs/archive/2026-08-05/architecture-map/spec.md`) — "a diagram routes; the code at the anchor witnesses; no generated view is ever cited as evidence." The prohibition now applies exactly to a diagram whose declared witness is `none`. A diagram carrying a resolvable `anchor-digest` or a named passing `test` MAY be cited, because something falsifies it.
- **Rationale.** The superseded rule bounded the honesty hazard by assuming nothing could check a diagram, so the worst a wrong one could do was misroute — a recall miss, never a fabrication. Once a witness exists and is mechanically checked, that assumption no longer holds for that diagram, and refusing to cite a checked artefact discards the very property the check was built to create. The bound is preserved precisely where it still applies: the unwitnessed tier, which stays route-only and is marked as such in every report.
- **Why the unwitnessed tier is kept rather than banned.** A project modelling a domain that has no mechanical witness — a business process, a regulatory flow — still needs it in the central spec. Permitting it while marking it non-citable is more honest than either excluding it (the model lies by omission) or pretending it is checked (the model lies outright). See [[durable-diagram-witness-rule-replaces-kind-whitelist-2026-08-06]] for the witness taxonomy this narrows against.
- **Re-verification.** `witness.check` must classify a `none`-witness shard as permitted-and-non-citable, never as an error and never as fresh. If unwitnessed shards start reporting as citable, this narrowing has been over-applied and the fabrication bound is gone.
