---
key: tier-dial-oracle-floors-2026-06-16
category: decisions
scope: [spec]
source: user-instruction (the `regulated` tier choice) + spec.
verified-at: d36d7f0
last-touched: 2026-08-05
---

- Decision: shipped v1 piece-2 — the threat/value tier dial. New shipped accessor `.claude/hooks/lib/tier-dial.mjs` (exports `readTier`, `resolveCheckerThreshold`, `resolveAllCheckers`; consts `CANONICAL_CHECKERS` [brainstorm/spec/tdd/security/review/ac-conformance], `DEFAULT_PROFILES` for internal-tool/customer-data/regulated, `DEFAULT_THRESHOLD`). One read path for every checker's floor (quality threshold) + ceiling (effort budget): `project.json → tier.level` picks a built-in profile, `tier.overrides.<checker>` tunes per field. Throw-safe — falls back to `common.mjs` `projectGet`, defaults to `internal-tool`. This repo self-classifies `tier.level: "regulated"` (tdd mutation floor 0.85). `scripts/mutation-oracle.mjs` reads its `tdd` floor via the accessor and surfaces score-vs-floor (ABOVE/BELOW/NA) — ADVISORY ONLY: never writes `last_test_result`, exits 0. The 5 representative checker SKILL.md files (brainstorm, spec-lint, security, simplify, integrate) carry a `tier-dial:read-path` marker; `tests/tier-dial-coverage.test.mjs` is the mechanical "all checkers wired" oracle.
- Rationale: pins "what's the bar" + "how hard do we search" as config, not per-run LLM judgment (vision Part 5.4–5.5). The piece-3 mutation oracle was a real floorless consumer awaiting a floor.
- Boundary (load-bearing): BLOCKING is explicitly piece 5 (maker/checker RALPH stop-rule). `mandatory` is resolved DATA this slice; nothing gates on it. Security review flagged: when piece 5 wires blocking, the dial becomes a security control — a lenient/missing tier weakens the gate, and `ceiling-below-floor` must yield (never silently downgrade, mirroring `verify_pass_guard`'s PASS-when-FAIL lesson).
  > verbatim (user, 2026-06-16): "confirm the boundary on #1, set this repo to regulated"
- Archive: archived spec `docs/archive/2026-06-16/tier-oracle-floor-dial/spec.md`; security `docs/archive/2026-06-16/tier-oracle-floor-dial/security.md`. Backlog `-1a2d` (auto-stamped picked-up by this commit). Next: piece 4 (oracle-bound checker refit) per validated sequence 2→4→6→5.
