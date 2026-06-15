# Codebase Scout Report — fix vitest reporter flag + close docs-only chore verify trap

## Primary touchpoints

### Part 1 — reporter flag (isolated)
- `.claude/skills/claude-automation-recommender/SKILL.md:45` — recommends `test_cmd: "vitest run --reporter=basic"`. `basic` removed in vitest v4.x. Single-line change. This is a vendored Apache-2.0 skill (`owner` differs — confirm provenance before edit) but the recommended command string is project-curated content.

### Part 2 — docs-only verify trap (constitutional + skill change)
- `.claude/skills/chore/SKILL.md:42-48` — **Mandatory phases** list; line 45 declares `verify` always-run. Line 80 (Step 4) is the **inlined verify** the chore skill actually executes. Lines 50-73 are the existing **conditional** pattern (`simplify`/`integrate`/`document`) decided by in-skill triggers. **This is the file where the fix lives** — verify must become conditional in the same shape as those three.
- `.claude/skills/verify/SKILL.md:27-35` — the verify *contract* (read `project.json → test.cmd`; PASS iff `exit 0 AND ≥1 test executed AND nothing failed`). **Non-goal: do not change this rule.** Only change *when* the chore skill invokes it.
- `docs/init/seed.md:268` and `docs/init/seed.md:354` — genesis text for the chore track; both state `verify` "always run"/"mandatory". `seed.md:14` summary also says "runs verify + archive mandatorily". All three must be amended consistently (Article I.4: seed.md changes first).
- `CLAUDE.md:92` — Article IV chore entry-point bullet: "`verify`, `archive`, `/grant-commit` + `/commit` remain mandatory." Must be amended to reflect verify's new conditionality.
- `src/CLAUDE.template.md` — **byte-equal mirror of CLAUDE.md** (confirmed `diff -q` byte-equal; 34,234 chars). Same edit must land here.
- `src/seed.template.md` — mirror of seed.md (pre-§16 body byte-identical per parity test). Same seed.md edits must land here.

## Entry points that reach this code
- `/triage` (`.claude/skills/triage/SKILL.md`) — classifies a request onto the `chore` track and writes `workflow.json → exceptions`. **Today it has NO notion of write_set / pure-docs / test.cmd inspection** — exceptions are hardcoded per track type (non-git auto-exceptions only). This contradicts the intake's assumed "/triage records the exception" mechanism (see Risks).
- `/chore` (`Skill(chore)`) — the executor; runs the inlined verify and the conditional triggers in-process.
- `/harness` — loops the chore track; chore is a single DAG node that does all the internal work.

## Existing tests (the invariant suite the spec must keep green)
- `tests/byte-equivalent-migration.test.mjs:86-90` — golden chore TaskList fixture expects the **4-node DAG** `chore → memory-flush → grant-commit → commit`. **verify is NOT a DAG node** (confirmed against live `workflows.jsonl`). → Keeping verify in-skill (not adding a node) leaves this fixture untouched. Adding a DAG node would break it.
- `tests/seed-template-parity.test.mjs:44-79` — seed.md ↔ src/seed.template.md byte parity (pre-§16 body). Any seed.md prose edit must mirror.
- `tests/article-iv-mirror.test.mjs:32-56` — CLAUDE.md Article IV ↔ src/CLAUDE.template.md (and seed §17 ↔ template). Any CLAUDE.md Article IV edit must mirror.
- `tests/appendix-a-mirror.test.mjs:31-54` — annex/appendix structure; no python3 mention.
- `tests/derive-counts.test.mjs:21-44` — governance counts (41 skills, 23 hooks, 6 commands, 1 subagent, 7 canonical tracks + 2 sub-tracks, 7 memory files, 3 mcp). **No new skill/hook/command/track** in this change → counts unaffected.
- `tests/track-tasklist-materializer.test.mjs`, `tests/workflows-validator*.test.mjs` — materializer + workflows.jsonl validation. Unaffected unless the chore DAG changes (it should not).
- `tests/governance-no-python3-runtime.test.mjs`, governance-count-drift — unaffected.

## Constraints and co-changes
- **Article I.4 precedence**: the amendment originates in `docs/init/seed.md`, then propagates to `CLAUDE.md` (+ `src/CLAUDE.template.md`), then to `chore/SKILL.md`. seed.md governs; do not edit CLAUDE.md/skill ahead of seed.
- **Mirror parity is mandatory and byte-level**: every seed.md edit → src/seed.template.md; every CLAUDE.md edit → src/CLAUDE.template.md. Three parity tests enforce.
- **CLAUDE.md 40k cap**: currently 34,234 chars — ~5,766 headroom. The Article IV edit is small; no annex offload needed, but keep it tight.
- **project.json shape** (`.claude/project.json:4-11` and `obj/template/.claude/project.json:4-11`): `test.cmd` is monolithic; no `test.kind` / `suite_type` / structural-vs-behavior key exists anywhere in the repo. The new explicit signal (see below) likely adds a key here; `obj/template` copy must match.
- The reporter fix touches a **vendored** skill — verify it's the recommended-command content (project-curated), not upstream-licensed prose, before editing; note it in the diff rationale.

## Patterns in use here
The chore skill already models exactly the shape this fix needs: a **mandatory** block (Step 4 verify) plus a **conditional** block (`simplify`/`integrate`/`document`) where each conditional phase has explicit, auditable triggers and every skip is documented in the end-of-chore summary (SKILL.md:50-73, 81-83, 100). The clean implementation moves verify from the mandatory block into the conditional block with a single trigger: "run verify UNLESS the write_set is pure-docs/prose AND test.cmd is a behavior suite." Constitutional prose mirrors this in seed.md/CLAUDE.md.

## Risks / landmines
1. **Mechanism divergence (intake said "/triage records the exception" — it can't, as written).** verify is not a `/triage`-exceptable DAG node; it's inlined in the chore skill, and the existing conditional phases are decided *in-skill*, not by triage. The spec MUST resolve this: strongly prefer making the in-skill verify conditional (consistent with simplify/integrate/document; leaves the chore DAG + golden fixture untouched) over introducing a verify DAG node (breaks `byte-equivalent-migration` and changes the 4-node fixture). This is a `/research` + `/spec` decision.
2. **No "behavior suite vs structural check" signal exists.** Non-goal forbids heuristic auto-classification. The signal that tells the chore skill "this repo's test.cmd is a behavior suite, so a docs-only diff can't be verified by it" must be **explicit config** (candidate: a `project.json` key). `/research` must enumerate options (e.g. `test.kind: structural|behavior`, or `test.covers_docs: bool`, or a chore-scoped flag) with tradeoffs. The baseline's own test.cmd (the audit) is *structural* and DOES meaningfully check docs/governance — so a docs-only chore on the baseline must STILL run verify; the signal must distinguish these two repos.
3. **"pure-docs write_set" must be defined concretely.** Boundary chosen at intake = pure-docs/prose ONLY (any code/config/script touch keeps the gate). The chore skill needs a deterministic way to classify its own diff as pure-docs (it already inspects the diff for the simplify/integrate/document triggers — reuse that diff-inspection rather than adding triage write_set analysis).
4. **Three seed.md sites + the summary line.** seed.md:14, :268, :354 all assert verify mandatory in chore; all must change in lockstep, and each mirrored into src/seed.template.md byte-equal.
5. **Vendored-skill edit.** Part 1 edits a vendored skill — confirm the edit is to recommended-command content and won't trip any vendored-mirror/license check.
6. **Backward-compat of the new config key.** Repos without the new signal (absent key) must default to today's behavior (verify mandatory) so existing installs don't silently start skipping verify. Default must be conservative.
