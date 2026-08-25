---
key: branch-protection-on-main-is-config-as-code-but-not-applied
category: backlog
scope: []
status: open
source: user-instruction
raised-on: 2026-08-25
raised-in-context: release-safety-2026-08-25
verified-at: 290a41b
last-touched: 2026-08-25
governs: .github/branch-protection/main.json,scripts/ci/apply-branch-protection.mjs,docs/runbooks/ci-posture.md
---

> Branch protection deferred to backlog by the engineer.

- **The work.** Apply `.github/branch-protection/main.json` to `main` via `scripts/ci/apply-branch-protection.mjs`. The config exists as code and pins the `pre-publish-checks` context; it is maintainer-applied and not yet live.
- **Deferred deliberately, not overlooked.** Raised during `release-safety-2026-08-25` triage and set aside by the engineer in the same breath as the ticket list. T2 closed the urgent half without it: `release` already declares `needs: pre-publish-checks`, so wiring the suite into that dependency blocks the publish inside the same run. Protection gates merges; T2 gates the release.
- **What applying it costs.** `enforce_admins` is deliberately `false` and there are no required reviews or push restrictions, so the shipped shape keeps direct-to-main pushes working. Tightening past that shape breaks `@semantic-release/git`'s push of the bump commit, and the fix is the `release-bot` GitHub App migration already written up in `docs/runbooks/npm-publish.md`.
