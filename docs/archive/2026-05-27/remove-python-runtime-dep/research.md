# Pattern Research — remove-python-runtime-dep

## Premise

Every API the `.mjs` ports need is in Node's standard library (no third-party deps). The codebase has already adopted Node ESM for 22 hooks plus several skills (`changelog`, `code-browser`, `spec-shippability-review`, `build-manifest`, the CLI under `src/cli/`). The strongest verification is the existing usage; context7 is reserved for third-party APIs the codebase doesn't already exercise, per CLAUDE.md Art. VI.5.

Three candidate axes need a choice:
- **A** — argv parsing: hand-rolled vs `node:util.parseArgs` (R7).
- **B** — test-fixture probes: inline `node -e` vs shared `probe.mjs` (R4).
- **C** — frontmatter/block parsing in `sweep.mjs` and `audit.mjs`: inline vs shared `.claude/skills/lib/memory-block-parser.mjs` (R8).

Plus six Node-API confirmation questions (R1, R2, R3, R5, R6) with one obvious answer each — bundled into "Established Node idioms" below rather than spread across pseudo-candidates.

## Candidate A1: Hand-rolled argv parsing

- **Summary**: Each `.mjs` port parses `process.argv.slice(2)` manually. Pattern in use at `.claude/skills/code-browser/walk.mjs:86`, `discover.mjs:63`, `.claude/skills/spec-shippability-review/scan-shipped-skills.mjs:52`, `check.mjs:39`.
- **API references**: none — pure JS over `process.argv`. Stable since Node 0.x.
- **Fits**: yes — 4 existing in-repo callers. No new dependency.
- **Tests it enables**: standard mocking of `process.argv` via test harness; no surface beyond JS.
- **Tradeoffs**: each port reimplements ~15 lines of flag/value-pair parsing. Easy to drift in edge cases (e.g., `--mode=auto-close` vs `--mode auto-close`; positional-after-flags handling).

## Candidate A2: `node:util.parseArgs` (RECOMMENDED for R7)

- **Summary**: Built-in argparse equivalent. Stable in Node ≥ 18.3 (our floor is 18.17 per `package.json → engines`). In use at `.claude/skills/changelog/changelog.mjs:17`.
- **API references (current)**:
  - `node:util.parseArgs({ args, options, strict, allowPositionals })` — Node ≥ 18.3 stable. Verified via in-repo usage at `changelog.mjs:26-44`.
  - Returns `{ values: { [flag]: value | true }, positionals: string[] }`.
- **Fits**: yes — single in-repo caller today but it's the modern Node-stdlib idiom and the gap between hand-rolled and stdlib disappears for free.
- **Tests it enables**: same as A1.
- **Tradeoffs**: handles `--flag=value`, `--flag value`, `--no-flag` boolean negation, positional separation — features the hand-rolled variants miss. Strict mode throws on unknown flags (helpful, matches Python argparse behavior). One small constraint: `node:util.parseArgs` doesn't support subcommands natively; `sweep.mjs`'s `--mode <name>` is a flag-not-subcommand so this is fine.

## Candidate B1: Inline `node -e '...'` per test-fixture probe site (8 sites)

- **Summary**: Each of the 8 fixture probes today reads `node -e '<inline JS>'` in place of the current `python3 -c '...'`.
- **Fits**: matches what's there today for python (inline-per-call). No new files.
- **Tradeoffs**: 8 places to edit; identical JSON-parse logic in each; if the probe contract evolves (e.g., a new key to extract), 8 edits. Article VI.4's third-use threshold is hit: when ≥3 callers need the same abstraction, factor it out.

## Candidate B2: Shared `.claude/hooks/tests/lib/probe.mjs` helper (RECOMMENDED for R4)

- **Summary**: Single small ESM module exporting `readHookJson()`, `assertField()`, `extractAdditionalContext()` — whatever set the 8 sites collectively need. Each test calls `node .claude/hooks/tests/lib/probe.mjs <verb> [args]` instead of `python3 -c '...'`.
- **API references**: pure Node — `process.stdin`, `JSON.parse`, `process.argv`. No deps.
- **Fits**: yes — 8 callers across `.claude/hooks/tests/` (3) and `.claude/skills/changelog/tests/` (3) and direct parity harnesses (`drift_check_test.sh`, `memory-flush/tests/run.sh`). Article VI.4 third-use threshold passes 8 ways over.
- **Tests it enables**: probe-shape can itself be unit-tested under `.claude/hooks/tests/lib/probe.test.mjs` if needed.
- **Tradeoffs**: one new file; one new shape to learn. Net win: the JSON-parse logic stops being duplicated.

## Candidate C1: Inline frontmatter+block parsers in `sweep.mjs` and `audit.mjs`

- **Summary**: Each port copies the entry-splitting regex + frontmatter parser locally. No shared lib.
- **Fits**: yes — 2 callers, below Art. VI.4's three-call threshold for abstraction.
- **Tradeoffs**: `sweep.py` and `audit.sh`'s Python embed slightly DIFFERENT parsers — sweep does deep block editing (find-by-key, update-field, append-field, delete-block), audit just counts `^##\s+\S` lines and validates frontmatter open/close. Not the same abstraction. Forcing them through a shared lib is YAGNI.

## Candidate C2: Shared `.claude/skills/lib/memory-block-parser.mjs`

- **Summary**: One module with `splitEntries(text)`, `readField(block, name)`, `updateField(block, name, value)`, etc. Used by both `sweep.mjs` and `audit.mjs`.
- **Tradeoffs**: introduces an abstraction at the second use case. Audit only needs *trivial* shape checks; sweep needs the full editing surface. Sharing forces audit to import code it doesn't use OR sharing covers only the trivial subset and sweep still embeds the deep editors locally.

## Recommendation

| Axis | Recommendation | Rationale | Flips if |
|---|---|---|---|
| **R1** — regex `/m` flag | Use `/m` flag for line-anchored `^`/`$`. Use `(?<=...)` lookbehind freely (stable since Node 10). | The Python `re.MULTILINE` ports are a straight 1:1 mapping. JS regex engine handles all sweep.py / audit.sh patterns. | No flip — established. |
| **R2** — synchronous stdin | `readFileSync(0, 'utf8')` then split on `\n`. Matches sweep.py's piped-stdin batch reads (it doesn't actually do per-prompt interactive input — replies are piped through `printf '%s' "$replies" \| python3 "$SWEEP" --mode prose-scan ...`). | Inspection of `memory-flush/tests/run.sh:59` confirms the harness pipes a multi-line `$replies` blob, sweep reads it once via stdin, dispatches replies by file-order iteration. | No flip — established. |
| **R3** — git subprocess | `spawnSync('git', [args], { cwd, encoding: 'utf8' })`. Exit via `r.status ?? (r.error ? 124 : 0)`. stdout/stderr returned as strings. | Pattern in use at `test_runner.mjs:70-76`. Direct Python `subprocess.run(['git', ...], capture_output=True)` analogue. | No flip — established. |
| **R4** — probe shape (Q-IN-02) | **Candidate B2** — shared `.claude/hooks/tests/lib/probe.mjs`. | 8 callers ≫ Art. VI.4 third-use threshold. Inline-per-call would duplicate JSON-parse logic 8 times. | Flips ONLY if the 8 probes turn out to be heterogeneous enough that no shared API emerges. Unlikely — they all parse hook JSON output and extract specific keys. /spec author resolves the API surface (which verbs `probe.mjs` exports) when listing the new file's contract. |
| **R5** — sha256 hashing | `createHash('sha256').update(readFileSync(path)).digest('hex')`. | Pattern in use at `scripts/build-manifest.mjs:62-64`. Byte-identical to Python's `hashlib.sha256(p.read_bytes()).hexdigest()` when both are fed the same `Buffer`/`bytes`. No encoding gotcha — both default to raw-byte input + lowercase-hex output. | No flip — established + verified against manifest hashes already in production. |
| **R6** — java -jar plantuml | `spawnSync('java', ['-jar', plantumlJar, '-tsvg', '-o', outDir, pumlPath], { encoding: 'utf8' })`. Capture `{status, stdout, stderr, error}`; do not inherit parent stdio. | Same shape as R3. plantuml.jar at `.claude/bin/plantuml.jar` is exec'd; stderr captured into `OUT/.render.err` today via shell redirect — the port writes `r.stderr` to that file via `writeFileSync` instead. | No flip — established. |
| **R7** — argparse equivalent | **Candidate A2** — `node:util.parseArgs`. | Built-in, stable on our Node floor (18.17 ≥ 18.3 stable), already used at `changelog.mjs:26`. Cleaner than 4× hand-rolled variants in `code-browser` + `spec-shippability-review`. Hand-rolled wins ONLY if `parseArgs`'s strict-by-default behavior is intolerable (it isn't — sweep.py's argparse is also strict on unknown args). | Flips only if a port needs subcommand semantics (sweep does NOT — `--mode` is a flag with finite enumeration, perfectly fits `parseArgs`'s `options.mode.type = 'string'`). |
| **R8** — shared block parser (Q-NEW) | **Candidate C1** — inline parsers in each port. | Article VI.4: abstract at the third concrete use case, not the second. `sweep.mjs` and `audit.mjs` use overlapping but materially different surfaces (deep edit vs shape check); a shared lib at this point either over-fits audit or under-fits sweep. /memory-flush `sweep` parity test corpus is the contract — keep the parser inline in `sweep.mjs` and let `audit.mjs` keep its 3-line frontmatter regex. If a third caller appears (e.g., a future `memory-validate` skill), then promote to `.claude/skills/lib/memory-block-parser.mjs`. | Flips if a third real caller surfaces during /spec or /tdd. |

## Established Node idioms (confirmation only)

Every API below has at least one in-repo caller already; the `.mjs` ports use the same pattern verbatim:

| Need | Idiom | Established in |
|---|---|---|
| Read file as utf8 string | `readFileSync(path, 'utf8')` | `common.mjs:13`, every hook |
| Read file as Buffer (for hashing) | `readFileSync(path)` | `build-manifest.mjs:63` |
| Write file (atomic-ish) | `writeMarkerAtomic(path, ...lines)` from `common.mjs:158`; for plain writes `writeFileSync(path, body)` | `common.mjs`, every hook that writes |
| Spawn subprocess | `spawnSync(cmd, args, { encoding: 'utf8' })` | `test_runner.mjs:70`, `lint_runner.mjs`, `plantuml_syntax_guard.mjs` |
| Read stdin (async, hook style) | `for await (const chunk of process.stdin) chunks.push(chunk)` | `common.mjs:38-40` |
| Read stdin (sync, batched) | `readFileSync(0, 'utf8')` | proposed for `sweep.mjs` prose-scan mode |
| sha256 hash | `createHash('sha256').update(buf).digest('hex')` | `build-manifest.mjs:64`, `manifest.js`, `upgrade-tiers.js`, `plantuml.js`, `memory_stop.mjs` |
| Parse argv | `parseArgs({ args, options, allowPositionals })` from `node:util` | `changelog.mjs:17` |
| Regex multiline `^/$` | JS `/m` flag | every regex-bearing `.mjs` |
| ISO timestamp | `new Date().toISOString()` | `common.mjs`, multiple hooks |

## Critical ordering risk (carried from Scout #8)

**Surfaced for /spec to bind as an AC**. The `/commit` Step 6 stamp-closure invocation lives at `.claude/skills/commit/SKILL.md:20` and currently reads `python3 .claude/skills/memory-flush/sweep.py --mode stamp-closure ...`. After the port:

1. The string in `commit/SKILL.md:20` must update to `node .claude/skills/memory-flush/sweep.mjs --mode stamp-closure ...`
2. AND `sweep.mjs` must exist and be functional
3. AND the workflow.json under this very workflow declares `source_backlog_keys: ["migrate-bash-python-heredocs-to-javascript-d454"]` — so the closing commit's `/commit` Step 6 INVOKES the new `sweep.mjs` to stamp this workflow's backlog entry

If any of (1), (2), (3) ship in different commits, the commit that lands this workflow either silently fails to close the backlog item OR crashes trying to invoke a `python3 sweep.py` that no longer exists.

**Mitigation contract for /spec**:
- Single component "Phase 6 .py → .mjs ports" SHALL include BOTH `sweep.mjs` creation AND `commit/SKILL.md:20` update in its `write_set`. Treat as atomic.
- Add an AC that exercises the closure path end-to-end: write a fixture workflow.json with `source_backlog_keys`, run the new `sweep.mjs --mode stamp-closure`, assert the entry is stamped + `git commit` (or a mock) succeeds. Verifies the full Step-6 chain post-port before this workflow's own /commit relies on it.

## Open questions

- **Where exactly does `probe.mjs` live?** `.claude/hooks/tests/lib/probe.mjs` (proposed) lives under the hook test tree, but the changelog tests (3 of the 8 callers) live under `.claude/skills/changelog/tests/`. Either:
  - (i) place at `.claude/hooks/tests/lib/probe.mjs`, have changelog tests reference it via relative path `../../../hooks/tests/lib/probe.mjs` — works but cross-cuts skill boundaries.
  - (ii) place at `.claude/skills/lib/probe.mjs` — cross-cuts hook-vs-skill but is the more natural "shared library" location.
  - (iii) place at `.claude/hooks/lib/probe.mjs` (alongside `common.mjs`) — risks confusion with the hooks themselves; mitigate via filename suffix `_test_probe.mjs`. Recommend (ii) — `.claude/skills/lib/probe.mjs`. /spec author resolves.
- **`sweep.mjs` prose-scan mode reply mechanism.** The current Python reads stdin once and dispatches replies in file-iteration order. The `.mjs` port should match that exactly so the parity test corpus (`memory-flush/tests/run.sh:59`) keeps passing without `printf` invocation changes. Verify by inspection that `process.stdin` blocking read in `for await` order matches Python's `sys.stdin.readlines()` order — they do (POSIX file order). No ambiguity expected.
- **Does the port move `sweep.py` and `drift_check.py` to versioned `sweep.mjs.v1` filenames or just overwrite?** Recommend overwrite (delete the .py, write the .mjs) — keeps the parity test diff small and the manifest clean. The .py files are reachable via git history if needed. /spec author resolves.
- **Q-IN-05 (carried open)**: when /swarm-plan routes this work, do mirror-pair edits (`CLAUDE.md` + `src/CLAUDE.template.md`) belong in one component or two? Recommend one (byte-mirror is an invariant of the edit, not a separate task). /swarm-plan resolves at runtime — flagged so /spec writes the component table with the mirror pair colocated.
