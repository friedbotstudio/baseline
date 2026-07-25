---
key: .claude/hooks/lib/slug.mjs
category: landmarks
scope: [scout, spec, tdd, security]
caveat: REJECT, never normalize. `canonicalSlug` in `common.mjs` is a NORMALIZER for display/marker derivation and must never be used as the validator — routing a path guard through it masks a traversal by silently redirecting the write. `tests/slug-guard-hoist.test.mjs` enforces the separation with a source scan that greps the literal symbol name, so the seven scanned modules cannot even name it in a comment.
verified-at: ea618e9
last-touched: 2026-07-25
---

- Path: `.claude/hooks/lib/slug.mjs`
- Role: Foundation module owning the single kebab-slug predicate for every path built from a slug (roadmap T2, backlog `-9f4f`). Exports `SLUG_RE` (`/^[a-z0-9][a-z0-9-]*$/`), `MAX_SLUG_LEN` (200), `isSafeSlug(slug)` (pure boolean, never throws, safe on non-strings), and `assertSafeSlug(slug, label = 'slug')` (throws a named `Error` prefixed with `label`). Created when the third caller appeared — the shape had drifted into FIVE independent redeclarations, and the T1 length bound existed in only one of them.
- Why it lives in `hooks/lib` and not `skills/harness`: `hooks/lib` is the LOWER layer. Skills already import from it (`plan-store.mjs` imports `tier-dial.mjs`), so placing the predicate here lets both hooks and skills consume it without inverting the dependency.
- What is shared is the PREDICATE, not the failure mode. Callers sit at different layers and owe their callers different failures: `plan-store.mjs` and `whatsnew/fragment-writer.mjs` throw; `harness/consolidate-open-questions.mjs` and `triage/seed-tasklist.mjs` write stderr and exit 2; `harness/checkers/ac-conformance.mjs` degrades to `{findings: []}` because it is fail-open by contract; `hooks/lib/timing.mjs` uses the predicate (not the thrower) inside `stampFromWorkflow` so its documented "never throws" contract survives, while its exported `timingPath`/`approvalTokenPath` builders throw.
- Back-compat: `plan-store.mjs` re-exports `assertSafeSlug` label-bound to `plan-store`, keeping the error prefix and the import path stable for `checker-fanout.mjs`, `pre-implementation-gate.mjs`, `approval-provenance.mjs`, and `tests/plan-store-slug-length.test.mjs`. Do not rewire those three importers.
- Companion: [[.claude/hooks/lib/consent-decision.mjs]] (validates a consent token's slug before composing an archive-bundle path), [[.claude/hooks/lib/timing.mjs]], [[hook-sandbox-fixtures-use-an-explicit-cpsync-allowlist]].
