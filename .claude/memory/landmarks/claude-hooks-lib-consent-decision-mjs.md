---
key: .claude/hooks/lib/consent-decision.mjs
category: landmarks
scope: [scout]
---

- Role: Foundation — the commit-consent decision, split out of the hooks so it is import-safe (no `main()`) and unit-testable. Four exports: `parseCommitConsentToken(text)` (accepts both on-disk token shapes — slug-mode `line1=slug, line2=epoch`, and epoch-only `line1=epoch` for ad-hoc/legacy tokens), `decideCommitConsent({token, workflow, now, ttl})`, `buildGrantCommitMarkerLines(slug, now, note)`, `resolveWorkflow(rootDir)`. Resolves three workflow states: **absent** (no `.claude/state/workflow.json`) → classic 900s time-window fallback; **present+slug** → slug-scoped match, so ONE `/grant-commit` authorizes every commit in that workflow's landing and only that workflow; **present+broken** (unreadable / unparseable / no slug) → fail closed.
- Companion: `.claude/hooks/git_commit_guard.mjs` + `.claude/hooks/consent_gate_grant.mjs` (the two importers — the guard reads the decision, the UserPromptSubmit hook writes the marker outside Claude's tool boundary), `.claude/hooks/lib/common.mjs` (`canonicalSlug`). Tests: `tests/consent-decision.test.mjs`, `tests/branch-aware-git-policy.test.mjs`, `tests/git-topology-guard.test.mjs`.
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09
- Caveat: generalizes the ERP's ADR-0033, which bound consent to the workflow slug and **failed closed when no workflow was present**. That only stays usable when feature branches are left unprotected, so the slug check never fires on ad-hoc commits; on a project protecting every branch it forbids every ad-hoc commit. The absent→time-window fallback is the fix — do not restore fail-closed-on-absent. Empty slug (`''`) can never satisfy a slug match; `decideCommitConsent` guards it explicitly.
