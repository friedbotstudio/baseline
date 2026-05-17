# Codebase Scout Report — backlog-memory-bucket

## Primary touchpoints

- `.claude/hooks/memory_stop.sh:1` — the Stop-event hook that extracts candidates. Walks the transcript JSONL for `tool_use` blocks only (Edit/Write/MultiEdit → landmark candidates; `context7` → library candidates). Lines 70–101 are the transcript walk; lines 104–146 build candidate bodies; lines 152–162 append the session-tagged block to `_pending.md`. **Extension point**: lines 76–101 currently iterate `block.get('type') == 'tool_use'` only. Adding intent extraction means iterating `block.get('type') == 'text'` for both user and assistant roles, applying anchored intent regexes, and emitting `## CANDIDATE: backlog → <key>` entries with verbatim text.

- `.claude/hooks/lib/resume_writer.py:72–88` — `_extract_text_blocks(content)` helper that already does exactly what intent extraction needs: walks a message's `content` for `type == "text"` blocks and returns trimmed text strings. **Reuse opportunity**: the intent-extraction logic should mirror this shape (and the noise filters at lines 110–114 — `<system-reminder>`, `<command-name>`, `<local-command-`) to avoid hook-injected text producing false positives.

- `.claude/memory/_pending.md` — the candidate body. Existing block format is `## CANDIDATE: <key> → <target-file>.md` + bullets. **Backlog candidates** will use `## CANDIDATE: backlog → <short slug derived from intent>` with body bullets: `- Intent: <verbatim>`, `- Source: <user|assistant> at <ISO>`, `- Context: <slug if active workflow else "(no active workflow)">`. The file's frontmatter + header is committed; the body below the `---` separator is gitignored — same handling as today.

- `.claude/memory/README.md` — the schema docs. Updates required: (a) Files table at lines 7–16 — add a row for `backlog.md`; (b) stable-key table at lines 56–63 — add `backlog.md` → `short slug` (or `intent-hash`); (c) prose narrative at lines 18–35 (source provenance) — clarify which `source:` value backlog entries carry (likely `user-instruction` for user-derived, new value for assistant-derived); (d) closure-fields table at lines 78–81 — decide whether backlog uses `superseded-at:` (no-longer-relevant) and/or adds new transitions like `picked-up-at:`, `dropped-at:`.

- `.claude/memory/` (six canonical files) — `landmarks.md` (path:line keys) and `pending-questions.md` (Q-NNN keys) are the closest analogues. `pending-questions.md` is the closest by *semantics* — both hold open-state items awaiting future action. The new `backlog.md` should mirror its frontmatter shape (`size-cap: 500`, `key: short slug or auto-numbered ID`, `verifies-against: none`).

- `.claude/skills/memory-flush/SKILL.md` — Step 2 (Decide per candidate) currently routes promotions to one of the six canonical files. **Extension**: add `backlog.md` as a valid promotion target. Step 4 (Write canonical entries) writes the canonical entry shape — backlog entries need the same shape plus `status: open|picked-up|dropped`, `raised-on:`, `raised-in-context:`. The skill SOP is prose, not code — the new bucket lands as documentation + an additional acceptable target file.

- `.claude/skills/memory-flush/sweep.py:27–34` — `CANONICAL_FILES = ['landmarks', 'libraries', 'decisions', 'landmines', 'conventions', 'pending-questions']`. **Add `'backlog'`.** The `closure_field_for(name)` function at line 144 returns `'resolved-at'` for `pending-questions`, `'superseded-at'` for the others. Decision needed: which does backlog use? Per intake AC schema, status transitions are `open|picked-up|dropped` — none of these map to either closure field directly. Spec must decide whether to (i) add a third closure register, (ii) reuse `superseded-at` for dropped, or (iii) treat backlog as decay-exempt entirely.

- `.claude/hooks/memory_session_start.sh:57` — `canonical = ['landmarks', 'libraries', 'decisions', 'landmines', 'conventions', 'pending-questions']`. **Add `'backlog'`.** This drives the index table in the SessionStart hook output. Line 99 (`closure_field = 'resolved-at' if name == PENDING_FILE else 'superseded-at'`) needs the same backlog-closure decision applied.

- `.claude/skills/audit-baseline/audit.sh:70–79` — `EXPECTED_MEMORY_FILES = {"landmarks", "libraries", "decisions", "landmines", "conventions", "pending-questions", "_pending", "_resume"}`. **Add `"backlog"`.** AC-8 of the intake hangs on this. The audit also enforces each canonical file has frontmatter + at least one entry (line 318), so the seeded `backlog.md` needs at least one example entry (or a placeholder bootstrap entry).

- `src/memory/` — pristine template directory mirroring `.claude/memory/`. Currently contains 8 `*.template.md` files (`landmarks`, `libraries`, `decisions`, `landmines`, `conventions`, `pending-questions`, `_pending`, `_resume`). **Add `backlog.template.md`.** The audit at `audit.sh:451–473` enforces `EXPECTED_MEMORY_FILES - {"_pending", "_resume"}` have matching `<name>.template.md` files with frontmatter and **zero entries** (must be pristine for ship). So `src/memory/backlog.template.md` ships with frontmatter only — no example entries.

## Rendered surfaces

- `site-src/memory.njk:29` — prose "Six canonical files hold long-term project knowledge" → must become "Seven canonical files" (or restructure the sentence).

- `site-src/memory.njk:34–39` — the canonical-file table currently lists 6 rows; **add a row for `backlog.md`** with a one-line "Future-intent items captured automatically; reviewed via /memory-flush" purpose blurb.

- `site-src/memory.njk:124` — figcaption "promotes keepers to the six canonical files" → "seven canonical files" (or restructure).

- `site-src/memory.njk:174` — code-block snippets reference `landmarks.md` and similar canonical files; check whether the snippets need a `backlog.md` example added for completeness (review-time judgment).

- `README.md` — verbal mentions of "six canonical files" if any. The cross-doc count classifier in `audit.sh` (lines 645+) sweeps `CLAUDE.md`, `README.md`, and `docs/init/seed.md` for headline-form count claims and FAILs on stale headlines — check whether "six canonical" appears anywhere as a headline. Search returned no `canonical` hits in README — likely safe.

- `docs/init/seed.md:114` — code-block illustration `# project memory: 6 canonical files + _pending.md (gitignored body) + README.md`. **Update to `7 canonical files`.**

- `docs/init/seed.md:165` — `memory_stop` hook description: "extracts memory candidates (touched source paths → landmarks; context7 queries → libraries)". **Extend** to mention intent-text extraction → backlog candidates.

## Entry points that reach this code

- **`memory_stop.sh`** — fires on every `Stop` hook event (end of assistant turn). Wired in `.claude/settings.json` Stop hook chain. Configuration-driven; no `/triggers`.

- **`/memory-flush`** — user-invokable slash command + auto-invoked as workflow Phase 10.6 (between `/archive` and `/grant-commit`).

- **`memory_session_start.sh`** — fires on every SessionStart event; injects the memory index into Claude's startup additionalContext.

- **`audit-baseline`** — invoked manually by user (`bash .claude/skills/audit-baseline/audit.sh`) and by `project.json → test.cmd` (the binding verify verdict). Runs in CI eventually.

## Existing tests

- `.claude/skills/memory-flush/tests/run.sh` — fixture-based integration tests for `sweep.py`. Covers AC-001 (auto-close), AC-002 (prose-scan), AC-004 (stale-sweep), AC-006 (regression traps). **No existing tests for `memory_stop.sh`** — extraction logic has been runtime-validated only. New test fixtures will need to live alongside this file (e.g., `tests/intent_extraction.sh` or extend `run.sh`).

- `.claude/hooks/tests/memory_session_start_test.sh` — integration tests for the SessionStart hook. **Will fail** the moment we add `backlog.md` because the AC-008 byte-equality reference fixture at `.claude/hooks/tests/fixtures/ac008_byte_equal_reference.txt` was captured pre-change. The fixture needs re-capture as part of the implementation.

- `bash .claude/skills/audit-baseline/audit.sh` — the binding `test.cmd`. **Will fail** until: (a) `backlog.md` is added to `EXPECTED_MEMORY_FILES`, (b) `src/memory/backlog.template.md` exists with pristine frontmatter, (c) `backlog.md` has at least one entry (audit requires `entry_count > 0`).

## Constraints and co-changes

- **`baseline-skill-edit-needs-manifest-rebuild` landmine** (`landmines.md`). Editing `.claude/skills/memory-flush/SKILL.md` or `.claude/skills/memory-flush/sweep.py` (both baseline-owned per `manifest.owners.skills`) makes the on-disk content diverge from `obj/template/manifest.json`. The audit will FAIL with `hash mismatch at <path>` until manifest rebuild via `scripts/build-template.sh` (with the documented inline workaround for the chicken-and-egg). The simplify or integrate phase will likely trip this; budget for the rebuild step.

- **`hooks-edit-cascade` landmine** (`landmines.md`). We are NOT touching `lib/common.sh` — the extension lives entirely in `memory_stop.sh`. No cascade risk.

- **`scout-coverage-on-governance-and-hook-changes` convention** (`conventions.md`). This is a hook change → scout SHALL enumerate `site-src/**` and `README.md`. The Rendered surfaces section above is the structural compliance with this convention.

- **`hook-script-shape` convention** (`conventions.md`). Every `.sh` hook sources `lib/common.sh`, calls `read_payload` first, JSON parsing exclusively via `python3` heredoc — no `jq`. The current `memory_stop.sh` already follows this; the intent-extraction extension must stay inside the same `python3` heredoc (lines 31–164) rather than spawning a separate process.

- **Source provenance contract** (`memory/README.md → Source provenance`). Backlog entries derived from user prompts MUST carry `source: user-instruction` plus a `verbatim:` blockquote. Per AC-002 of the intake, assistant-derived backlog entries need a different `source:` value — extending the enum is a schema change that affects every consumer. Decide in spec.

- **`size-cap: 500` per canonical file** (`memory/README.md → Bounding rules`). Backlog has obvious accumulation risk over time. The bounding rule applies — entries pruned via `last-touched` ordering when the cap is hit. The closure-field decision interacts with this (closed entries are decay-exempt per AC-005 but presumably size-cap-counted unless we add a special pruning path).

- **PlantUML diagram requirement for spec** (`project.json → artifacts.required_diagrams.spec`). The spec needs at least one diagram. A sequence diagram showing transcript event → intent regex → candidate write is the natural fit.

## Patterns in use here

- **Single-Python-heredoc per hook.** `memory_stop.sh` runs ONE python3 heredoc that does everything: read transcript, classify events, build candidate body, append. Don't fragment into multiple subprocesses. The intent extraction must add a third extraction pass inside the same loop.

- **Stable-key dedup at append time.** `memory_stop.sh:41` reads existing `## CANDIDATE: <key>` headings and skips re-emitting duplicates within the session. Backlog candidates should follow the same pattern — derive a stable key from the intent text (e.g., a slug or short hash) and skip if already present.

- **ISO-date timestamps.** Every candidate carries `Source: <event> at <ISO>`. Use the same `datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%MZ')` format.

- **Session-tagged blocks.** Each turn-end's candidates are prefixed with `<!-- session <ISO> -->` so the curator can see grouping. New backlog candidates land in the same session block — no separate section needed.

- **Closure-field per file** (`sweep.py:143`). Each canonical file has one closure register (`resolved-at` for pending-questions, `superseded-at` for the rest). Backlog needs an explicit decision; adding a third register is a schema change but also adds the status-tracking dimension the intake calls for.

- **Pristine src/ templates ship with frontmatter only.** Per `audit.sh:451–473`, every `<name>.template.md` in `src/memory/` must have frontmatter and zero `##` entries. `src/memory/backlog.template.md` ships that way. The live `.claude/memory/backlog.md` gets seeded with at least one bootstrap entry to satisfy the audit's `entry_count > 0` rule.

## Risks / landmines

- **AC-008 byte-equality fixture drift.** `memory_session_start_test.sh` compares against `fixtures/ac008_byte_equal_reference.txt`. Adding `backlog.md` to the canonical list bumps the entry-count display in the index table → fixture mismatch. **Plan**: re-capture the fixture as part of implementation, document the re-capture step in the spec's verification section.

- **Manifest hash rebuild after memory-flush edits.** Both `memory-flush/SKILL.md` and `memory-flush/sweep.py` are baseline-owned skill files. Edits trigger the manifest-rebuild chicken-and-egg landmine. **Plan**: budget for the rebuild step in `/simplify` or `/integrate`.

- **Cross-doc count-claim sweeps.** `audit.sh:645+` sweeps `CLAUDE.md` / `README.md` / `seed.md` for headline-form numeric claims (`<n> canonical files`, etc.). The phrasing in `site-src/memory.njk:29` ("Six canonical files") is on a rendered surface — the audit does NOT sweep `site-src/**`, so the site copy update is a manual lockstep, not an audit-driven one. **But**: if seed.md or CLAUDE.md mention "six canonical" anywhere, the audit will FAIL after the change. Re-grep at spec time.

- **Schema extension affects existing entries.** Adding a new `source:` value (e.g., `assistant-deferral` for assistant-derived backlog) means the `source:` enum in `README.md` grows, and every entry-validation site needs to accept the new value. Verify no validator hard-codes the existing six values (we know `sweep.py` does not — it's structural, not value-based). Re-scan the codebase at spec time.

- **False-positive sensitivity.** The user explicitly stated: "only obvious future-intent phrasings should match; mid-sentence accidental matches should not." Anchored, line-start regexes (à la `sweep.py`'s R1/R2/R3 prose patterns) are the proven pattern in this codebase — research should converge on an anchored intent-pattern set with the same precision-favoring stance.

- **Q-003 echo.** `pending-questions.md → Q-003` discusses regex-vs-tokenizer for Bash command matching. Our work is text-content extraction, not Bash-syntax extraction, so the tokenizer question doesn't apply — but the precision concern (mid-sentence false positives) is the same family. Note that `sweep.py:38–42` already uses anchored line-start regexes for the same reason; we should mirror that style.

- **No tests for `memory_stop.sh` today.** The intent-extraction logic will be the first tested code path in this hook. Test harness pattern can mirror `memory_session_start_test.sh` — build a synthetic transcript JSONL, invoke the hook, assert on `_pending.md` body changes.
