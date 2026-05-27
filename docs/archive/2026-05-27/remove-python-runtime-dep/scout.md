# Codebase Scout Report — remove-python-runtime-dep

## Primary touchpoints

### Layer A — skill helper `.py` files (port to `.mjs`)
- `.claude/skills/memory-flush/sweep.py:1` (354 lines) — argparse with 4 modes (`auto-close`, `prose-scan`, `stale-sweep`, `stamp-closure`); reads/writes 7 canonical memory files via flat-text frontmatter+block parsing; computes commit-distance via `git rev-list --count`; uses stdin for interactive prose-scan replies; the only writer to `backlog.md` during closure-stamping.
- `.claude/skills/tdd/drift_check.py:1` (180 lines) — argparse with `--slug` + optional `--spec` + `--diff` overrides; loads spec markdown and git diff; parses ACs (`^## AC-NNN` rows) and Design-calls table rows; scores each against added-lines in the diff (resolved / unresolved / unknown); writes report to `.claude/state/drift/<slug>.md`; exit code is the unresolved count (0 or 1).

### Layer B — in-shell `python3` heredocs (5 wrappers)
Per-wrapper assessment for **Q-IN-01** (collapse to `.mjs` vs keep shell stub). All five wrappers' pre-Python bash is trivial (usage/guard/env-var setup); the verdict is **collapse all five** with one caveat for `render.sh`.

- `.claude/skills/audit-baseline/audit.sh:1-1000` — bash 1-33: `--file=<rel>` scope-file gating (case-match against 8 path patterns; short-circuits with PASS for out-of-scope files so PostToolUse `test_runner` doesn't pay 1.85s per src-tree edit). Lines 35-999: the ~960-line Python audit body. **Collapse to `audit.mjs`** — port the case-match using a JS prefix-match array; the Python is the actual logic.
- `.claude/skills/swarm-plan/validate.sh:1-181` — bash 1-27: usage + plan-exists guard (10 effective lines). Lines 29-181: Python Kahn's-algorithm topological sort + wave assignment + JSON read/write. **Collapse to `validate.mjs`** — pure JSON-manipulation logic.
- `.claude/skills/spec-render/render.sh:1-116` — bash 1-37: usage + spec-exists + `plantuml.jar` exists + `java` on PATH guards + `mkdir`/`rm`. Lines 40-95: 55-line Python that extracts ```plantuml fenced blocks, classifies (c4_context/c4_container/c4_component/sequence/state/class/other), writes `.puml` files + index.md. Lines 97-116: bash post-Python `for puml in $OUT/*.puml; do java -jar plantuml.jar -tsvg ...; done` loop + per-kind summary via `awk`. **Collapse to `render.mjs`** — use Node `child_process.spawnSync('java', ['-jar', plantumlJar, '-tsvg', '-o', outDir, pumlPath])` for the render loop; the awk summary is a one-liner with `fs.readdirSync + groupBy`.
- `.claude/skills/swarm-dispatch/swarm_merge.sh:1-154` — bash 1-51: usage + plan/worktree existence guards (40 effective lines, all guards). Lines 53-154: Python merge audit (read plan JSON, compute `git diff --name-only` against baseline_ref, audit write_set discipline, `git apply` patch, `git worktree remove`). Python itself shells out to `git` via `subprocess.run`. **Collapse to `swarm_merge.mjs`** — `child_process.execFileSync('git', [...])` is the direct Node equivalent of the existing subprocess calls.
- `.claude/skills/spec-lint/lint.sh:1-219` — bash 1-23: usage + spec-exists + `command -v plantuml` guard (10 effective lines). Lines 25-218: 190-line Python with 4 checks (plantuml_syntax, diagram_presence, ac_traceability, design_calls) including glob-to-regex translation. **Collapse to `lint.mjs`** — uses regex + JSON parse + subprocess to plantuml; all natively Node.

### Layer C — test fixtures invoking `python3` (8 files, intake counted 3)
Intake missed 5. Full list of test scripts that invoke `python3` (excluding `state/logs/` which are passive captures):

Hook tests:
- `.claude/hooks/tests/fixtures/regenerate-ac008.sh:26` — `python3 -c '...'` reads hook JSON output and extracts `additionalContext` block.
- `.claude/hooks/tests/memory_session_start_test.sh:44, 233` — two `python3 -c '...'` invocations probing hook output JSON.
- `.claude/hooks/tests/memory_stop_intent_test.sh:64, 75` — two `python3 - <args> <<'PY' ... PY` heredocs for fixture setup / assertion.

Skill tests (intake omitted):
- `.claude/skills/changelog/tests/non-git-shortcircuit_test.sh:67` — `python3 - <args> <<'PY'` to parse triage SKILL.md.
- `.claude/skills/changelog/tests/idempotent-reentry_test.sh:100` — `python3 - <args> <<'PY'` to compare JSON state files.
- `.claude/skills/changelog/tests/golden-path_test.sh:120` — `python3 -c '...'` for state-file assertions.
- `.claude/skills/tdd/tests/drift_check_test.sh:54` — `python3 "$DRIFT" "${args[@]}"` (the parity-test harness for `drift_check.py` — direct invocation, not just probing).
- `.claude/skills/memory-flush/tests/run.sh:59, 467, 497, 582` — four `python3 "$SWEEP"` / `python3 - ... <<'PY'` invocations (the parity-test harness for `sweep.py`).

### Layer D — governance pointers naming `python3` (intake counted 5; actual ~15)

CLAUDE.md / mirrors:
- `CLAUDE.md:288` + `src/CLAUDE.template.md:288` — Appendix A row: `"22 hook scripts (...). Bash + python3, no jq."` (stale: hooks are `.mjs` now).
- `docs/init/seed.md:14` + `src/seed.template.md:14` — preamble: `"twenty-two hook scripts total — all .mjs after the JS port completed; per-hook startup ~5× faster than the original bash + python3 chain."` (historical; OK to keep, but verify with /document).
- `docs/init/seed.md:40-41` + `src/seed.template.md:40-41` — Runtime requirements: line 40 says hooks need no `python3`; line 41 says `"python3 on PATH (skill-only)"`. **Line 41 is the removal target**.
- `docs/init/seed.md:161` + `src/seed.template.md:161` — `process_lifecycle_guard` description mentions matching `python.*http.server`. Advisory-only matcher — see Q-IN-03 below.
- `docs/init/seed.md:170` + `src/seed.template.md:170` — `"No python3 is required at hook runtime"` (true; stays).
- `docs/init/seed.md:589` — `"Language: Node ESM + python3 + markdown"` (stale).
- `docs/init/seed.md:637` — POST-MJS-PORT NOTE prose mentions historical `python3` use (OK historical).
- `docs/init/seed.md:653` — `"language": "Node ESM + python3 + markdown"` in a fenced JSON example (stale).
- `docs/init/seed.md:660` — `"runtime_targets": [...,"python3 >= 3.9 (skill helpers only)", ...]` (stale; removal target).

Memory:
- `.claude/memory/conventions.md:40 → hook-script-shape` — `"JSON parsing exclusively via python3 heredoc — no jq."` Verbatim convention claim about hook code shape. **Removal target** — replace with `.mjs` equivalent.
- `.claude/memory/README.md:98` — describes `/commit` invoking `python3 .claude/skills/memory-flush/sweep.py --mode stamp-closure ...`. **Update to `node …sweep.mjs`**.
- `.claude/memory/landmarks.md` — 17 entries reference `sweep.py` or `drift_check.py` by path (lines 111, 127, 130, 152, 187, 188, 210, 215, 227, 230, 235, 242, 243, 246, 494, 497). Landmark paths must point to the new `.mjs` files post-port; the existing entries also reference `python3` in caveats that need updates.
- `.claude/memory/landmines.md:72` — references `python -m http.server` as an example of dev servers in the lsof-port-kill landmine. Advisory; keep.
- `.claude/memory/backlog.md:19,28` — verbatim user instruction + caveat for `migrate-bash-python-heredocs-to-javascript-d454`. Will be closed by `/commit` Step 6 via `sweep` stamp-closure (the very entry that drives this workflow).

Commands:
- `.claude/commands/init-project.md:31` — preflight: `python3` on `which python3` → **hard fail** with reason "Hooks won't parse JSON". **Update**: remove the python3 row (hooks no longer need python3; skill helpers are now `.mjs`).
- `.claude/commands/init-project.md:132` — instruction: `"Must use bash + python3, no jq, follow §4.1 conventions."` **Update** to `.mjs`.
- `.claude/commands/init-project-doctor.md:16` — same preflight check. **Update**.

SKILL.md SOPs (caller pointers):
- `.claude/skills/memory-flush/SKILL.md:44, 61, 77` — three `python3 .claude/skills/memory-flush/sweep.py --mode <...>` invocation lines (auto-close, prose-scan, stale-sweep). **Update all three**.
- `.claude/skills/commit/SKILL.md:20` — Step 6 invocation: `python3 ...sweep.py --mode stamp-closure ...`. **Update**.
- `.claude/skills/harness/SKILL.md:124` — drift-check-tick: `python3 .claude/skills/tdd/drift_check.py --slug <slug>` (AC-6 anchor from intake). **Update**.
- `.claude/skills/tdd/SKILL.md:80` — drift-check-tick worker description: `python3 .claude/skills/tdd/drift_check.py --slug <slug>`. **Update** (matches harness pointer).

Spec-shippability-review:
- `.claude/skills/spec-shippability-review/SKILL.md:60` — explanatory text listing `python3 ./path/...` as an example of "runtime invocation patterns" the analyzer catches.
- `.claude/skills/spec-shippability-review/analyzer.mjs:24` — regex `/\b(?:node|python3?|bash|sh)\s+...\b/g`. **Keep** — analyzer detects user-shipped dev-tree references; matching `python3` is still useful even if the baseline ships none.

Tests under `tests/`:
- `tests/spec-render-runtime.test.mjs:51` — `NEEDED = [..., 'python3', ...]` asserts runtime environment provides python3. **Update**: remove `'python3'` from `NEEDED` (once render.mjs lands).
- `tests/plantuml-syntax-guard-runtime.test.mjs:50, 55` — comment + `NEEDED` array both reference `python3`. **Update** the array; the comment about pyenv shims can stay or go.
- `tests/shipped-tree-no-dev-refs.test.mjs:38` — regex `/\b(?:node|python3?|bash|sh)\s+.../g` for catching dev-tree refs in shipped tree. **Keep** — same rationale as analyzer.mjs.

Public-docs site (Q-IN-04 finding):
- `site-src/memory.njk:182` — figcaption describing backlog auto-close: `"the commit step invokes <code>sweep.py stamp-closure</code> on the named entries"`. **Update** to `sweep.mjs`.
- `site-src/skills/core.njk:61` — bullet describing `commit` skill Phase 11 stamp-closure: `"the commit step invokes <code>sweep.py stamp-closure</code>"`. **Update**.

CHANGELOG.md:
- `CHANGELOG.md:104` — mentions `.py` in a list of MECHANICAL-tier file extensions in the manifest tier policy. Documentary; **keep** unless the manifest stops tracking `.py` entirely (it will, since none ship — but the policy can stay general).

## Entry points that reach this code

- `/memory-flush` skill SOP at `.claude/skills/memory-flush/SKILL.md:1` — invokes `sweep.py` for 3 of its 4 modes during Phase 10.6.
- `/commit` skill SOP at `.claude/skills/commit/SKILL.md:1` — invokes `sweep.py --mode stamp-closure` after `git commit` succeeds when `workflow.json → source_backlog_keys` is populated.
- `harness_continuation` Stop hook → harness skill drift-check-tick → invokes `drift_check.py`.
- `/tdd` skill body explicitly mentions `drift_check.py` invocation as Task E in its seeded worker chain.
- `/spec-lint` is the user-facing entry point for `lint.sh` (also auto-invoked at the spec preflight gate).
- `/spec-render` is the user-facing entry point for `render.sh`.
- `/swarm-plan` invokes `validate.sh` post-draft.
- `/swarm-dispatch` invokes `swarm_merge.sh` once per task post-worktree-merge.
- `/audit-baseline` is invoked by:
  - `project.json → test.cmd` (PostToolUse `test_runner` on every code edit; pays the `--file=<rel>` short-circuit when out of scope).
  - `/init-project` final step.
  - CI builds.

## Existing tests

Active suites the port must not regress:
- `tests/article-iv-mirror.test.mjs` — Article IV byte-equality between `CLAUDE.md` and `src/CLAUDE.template.md` (section-bounded, not whole-file). The CLAUDE.md:288 / src/CLAUDE.template.md:288 row is in Appendix A, **outside Article IV**; this test will NOT catch drift there. (Risk surface — flag for /spec.)
- `tests/build-template-mirror-sync.test.mjs` — structural check that `scripts/build-template.sh` Stage 0b syncs the five canonical `src/cli/*.js → .claude/skills/triage/*.js` and `src/cli/workflow-migrator.js → .claude/skills/harness/workflow-migrator.js` pairs.
- `tests/byte-equivalent-migration.test.mjs` — workflows.jsonl ↔ workflow-template byte-equivalence post-§18.
- `tests/vendored-mirror-bytes.test.mjs` — vendored-skill mirror bytes (impeccable / humanizer / etc.).
- `tests/audit-baseline-post-amendment.test.mjs` — runs `audit.sh` against the live tree; PASS required.
- `tests/build-audit-gate.test.mjs` / `tests/build-shipped-skills-gate.test.mjs` — build-time gates verifying `obj/template/` is sane.
- `tests/manifest.test.mjs` — `obj/template/.claude/manifest.json` shape.
- `tests/plantuml-syntax-guard-runtime.test.mjs` — runtime-deps probe (asserts `python3` in NEEDED today).
- `tests/spec-render-runtime.test.mjs` — runtime-deps probe (asserts `python3` in NEEDED today).
- `tests/shipped-tree-no-dev-refs.test.mjs` — shipped-tree analyzer pass (the `python3?` regex stays).

Parity-test harnesses that ARE the canonical behavioral spec for the `.py` files:
- `.claude/skills/memory-flush/tests/run.sh` — 4 `python3 "$SWEEP"` invocations covering every mode + edge cases (lines 59, 467, 497, 582). This SUITE is the parity contract: the new `sweep.mjs` must produce identical JSON-report output and identical file mutations on each fixture.
- `.claude/skills/tdd/tests/drift_check_test.sh` — 4 scenarios (all-resolved, one-unresolved, no-spec, no-design-calls) at line 54. Same parity-test role for `drift_check.mjs`.

No dedicated full-file byte-mirror test exists for `CLAUDE.md ↔ src/CLAUDE.template.md` or `docs/init/seed.md ↔ src/seed.template.md`. Audit.sh has *shape* checks for the src/ templates but not byte-equality. **Risk** — surfaced for /spec.

## Constraints and co-changes

- **`audit.sh` helper-list assertion** (`audit.sh:533-550`) — checks that 6 specific `.sh` files exist + are executable: `swarm-plan/validate.sh`, `swarm-dispatch/swarm_merge.sh`, `spec-render/render.sh`, `spec-lint/lint.sh`, `archive/archive.sh`, `audit-baseline/audit.sh`. **Collapse implies updating this list to expect `.mjs` equivalents** (and keeping `archive.sh` if `/archive` doesn't ship a python heredoc — it doesn't). When porting `audit.sh` to `audit.mjs`, the list lives inside the new file too; the audit must self-reference its new extension.
- **`audit.sh:169` glob discovery** — `disk_hooks = ({p.stem for p in hooks_dir.glob("*.sh")} | {p.stem for p in hooks_dir.glob("*.mjs")})`. Already supports both extensions; the port to `audit.mjs` keeps the same dual-glob.
- **`audit.sh:480, 563-564, 692-696, 480` settings.json wiring** — `f"{h}.sh" in s_text or f"{h}.mjs" in s_text`. Same dual-form check; OK.
- **Manifest** — `obj/template/.claude/manifest.json` is regenerated by `scripts/build-manifest.mjs`. After the port, no `.py` files appear in `manifest.files`; new `.mjs` files are added; their sha256s flow into `audit.sh`'s baseline-skill hash-drift check (lines 263-307). The manifest tier policy at `CHANGELOG.md:104` lists `.py` as MECHANICAL — the entry can stay (general policy) or be removed (no `.py` shipped). Either is correct.
- **`process_lifecycle_guard.mjs`** has **zero** references to `python` in source (verified via grep). The `python.*http.server` mention in `seed.md:161` is a documentary description of what the matcher catches, not a binding constraint on hook code. **Q-IN-03 resolution**: the description should stay (python http.server is a dev-server users may still run; the advisory matcher caught it then and would catch it now if the user types `python3 -m http.server`). Action: no code change, no governance change; document this finding in /spec so the entry survives /document untouched.
- **Article IV mirror test** does NOT cover Appendix A. CLAUDE.md:288 + src/CLAUDE.template.md:288 must be edited in lockstep manually; the port lacks a structural safety net for this row.
- **The two `.py` files use Python-specific features** that need Node equivalents:
  - `sweep.py` — argparse with subcommand semantics (→ Node `minimist` or hand-rolled, no dependency needed); `pathlib.Path` (→ `node:path` + `node:fs`); regex with `re.MULTILINE` (→ JS `/m` flag); subprocess invocation of `git rev-list` (→ `child_process.execFileSync`); stdin reads (→ `node:readline` or `process.stdin`).
  - `drift_check.py` — same set: argparse, pathlib, regex, no subprocess; pure file/string processing. Smaller surface than sweep.
- **Caller invocation forms** vary: some pass `--memory-dir <abs>`; some pass `--slug <kebab>`; the changelog-test scripts pass keys positionally. All five .sh wrappers AND the 8 test fixtures need invocation-form updates in lockstep with the `.py → .mjs` rename. **Risk**: a missed caller will silently break at runtime; mitigation is a final grep `python3` sweep in /integrate.

## Patterns in use here

The existing `.mjs` hook port (commit `9b54561`) establishes the pattern:
- Hook ESM files at `.claude/hooks/<name>.mjs` import shared utilities from `.claude/hooks/lib/common.mjs` (payload reading, decision emitters, project-config access, path canonicalization).
- Node ESM throughout (no CommonJS). Top-of-file `import` statements only.
- No external dependencies — `node:fs`, `node:path`, `node:child_process`, `node:crypto`, `node:readline`.
- argparse-equivalent: hand-rolled `process.argv.slice(2)` parsing with explicit flag handling (no `yargs` / `commander`).
- Same exit code semantics (0/1/2 mapping preserved across the port).
- File reads: `readFileSync(path, 'utf8')` for small files; streams unused (the existing files are small).

For the skill helper ports, the analogous pattern is:
- New files at `.claude/skills/<slug>/<name>.mjs`, ESM, no deps beyond `node:*`.
- A small `.claude/skills/lib/` directory (optional) for shared helpers across multiple ported skills — only if a clear three-use-case threshold is hit per CLAUDE.md Art. VI.4. Likely candidates: shared `splitEntries` / `readField` / frontmatter parser used by both `sweep.mjs` and the audit's memory-shape checks.
- Shebang `#!/usr/bin/env node` at top of every executable `.mjs`; `chmod +x` on install (the existing audit-baseline helper-presence check already requires executable).
- Stdin reading via `process.stdin` (synchronous via `node:fs.readFileSync(0, 'utf8')` for the interactive prose-scan flow; or `node:readline` if line-by-line).

## Risks / landmines

1. **Parity-test harness recursion**. The current `sweep.py` parity tests live at `.claude/skills/memory-flush/tests/run.sh` and invoke `python3 "$SWEEP"`. After the port, the test harness ITSELF must change to invoke `node "$SWEEP"`. If we port `sweep.py → sweep.mjs` first and the test harness still calls python3, every test fails RED with `python3: cannot execute`. Order matters: port the harness alongside the helper. Same for `drift_check_test.sh`.
2. **8 test fixtures probing JSON output** — these are not parity tests; they're *probes* of hook output / state files for assertions. **Q-IN-02 decision is live**: option (a) `node -e '...'` inlined per call or (b) shared `.claude/hooks/tests/lib/probe.mjs`. With 5 probe sites in hook tests + 3 in changelog tests = 8 call sites, option (b) hits the third-use-case threshold trivially. **Recommend (b)** in /research and /spec.
3. **Article IV mirror test does NOT catch Appendix A drift** between CLAUDE.md and src/CLAUDE.template.md. The port edits both files at line 288 — easy to fix one and forget the other. **Mitigation**: /spec lists both edits as a single component with a paired write_set; /integrate runs a literal `diff` between the relevant lines.
4. **`audit.sh:480, 563-564, 480` already does `*.sh OR *.mjs` discovery**, but the helper-list at `audit.sh:533-550` hardcodes `.sh` paths. Easy miss; same risk as #3.
5. **Settings.json hook wiring** is already dual-extension safe; no co-change needed there.
6. **`docs/init/seed.md:637`** ("POST-MJS-PORT NOTE (2026-05-27)") is a multi-paragraph wall of historical narrative referencing `python3` repeatedly. The narrative is CORRECT history — the .mjs port already happened. The port we're now doing is the SKILL-HELPER follow-on. /document should add a "POST-PYTHON-REMOVAL NOTE (2026-05-XX)" paragraph alongside, NOT edit the existing narrative.
7. **`.claude/memory/landmarks.md`** has 17 entries pointing to `.py` paths. These are landmark records — by the memory contract (Article IX) they SHALL be re-verified before citing. Plan: `/memory-flush` Phase 10.6 will sweep these on the next /memory-flush after the port lands; explicit re-verification is part of the workflow. /spec records the expected mass-edit.
8. **Backlog item closure** — `migrate-bash-python-heredocs-to-javascript-d454` is in `workflow.json → source_backlog_keys`, so `/commit` Step 6 stamps it `picked-up` + `superseded-at: <today>`. The stamp invocation in `commit/SKILL.md:20` references **`python3 sweep.py`** — meaning the stamp itself would fail at the closing moment if `sweep.py` is gone. **CRITICAL ORDERING**: the `sweep.mjs` port + the `commit/SKILL.md` Step 6 update must both land in the SAME commit as the rest of the migration, OR (cleaner) the port happens, `commit/SKILL.md` updates to invoke `node sweep.mjs`, and then this very commit invokes `node sweep.mjs --mode stamp-closure` to close the backlog. Test this end-to-end in /tdd Phase 6.
9. **`process_lifecycle_guard.mjs` has zero python source references** — its description in seed.md says it matches `python.*http.server` but the actual .mjs hook contains no `python` literal at all (verified via grep). Either the description is aspirational (the matcher doesn't actually fire on python) OR the matcher uses a different regex that includes "python" via case-insensitive shell-pattern matching. **/research action**: re-read `process_lifecycle_guard.mjs` in full and confirm. If the description is wrong, /document fixes the seed.md description; not a code-change.
10. **CLI / README surfaces returned no hits** for python3 in the grep above — `bin/cli.js`, `README.md` clean. Good news; no /document late-discovery there. (Q-IN-04 partial answer: only site-src/ has user-facing copy that needs updating.)
