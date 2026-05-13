# Skill alignment audit — 2026-04-28

Read-only sweep of all 36 skills against `CLAUDE.md` (Articles I-X) and `docs/init/seed.md`. Three parallel review agents, each handling a slice; this document aggregates findings.

## Verdict at a glance

- **No Article II violations** (decision-locality). The only sanctioned subagent path is `/swarm-dispatch` → `swarm-worker`; no other skill spawns subagents.
- **No Article IV violations** (workflow ordering / consent gates). No skill self-approves a spec, writes its own consent token, or attempts to bypass `track_guard`.
- **No Article VI violations** (engineering rules) in any project-authored skill. The four mandatory sub-skill invocations (`scenario`→`code-structure`, `implement`→`code-structure`+`context7`, `design-ui`→`impeccable`, `prose`→`humanizer`) are all present.
- **Six findings worth acting on, plus three further sweep-cleanup edits.** All actionable findings are now resolved on disk — including the three that the original sweep had marked as either deferred or KNOWN. Two genuine no-action items remain (`humanizer` and `documentation` — vendored leaf skills with no constitutional misalignment).

## Fixed in this run (2026-04-28)

| Skill | Severity | Finding | Fix |
|---|---|---|---|
| `audit-baseline/SKILL.md` | HIGH | Output sample showed stale counts (14 hooks / 8 agents / 25 skills) and listed removed cross-doc files (`docs.jsx`, `arch-diagram.jsx`). | Updated sample to current shape: 17 / 1 / 36, removed jsx rows, added `playwright` MCP and `docs/init/seed.md` rows. |
| `prose/SKILL.md:104` | LOW | Listed `docs/site/**` and `site/**` as in-scope humanizer surfaces — the `docs/site/` half was made stale by the recent quickfix that nulled `workflow.artifacts.document`. | Replaced with config-aware reference to `project.json → workflow.artifacts.document`, defaulting to `site/**`. |
| `harness/SKILL.md:95` | LOW | Pillar 4 narrative referred to `docs/site/**` as the document phase's surface. | Replaced with config-aware reference to the project's rendered-site path. |
| `impeccable/SKILL.md` + `reference/{document,teach,live}.md` | MED | Mandated `node .agents/skills/impeccable/scripts/<X>.mjs` invocations whose path doesn't exist in this baseline (`.agents/` absent). Would fail the first time `design-ui` invoked `Skill(impeccable)`. | Replaced 7 occurrences of `.agents/skills/impeccable/scripts/` with `.claude/skills/impeccable/scripts/` across SKILL.md + 3 reference docs. Apache 2.0 §4(b) modification record at `.claude/skills/impeccable/PROJECT_NOTES.md`. The sibling-tool-detection arrays in `scripts/cleanup-deprecated.mjs` and `scripts/pin.mjs` were left untouched (those reference `.agents` as one of several agent-tool dir prefixes, not as a path to this skill). |
| `commit/SKILL.md:14` | MED | Step 4 drafted the commit message body inline — the only prose surface in the baseline that bypassed the humanizer pipeline. Seed.md §10 + §16 follow-up flagged. | Step 4 now invokes `Skill(humanizer)` directly on the drafted body before issuing `git commit`. Subject line stays inline (fixed register, no humanizer needed). Chose `humanizer` over `prose` to skip the register-picking + conditional sub-skill overhead — register is fixed for commit bodies. |
| `claude-automation-recommender/SKILL.md:19,21` | MED | "Working with the baseline" section claimed `14 guard hooks` and `34 skills` — both stale (now 17 hooks / 36 skills). The recommender feeds `/init-project` Step 4; stale counts could lead it to recommend baseline components as additions. | Updated SKILL.md to current shape: 14 → 17 hooks (added the 3 lifecycle hooks `memory_session_start`, `memory_stop`, `memory_pre_compact` to the listing), 34 → 36 skills (added `chore` alt-track and `memory-flush` memory skill to the breakdown). Recorded as a new dated entry under `NOTICE` "Local changes" (per Apache 2.0 §4(b)); the historical 2026-04-25 entry is preserved verbatim. |
| `technical-tutorials/SKILL.md:16,23,562-566` | MED | Mandated reading `.agents/developer-audience-context.md` (file absent in baseline) and invoking a `developer-audience-context` skill that doesn't exist; the "Related Skills" section listed three more upstream-only skills as if they shipped. | Replaced the audience-context loading instruction with an inline elicitation flow ("ask the user for the four points; document assumptions"). Added a clear "do not ship in this baseline — for reference only" header to the Related Skills section. |
| `copywriting/SKILL.md:77,243-249` | LOW | "Related Skills" section pointed at five sibling skills (`copy-editing`, `page-cro`, `email-sequence`, `popup-cro`, `ab-test-setup`) absent from this baseline; the in-body line at 77 also assumed `copy-editing` was available. | Same disposition pattern as `technical-tutorials` — annotated the in-body reference and added a section header noting these are upstream-only. |
| `design-ui/SKILL.md:20,43` | KNOWN→FIXED | `docs/site/` references in the design-ui skill body. Originally carved out per the prior quickfix scope; revisited as part of this audit's full sweep so the project's chosen path (`site/` + the `workflow.artifacts.document` config field) holds across every skill. | Replaced both lines with config-aware references (`project.json → workflow.artifacts.document` plus `site/` as the project default). Aligns design-ui with the matching `prose` and `harness` fixes earlier in this audit. |

## Deferred — vendored / separate scope

| Skill | Severity | Finding | Disposition |
|---|---|---|---|
| `humanizer/SKILL.md` | LOW | Vendored leaf skill invoked by `prose`. No project-side instruction that register-picking lives in caller's context — but `prose` already enforces this on the caller side, so the leaf skill can stay opinion-neutral. No constitutional misalignment. | No action. |
| `documentation/SKILL.md` | LOW | Originally suspected truncated at line 50 ("Link, don't duplicate"). On inspection the upstream skill is intentionally brief — the file ends cleanly after a 5-item principles list. No action needed. | No action. |

## Cross-cutting observations

- **Decision-locality is intact across all workers**. `scenario`, `implement`, `prose`, `design-ui` each open with explicit "decision the main context has already made" framing and stop-and-ask rules for missing inputs.
- **Task discipline (Article V)**. `triage` correctly seeds the `TaskCreate` checklist per the canonical templates. `harness` describes the read-claim-update loop and re-seeds on cross-session resume. Phase skills don't need to manage tasks themselves — that's the orchestrator's job.
- **`chore` skill** correctly enforces the 30-line / 3-file cap, allowlist of file types, structural-path blocklist, no-new-files rule, and refusal-bounce to `/triage` on out-of-scope. The `review` phase reference in its prereq is correct (`review` is a canonical phase per `project.json → workflow.phases`).

## Methodology

- Three parallel `general-purpose` review agents, each given a slice of the 36 skills + the rubric (CLAUDE.md, seed.md). Each returned a structured findings table.
- Agents were briefed not to flag the `design-ui` `docs/site/` references (KNOWN) and to mark vendored-skill issues as "addendum, not edit".
- One agent flag was confirmed false-positive on inspection: `chore` listing `review` in its exceptions array — `review` IS a canonical phase per `project.json`.

## Follow-ups recommended

1. ~~**`impeccable` runtime path mismatch**~~ — RESOLVED 2026-04-28. Path replacement applied in place under Apache 2.0 §4(b), see modification record at `.claude/skills/impeccable/PROJECT_NOTES.md`.
2. ~~**`commit` → `prose`**~~ — RESOLVED 2026-04-28. Route directly through `Skill(humanizer)` rather than `Skill(prose)` (commit body register is fixed; `prose`'s register-picking + conditional sub-skill machinery is overhead).
3. ~~**Vendored skill stale counts**~~ — RESOLVED 2026-04-28 for `claude-automation-recommender` (in-place edit + `NOTICE` modification record per Apache 2.0 §4(b)).
4. ~~**`technical-tutorials` missing references**~~ — RESOLVED 2026-04-28. Replaced the audience-context loader instruction with an inline elicitation flow; annotated "Related Skills" as upstream-only.
5. ~~**`copywriting` missing siblings**~~ — RESOLVED 2026-04-28. Same pattern as `technical-tutorials`.
6. ~~**`design-ui` `docs/site/` references**~~ — RESOLVED 2026-04-28. Originally KNOWN-carve-out per the prior quickfix scope; revisited and aligned with the project's `workflow.artifacts.document` config field.

All actionable findings from the 2026-04-28 sweep are now resolved on disk. Remaining no-action items: `humanizer` and `documentation` (vendored leaf skills with no constitutional misalignment).
