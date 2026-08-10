# Cut the warm-baseline token floor

## Context

Every session in this repo starts at **45.1k tokens** before the user types anything. The baseline pays that cost on every `/clear`, every compaction boundary, and every subagent that inherits project context.

Measured breakdown, and who owns each line:

| Category | Tokens | Owner | Addressable |
|---|---:|---|---|
| Memory files (`CLAUDE.md`) | 15.4k | this repo | **yes** |
| Skills (frontmatter index) | 11.9k | ~10.0k this repo | **yes** |
| System tools | 9.1k | Claude Code | no |
| System prompt | 5.0k | Claude Code + output style | marginal |
| Messages (SessionStart injection) | 3.6k | this repo | **yes** |
| Custom agents | 138 | this repo | no (already minimal) |

MCP tool schemas (58.7k) are already deferred and cost nothing warm. That lever is spent.

Addressable surface: **~29k of the 45.1k**. Target after this work: **~34k (-25%)**.

Three facts drive the plan:

1. `CLAUDE.md` is **38,998 chars against its own 40,000-char cap** (Article I.6). The constitution has grown into its own ceiling. The annex `.claude/CONSTITUTION.md` (79k chars) is read on demand and costs zero warm tokens — and 26 pointers into it already exist. The relocation pattern is sanctioned and idiomatic; it is simply under-used.
2. Four skills target the **Friedbot Studio website**, not this baseline. `optimize-seo` invokes five skills that do not exist here (`/orchestrate`, `/nextjs-performance`, `/web-design-guidelines`, `/simplify-code`, `/plan-commits`). It is already broken. All four are `owner: user`, so the manifest and `audit-baseline` do not see them.
3. `disable-model-invocation: true` removes a skill's description from the warm index. Proof: `verify` and `spec-render` both carry the flag and are absent from `/context`. seed.md §5 Step 6 already sanctions the flag. Roughly a third of the skill index is user-only utilities that Claude never autonomously invokes.

---

## Lever 1 — Delete the four orphaned website skills

**Saves ~650 tokens. Zero governance cost.**

Delete these directories:

- `.claude/skills/google-analytics/`
- `.claude/skills/optimize-seo/`
- `.claude/skills/pagespeed-insights/`
- `.claude/skills/marketing-psychology/`

One reference lives outside those trees: `.claude/project.json` → `memory.architecture_map.governed_surface.excludedTrees` lists `.claude/skills/optimize-seo/scripts/`. Remove that array entry.

Verified non-coupling: none of the four appears in `.claude/manifest.json` owners, in any `Skill(...)` call site, in `CLAUDE.md`, in `docs/init/seed.md` counts, or in `tests/`. The only cross-references among them are internal (`marketing-psychology` lists `google-analytics` as related; `optimize-seo` invokes `/pagespeed-insights`).

`copywriting` stays. It is baseline-owned, bound by Article XI.1 and the `prose` sub-skill contract, and asserted in `tests/document-routing-gate.test.mjs`.

---

## Lever 2 — De-index the user-only skills

**Saves ~2.9k tokens. Low risk, reversible per file.**

Add `disable-model-invocation: true` to the frontmatter of each skill below, directly after `description:`. Follow the existing shape in `.claude/skills/spec-render/SKILL.md`.

These 16 are never reached by a `Skill(...)` call from any SOP, and never auto-selected by a workflow phase. They run only when the user types `/<name>`:

| Skill | Frontmatter chars | Why it is user-only |
|---|---:|---|
| `roadmap-planner` | 1458 | on-demand plan re-derivation |
| `retrospective` | 770 | cycle-end, human-triggered |
| `org-dispatch` | 667 | `velocity.org_mode.enabled` is **false** here |
| `standup` | 660 | read-only recap; a compact form already ships in the SessionStart injection |
| `sprint-planner` | 632 | proposes only; human confirms |
| `commit-planner` | 613 | human approves the split before staging |
| `upgrade-project` | 614 | fires when the CLI prints its prompt |
| `companion` | 573 | org mode, disabled |
| `gitignore` | 548 | setup-time |
| `system-reconcile` | 528 | `/archive` calls its `cli.mjs` over Bash, not `Skill()` |
| `sprint-oracle` | 476 | manifest gate, human-run |
| `sprint-plan` | 473 | fresh-vision decomposition |
| `spec-sync` | 467 | one-time corpus bootstrap |
| `claude-automation-recommender` | 434 | `/init-project` Step 8 |
| `brd` | 315 | Article IV phase 1 marks it optional and user-run |
| `rca` | 271 | explicitly "not a workflow phase" |

**Do not touch** the phase skills, the worker skills (`scenario`, `implement`, `code-structure`, `prose`, `humanizer`, `reader-level`, `design-ui`, `impeccable`), the spec-review checkers, the track skills (`chore`, `power`), `cli-copy-review` (seeded by `/triage`), `code-browser` (Article XI.5 routing), or `faithful-capture` (invoked mid-conversation).

Judgment calls, left enabled unless you say otherwise: `audit-baseline` (seed.md calls it "auto-invocable"), `whatsnew` (main context writes its fragment), `technical-tutorials` (a `prose` conditional sub-skill).

**Governance note:** these are baseline-owned files, so their sha256 changes. Run `npm run manifest:refresh` as the last step before staging — a recorded landmine says the restamp must not precede any further edit.

---

## Lever 3 — Relocate constitution detail to the annex

**Saves ~4.5k tokens. Highest value, highest care.**

Order is fixed by Article I.4: **`docs/init/seed.md` first**, then `CLAUDE.md`, then the mirror. Amend seed.md §14 to record the relocation, then edit `CLAUDE.md`, then run `npm run sync:constitution` to regenerate the byte-equal `src/CLAUDE.template.md`.

**The rule:** move narration, mechanism explanation, and reference detail. Move nothing that binds. Every relocated block lands under an existing annex heading and leaves a one-line pointer behind, matching the 26 pointers already in place.

Per-Article targets, largest first:

| Article | Now | Move | Keep verbatim |
|---|---:|---|---|
| **VIII — Hooks** | 4,723 | The 26-row behavior table → annex §2 "Per-hook behavior detail". Replace with an event→hook-name grouping (~800 chars) plus the modification rule. | "26 hooks are the enforcement layer"; the amendment requirement |
| **IV — Workflow ordering** | 7,452 | The gate-handshake narration bullet; the four per-track paragraphs (`chore`, `freeform`, `epic`, `power`) already detailed in annex §5.13; the swarm-vs-solo rationale | The 11-phase table; "SHALL NOT skip/reorder"; the git-conditional rule; gate C branch-conditionality |
| **XI — Project rules** | 4,442 | The body of XI.1/XI.2/XI.3/XI.4/XI.12, each already carrying "Full rule table: annex §5.x". Compress each to its binding sentence plus the pointer. | the routing obligations themselves |
| **XII — Skill provenance** | 2,103 | Clauses 1, 3, 5 detail → annex §2 | the `## Article XII` heading and the word `manifest` (the audit greps for both); clauses 2 and 4 |
| **X — Multi-session** | 1,578 | Nearly all of it → annex §5.6, which already holds the full rule table. `velocity.org_mode.enabled` is **false** in this project. | a 4-line stub: opt-in, OFF, adds no subagent, gates stay structural |
| **V — Harness** | 2,546 | The integrate-failure decision tree → `.claude/skills/harness/SKILL.md`, where the Article already says the SOP lives | the four exit conditions; "SHALL NOT self-approve" |
| **III — Session start** | 2,450 | The verbatim project-agnostic greeting string (~430 chars); this repo is `configured: true` and never emits it | the 6-step procedure |
| **IX — Memory** | 2,796 | Clause detail behind the existing annex pointers | the 10 clause obligations |

**Never touch:** Article VI in full. Those are the non-negotiable engineering rules and they earn their warm-context cost on every code change. Article I and Article VII's hard-block list stay verbatim too — a forbidden git operation the model cannot see is a forbidden operation it will attempt.

Target: `CLAUDE.md` ≤ **28,000 chars**. The audit's `CLAUDE_CHAR_CAP` stays at 40,000; the point is headroom, not a lower cap.

---

## Lever 4 — Trim the SessionStart injection

**Saves ~1.1k tokens. Code-only, no governance.**

The hook emits **7,617 chars**. Concrete waste in the current payload:

- **Recent shell commands** — ten lines, all the identical `cd /Users/work/Documents/personal/fbs/baseline`. Deduplicate, and drop `cd`-only entries.
- **The base64 `thread-entry` blob** in the shelved-thread block — a machine field the model cannot read and does not need. Emit it only into the file, not into `additionalContext`.
- **In-flight files** — 24 paths. Cap at 8.
- **Duplicate verbatim cue** — the same user request appears three times (Recent user requests, Shelved thread, Working thread). Emit once and cross-reference.
- **Recent skill invocations** — 10 entries; 5 is enough to reconstruct position.

Files: `.claude/hooks/lib/resume_writer.mjs` (the `## Recent shell commands` renderer at line 252 and its siblings) and `.claude/hooks/lib/memory_session_start.mjs`. The hook's own comment already sets the contract: "Kept under ~10KB total." Tighten it to ~4KB.

---

## Sequencing

Run as a **`chore` track** — no failing-test path drives Levers 1, 2, or 3. Lever 4 changes hook behavior and owes a test, so route it separately through `tdd`, or accept `chore` with the existing hook tests extended.

1. Lever 1 (delete + `project.json`) — independent, land first.
2. Lever 4 (hook trim) — independent.
3. Lever 3 seed.md amendment → `CLAUDE.md` edit → `npm run sync:constitution`.
4. Lever 2 (frontmatter flags).
5. `npm run manifest:refresh` — **last**, after every content edit.

## Verification

```bash
node .claude/skills/audit-baseline/audit.mjs        # exit 0; size-cap row must report ≤28000/40000
npm test                                             # full suite, incl. document-routing-gate + hook tests
node .claude/hooks/memory_session_start.mjs <<< '{"session_id":"x","cwd":"'$PWD'"}' | wc -c   # expect ≲4000
git status                                           # confirm the four skill dirs are the only deletions
```

Then the real measurement: `/clear`, then `/context`. Compare against today's 45.1k baseline.

Per-lever expected reading:

| After | Warm total |
|---|---:|
| today | 45.1k |
| + Lever 1 | ~44.5k |
| + Lever 2 | ~41.6k |
| + Lever 4 | ~40.5k |
| + Lever 3 | **~36.0k** |

The gap between ~36k and my headline ~34k is honest slack: the per-Article relocation estimates are derived from character counts, and `CLAUDE.md` tokenizes at 2.53 chars/token because of its backtick-heavy tables. Treat ~36k as the commitment and anything below it as upside.
