---
key: .claude/hooks/lib/common.mjs:1
category: landmarks
scope: [scout]
---

- Role: shared Node ESM helpers imported by EVERY hook (all 26 `.claude/hooks/*.mjs`; breaking changes cascade). Exports `readPayload`, `payloadGet`, `projectGet`, `emitBlock` / `emitAllow` / `emitAsk` / `emitInfo`, `logLine`, `canonicalRel`, `canonicalSlug`, `writeMarkerAtomic`, `validateConsentMarker`, `blockMarkerSelfWrite`, the consent-marker path constants (`CONSENT_MARKER_{SPEC,SWARM,COMMIT,PUSH}` plus `_REL` siblings), `matchAnyGlob(name, globs)` (shell-glob matcher for branch policy), `cmdMatchesAny(cmd, patterns)` (regex set for destructive-cmd guard), `computeProposedContent(tool, payload, filePath)` (post-write content reconstruction for content-aware guards like artifact_template_guard / spec_diagram_presence_guard / spec_design_calls_guard / plantuml_syntax_guard), and the branch-topology primitives `resolveWorkflowModel` / `isPrimaryWorkTree` / `currentBranch` (shared by `git_commit_guard` topology + `branch_guard` so the work-start gate cannot drift from the commit gate). Also hosts the **wrapper/quote-aware shell-command classifier** (added 2026-05-31): exported `gitSubcommandInvoked(cmd, sub)` + `gitSegments(cmd)`, backed by internal `executedFragments` / `shellTokens` / `extractSubstitutions` — used by `git_commit_guard` to detect real `git commit`/`git push` (including wrapped forms) without false-positiving on data. See landmine `shell-command-guards-must-classify-wrapper-and-quote-aware`.
- Verified-at: cb390e5
- Last-touched: 2026-07-04
