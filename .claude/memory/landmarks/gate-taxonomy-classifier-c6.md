---
key: gate-taxonomy-classifier-c6
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Path: `.claude/hooks/lib/gate-taxonomy.mjs` (`classifyOperation` + `CATEGORIES` + `CONSENT_POINT_MAP`)
- Role: C6 (roadmap Epic 3, shipped 2026-07-16) — the deliberately-coarse **"safe vs ask-a-human" classifier**. Pure, total function mapping an operation descriptor `{kind, target, meta}` → `{verdict: 'safe'|'ask', category, reason}`, grounded in XI.12's four categories (`CATEGORIES` = consent-adjacent-scope / irreversible-destructive / policy-flip / contradictory-requirements). Generalizes the annex §5.12 category list into a mechanical classifier.
- **Advisory-only, no live caller**: built BEFORE any autonomy (vision §2.4); nothing imports it yet, so it cannot alter any gate/guard enforcement (AC-006 — full guard suite passes unchanged). `CONSENT_POINT_MAP` is a test-only advisory map proving each live consent point resolves to a category.
- Contract: caller supplies pre-classified `meta` flags (`destructive`, `onProtectedBranch`, `matchedPattern`) — the classifier never re-parses raw commands (avoids `destructive_cmd_guard` regex drift). Unknown/malformed kind → `ask` (fail-safe); `Object.hasOwn` guard on the rule lookup (see [[op-dispatch-plain-object-map-reaches-prototype-members]]).
- 7 op-kinds: git-op, destructive-bash, consent-token-write, phase-skip, spec-widen, config-flip, requirement-conflict (see [[gate-taxonomy-7-kind-closed-set-2026-07-16]]).
- Tests: `tests/gate-taxonomy.test.mjs`, `tests/gate-taxonomy-advisory-map.test.mjs`. Archive: `docs/archive/2026-07-16/gate-taxonomy/`.
- Next (backlog `-9008`, un-done): wire into a live decision point when autonomy arrives; then the AI-native debugging skill; then v2.
