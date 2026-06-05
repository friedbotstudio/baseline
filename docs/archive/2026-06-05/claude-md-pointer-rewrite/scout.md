# Codebase Scout Report — CLAUDE.md → annex headroom restructure

Scope: the governance files that the restructure edits, plus every test/audit site that
constrains it. No product source code is in scope — this is a constitution-architecture change.

## Primary touchpoints

- `CLAUDE.md` (38,479 chars) — the file to trim. Holds Articles I–XI. Art I.6 (line 18) states the 40,000 cap and that it "carries binding rules only; amendment history, enforcement narration, and reference appendices live in the annex".
- `src/CLAUDE.template.md` (38,479 chars) — **byte-equal mirror** of CLAUDE.md. Every CLAUDE.md edit must be applied identically (audit + tests assert `read('CLAUDE.md') === read('src/CLAUDE.template.md')`).
- `.claude/CONSTITUTION.md` (24,607 chars) — the annex, **no byte cap**. Destination for relocated material. Self-describes as the "read-on-demand companion" (line 3) and already holds Appendix A ("Where things live") + Appendix B (skill index). The pointer architecture partially exists already.
- `docs/init/seed.md` (94,357 chars) — genesis. The cap rule lives in **§14** (line 584); skill-provenance in **§17** (line 702). Art I.4 precedence: this seed-architecture change amends seed.md first, then CLAUDE.md conforms.
- `src/seed.template.md` (85,782 chars) — seed mirror. Cap rule at line 584, §17 at line 626. NOT byte-equal to seed.md as a whole (§16 diverges by design); pre-§16 body and §17+ tail must match.

## Entry points that reach this code

- **Session load** — `CLAUDE.md` is auto-injected into every session's context (the always-loaded surface). The annex is read on-demand only.
- **`audit-baseline`** — `node .claude/skills/audit-baseline/audit.mjs` (CI + `/integrate`). Enforces cap, citations, mirror byte-equality, counts.
- **`npm test`** — the governance test suite (below) runs in CI and at `/integrate`.

## Existing tests (all must stay green)

- `tests/code-browser-primary-navigation.test.mjs` — **THE central guard.** `CLAUDE_CHAR_CAP = 40000` (L38), `CLAUDE_TARGET_MAX = 38500` (L39, "≥1500 headroom, AC-007"). Asserts: CLAUDE.md ≤ 38,500 bytes (L~107); all `REQUIRED_ARTICLE_HEADINGS` (`## Article I`..`## Article XI`) present; all `REQUIRED_BINDING_MARKERS` present = `['No stubs','YAGNI','Context7','swarm-worker','approve-spec','grant-commit','§17']`; CLAUDE.md byte-equal to mirror; seed nav-deframe in both seed.md + CONSTITUTION.md; `walk.mjs`/`discover.mjs` SHA-pinned (unrelated, don't touch).
- `tests/thread-shelving-governance.test.mjs` — `assert claude.length <= 40000` (L49); audit exits 0 with unchanged counts (L27); CLAUDE.template byte-mirrors CLAUDE.md (L52); cap held.
- `tests/appendix-a-mirror.test.mjs` — Appendix A `.claude/hooks/` row **must live in the annex** (`.claude/CONSTITUTION.md`), not CLAUDE.md; row free of `python3`. Confirms Appendix A was already relocated out of CLAUDE.md.
- `tests/seed-template-parity.test.mjs` — `src/seed.template.md` mirrors `docs/init/seed.md` **except §16**: pre-§16 body (§0..§15) byte-identical; §17+ tail byte-identical; template §16 is the reserved `*Reserved.*` placeholder.
- `tests/article-iv-mirror.test.mjs` — `docs/init/seed.md §17` byte-equal to `src/seed.template.md §17` (L33–41).
- `tests/template-drift.test.mjs` — `src/*.template.*` pristine-mirror set (constitution, seed) byte-for-byte vs live, with documented carve-outs.
- `tests/governance-no-python3-runtime.test.mjs` — line-number ledger `ALLOWED_LINES`: `docs/init/seed.md` = `{14,169,666}`, `src/seed.template.md` = `{14,169}`, `src/CLAUDE.template.md` = `{}` (L27–31). Inserting lines above any allowed line shifts its number → test fails until the ledger is bumped.

## Constraints and co-changes (lockstep edits)

- **`.claude/skills/audit-baseline/audit.mjs`** — `CLAUDE_CHAR_CAP = 40000` (L334, FAIL above). Citation checks: CLAUDE.md must contain `## Article XI` + `manifest` (L317); `src/seed.template.md` (seedT) must contain `## §17` + `manifest` (L322). Byte-equal mirror enforced; commands-count orientation line (L911); skills byCategory sum; Article X.2 mirror present in `src/CLAUDE.template.md` (L687–691). The audit reads `src/seed.template.md` for the §17 citation — note it is the template, not the live seed.
- **Two cap constants** if "comfortable headroom" means a *stricter enforced ceiling*: the hard `40000` lives in `audit.mjs:334`, `code-browser-primary-navigation.test.mjs:38`, `thread-shelving-governance.test.mjs:49`. The soft `38500` target lives only in `code-browser-primary-navigation.test.mjs:39`. Lowering the *enforced* margin = editing `CLAUDE_TARGET_MAX` (one site). Just getting actually-smaller needs no constant change.
- **seed.md cap prose at §14** and the §17 provenance must stay; both have template mirrors.
- **Appendix A/B already in annex** — do not move them back; the hooks-row test pins Appendix A to the annex.

## Patterns in use here

The constitution uses an em-dash-heavy "constitutional voice" (deliberately scoped OUT of the impeccable em-dash ban per Art X.1 — these are governance surfaces, not user-facing copy). Binding rules use SHALL/SHALL NOT. The annex is the established home for narration, appendices, and full-rule text where CLAUDE.md keeps a terse binding clause + pointer (the exact pattern this workflow extends). Mirrors are maintained by hand in lockstep, verified by byte-equal tests; `scripts/build-template.sh` overlays `src/*.template.*` into `obj/template/` at build.

## Risks / landmines

- **`landmines.md:191` (re-verified, accurate).** Three tripwires confirmed against current code: (1) the real budget is the **38,500 soft target**, not 40,000 — any net addition busts `code-browser-primary-navigation.test.mjs`; never drop a `REQUIRED_BINDING_MARKER` or `## Article N` heading. (2) seed.md has a **second parity mirror** `src/seed.template.md` (pre-§16 + §17-tail byte-identical). (3) **python3 line-ledger** shifts on seed.md line insertions — bump `ALLOWED_LINES` in the same edit.
- **Marker literals are load-bearing.** Moving the verbatim strings `grant-commit`, `approve-spec`, `swarm-worker`, `No stubs`, `YAGNI`, `Context7`, `§17` entirely out of CLAUDE.md breaks the marker test. The terse binding clause must retain each literal.
- **Citation strings are audited.** `## Article XI` + `manifest` must stay in CLAUDE.md; `## §17` + `manifest` in `src/seed.template.md`.
- **"Comfortable headroom" is unquantified.** The hard cap is 40k, current soft target 38,500 (1,500). The intake's open question — pick a concrete new target (e.g. ≤34k) — is a `/research` + spec/codesign decision and determines whether `CLAUDE_TARGET_MAX` changes.
- **Mirror drift is the classic failure.** CLAUDE.md and src/CLAUDE.template.md are currently identical (38,479 each). Editing one without the other is the most likely break.
