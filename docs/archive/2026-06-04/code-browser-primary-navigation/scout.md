# Codebase Scout Report — code-browser-primary-navigation

Scope: where navigation routing is governed, where `code-browser` is wired, and how those surfaces reach consumer installs. This baseline is a CLI/governance codebase (no page→component graph), so the scout used `rg`/Read, not `code-browser` itself.

## Primary touchpoints

- `.claude/skills/code-browser/SKILL.md:1` — the skill. Frontmatter `description:` is the **auto-invoke trigger** and is frontend-shaped ("page → component → hook → service → URL", "what API populates Y", "what component renders Z"). Body has TWO layers: the **"universal walk"** (line 15-24, explicitly *"works on any codebase, regardless of framework"*) and the JS/TS fast-path helpers. The doctrine is language-agnostic; the framing and helpers are not.
- `.claude/skills/code-browser/walk.mjs`, `discover.mjs` — JS/TS/Next.js-only fast path (resolve `.tsx/.ts/.jsx/.js`, read `tsconfig.json`/`package.json`, hardcoded `src/services|context|components`, `byHook/byService/byComponent/byApiCall` output). **Non-goal to change.**
- `.claude/CONSTITUTION.md:112-113` — Appendix B **"Navigation (1)"**. ALREADY states code-browser is *"the default tool for code-navigation questions; prefer it over global grep."* But this is the **annex** (read-on-demand, not always loaded) and is frontend-framed (`byHook/byService/byApiCall/byComponent`).
- `docs/init/seed.md:231-233` — §4.3 **"Navigation (1)"**. ALREADY: *"the default mechanism... Auto-invocable on description match; the baseline prefers it over global grep... Other skills (notably scout) defer to it... fall back to rg/grep only for term sweeps."* Frontend-framed. Also §Step 5 (line 525) carries the skill-count breakdown.
- `src/seed.template.md` — byte-equal mirror of `seed.md`; must stay in sync.
- `.claude/skills/scout/SKILL.md:28-32` — the **sole live `Skill(code-browser)` invocation site**. Routes structural questions to code-browser, "if a navigation question lands you in `rg` first, stop and switch."

## The core finding

The primacy claim **already exists on paper** but does not bind where it needs to:
1. **Wrong layer.** It lives in the `CONSTITUTION.md` annex and `seed.md` §4.3 — both read-on-demand. **`CLAUDE.md` (the always-loaded in-session constitution) has no navigation/tool-routing rule at all.** Articles I–XI cover authority, architecture, workflow, engineering, git, hooks, memory, project-amendments (X.1 copy register, X.2 design-task routing, X.3 brainstorm, X.4 codesign) — none govern navigation.
2. **Frontend-framed.** Every governing mention describes the page→network-boundary walk and `byHook/byService/byApiCall/byComponent`, so on a Python/Go/Rust repo the rule reads as not-applicable. The language-agnostic universal walk is only in the skill body, not the governing rule.
3. **Silent on Explore.** All three mentions say "prefer over **grep**" — none mention the **Explore agent**, which is the other primary tool the model reaches for navigation.

## Entry points that reach this code

- **Skill auto-invocation** — the Skill tool surfaces `code-browser` on `description:` match. The description is the de-facto router; its frontend shape is why backend navigation questions don't trigger it.
- **`scout` phase** — `.claude/skills/scout/SKILL.md:28` is the only skill that explicitly delegates to it.
- **Consumer install** — `bin/cli.js:24` materializes **`.claude/`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`** into the target. `obj/template/` contains `CLAUDE.md` + `CONSTITUTION.md` + `seed.md` + all skills. `src/cli/install.js` `COPY_EXCLUDE` is **empty** → every template file ships. **So a rule in `CLAUDE.md` + the skill description DOES reach consumer installs** (fresh install refuses on sentinel collision; `upgrade` does three-tier merge). This answers the brief's load-bearing open question.

## Existing tests

- **No test references `code-browser`** (`rg -ln code-browser tests/` → empty). There is no existing test to update; any behavioral assertion is net-new. Relevant to the spec's testability open question — navigation primacy is model-judgment, not a deterministic unit.

## Constraints and co-changes

- `docs/init/seed.md` → `CLAUDE.md` precedence (Article I.4): a change to Articles I–IX edits seed first. A new **Article X project-amendment** binds alongside and is the lighter-weight path (mirrors X.2 "Design-task routing" precedent).
- Byte-equal mirrors: `src/CLAUDE.template.md` ↔ `CLAUDE.md`, `src/seed.template.md` ↔ `seed.md`. Audit enforces equality.
- `.claude/skills/audit-baseline/audit.mjs:132` asserts skill count (`forty: 40`) and `CLAUDE.md` ≤ 40,000 chars (`CLAUDE_CHAR_CAP`, line 326). Skill count is a **non-goal to change**; any CLAUDE.md additions must respect the char cap.
- `site-src/skills/core.njk` and `CHANGELOG.md` also mention code-browser (rendered docs / history) — docs-phase co-changes, not behavioral.
- Build: `scripts/build-template.sh` regenerates `obj/template/` + `manifest.json` from source; editing `.claude/skills/code-browser/SKILL.md` or `CLAUDE.md` requires a rebuild so the shipped template + manifest hashes match (else `audit-baseline` hash-drift FAIL).

## Patterns in use here

- Routing rules that bind in-session behavior live as **Articles in `CLAUDE.md`** (always loaded); narration/enumeration lives in the `CONSTITUTION.md` annex; the genesis spec lives in `seed.md`. The X.2 "Design-task routing" amendment is the closest structural precedent for a new navigation-routing amendment: a short binding rule in CLAUDE.md + a table, with enforcement/detail in the annex.
- Skills are selected by `description:` match — the description is the real router, so behavioral primacy and the description must agree.

## Risks / landmines

- **The doctrine already claims primacy and the symptom persists anyway** — so simply restating "prefer over grep" is unlikely to be sufficient. Whatever the spec chooses must address *why* the existing claim doesn't bind (wrong layer / frontend framing / Explore-silent), not just repeat it.
- **Char cap**: `CLAUDE.md` is near a 40,000-char governance cap; a new Article must be terse or push detail to the annex.
- **Mirror drift**: any constitution/seed edit must update the `src/*.template.md` mirror in the same change or the audit fails.
- **No deterministic test surface**: "code-browser is primary" resists unit testing; the spec must decide whether the AC is an artifact check (rule present + description deframed) or an eval-set, per the intake's third open question.
