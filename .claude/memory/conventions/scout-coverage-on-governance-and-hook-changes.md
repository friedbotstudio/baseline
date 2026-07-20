---
key: scout-coverage-on-governance-and-hook-changes
category: conventions
scope: [scenario, implement, tdd]
verified-at: 3c74ba8
last-touched: 2026-06-20
---

- Convention: when a workflow's write_set will touch `CLAUDE.md`, `docs/init/seed.md`, any hook implementation, or the consent-gate / commands surface, the `scout` phase SHALL enumerate `site-src/**` and `README.md` as touchpoints in addition to the obvious code paths. Also: every bash hook has a multi-paragraph header comment in its `.sh` body; when porting a hook to `.mjs` or renaming a peer hook's filename, the OTHER bash hooks' header comments need updates too (they reference the file by path).
- Why: in branch-aware-git-policy (2026-05-15), the original scout report listed CLAUDE.md/seed.md/audit but missed `site-src/index.njk` (the homepage SVG diagram + "Eleven phases, X gates" copy), `site-src/hooks.njk` (consent-gates section), `site-src/skills/{core,third-party}.njk`, `README.md` line 151, and the header comments inside `spec_approval_guard.sh`, `swarm_approval_guard.sh`, and `lib/common.sh` (which reference `consent_gate_grant.sh` even after the port to `.mjs`). The user caught all of these post-implementation; we did three drift sweeps before commit.
- How to apply: in the scout report's "Primary touchpoints" section, add a `## Rendered surfaces` subsection enumerating site templates and README files that mention the feature. Add a `## Peer-hook header comments` subsection for hook ports listing every `.claude/hooks/*.sh` whose header comment references the file being renamed.
