# Codebase Scout Report — checker-graduation-fanout

Scope: the bounded maker/checker machinery, the oracle-binding of the four spec-review checkers, the graduation-evidence + gate-evaluator, and the conditional Article II amendment surface.

## Primary touchpoints

### Governance / constitution (the conditional amendment surface)
- `docs/init/seed.md:188-200` — §II.A bounded maker/checker charter. **Clause 6** (line 197, "exactly one maker, one checker. No second maker/checker, no fan-out, waves, or panel") is what the rewrite lifts for oracle-bound checkers. **Clause 7** (line 198, graduation gate a–d) is what this cycle must satisfy. Line 190: "workflow-runtime agents, **not** declared subagents — the baseline still ships exactly one subagent."
- `CLAUDE.md:20-38` — Article II. Line 24 "exactly **one** subagent"; line 26 "A single bounded maker/checker round-trip MAY run on the Workflow runtime under §II.A". Char count **34,996 / 40,000** (5,004 headroom — the rewrite must fit or spill to the annex).
- `.claude/CONSTITUTION.md:19-21, 77-87` — §II.A amendment-history entry (`-c732`, 2026-06-06) + charter narrative/rationale. The annex is where overflow detail and the new amendment-history row go.
- `src/CLAUDE.template.md`, `src/seed.template.md` — byte-equal mirrors. Synced by `scripts/sync-constitution-mirror.mjs` (CLAUDE.md→template = full copy; seed.md→template = splice preserving §16), invoked from `scripts/build-template.sh` Stage 0b.
- `.claude/skills/audit-baseline/audit.mjs:243,258,280` + `expected-baseline.mjs:27` — `EXPECTED_AGENTS = new Set(['swarm-worker'])` and the seed-prose count regex ("one subagent"). **KEY:** see Risks — if fan-out stays on the Workflow runtime (not a new declared subagent), this surface does **not** change.

### The four spec-review checkers (oracle-binding targets)
- `.claude/skills/spec-lint/lint.mjs` — **fully mechanical** (PlantUML `-checkonly`, regex AC/sequence/design-call parsing). Already block-eligible; an oracle today.
- `.claude/skills/spec-shippability-review/check.mjs` + `analyzer.mjs` — **hybrid**: C1 (dev-tree ref) + C3 (unshipped import, manifest lookup) + C2 (helper extension, disk check) are all mechanical/artifact-backed; finding shape `{severity,check,file,line,evidence,message,suggested_fix}`. Writes `.claude/state/spec-shippability/<slug>.json`.
- `.claude/skills/spec-diagram-review/SKILL.md` — **pure-LLM today, no helper .mjs**. But all 5 checks are mechanizable: Container↔Component id set-membership; Component↔dependency-graph membership; graph acyclicity (DFS cycle check); class-field `<<new>>/<<changed>>` ↔ `ALTER` regex; AC↔`title Behavior #N` table scan.
- `.claude/skills/spec-traceability-review/SKILL.md` — **pure-LLM today, no helper .mjs**. Trace resolution (spec AC rows ↔ intake/BRD AC rows, set ops) is mechanizable.

### Reusable implementation patterns (YAGNI — reuse before create)
- `.claude/skills/harness/rightsize-gate.mjs:1-170` — **the template for the mechanical gate-evaluator**: `main(argv, deps={})` subcommand dispatch, single-line JSON stdout, fail-open (always exit 0), additive-only, stdlib-only glob helpers (lines 22-59).
- `.claude/skills/simplify/reverify-guard.mjs:17-44` — fingerprint primitives `hashContent` / `computeFingerprint` / `collectTreeState`; `capture`/`check` subcommands; exit 3 = skip, exit 0 = re-verify (fail-safe). `.claude/skills/tdd/drift-reverify-guard.mjs` imports these (2nd use → import, not copy).
- `.claude/skills/spec-shippability-review/analyzer.mjs:138-188` — the canonical finding shape to reuse for blocking/advisory ranking.
- Tests: `tests/rightsize-gate.test.mjs`, `tests/drift-reverify-guard.test.mjs` — `node:test` + `node:assert/strict`, direct `await import()`, dependency injection, `mkdtempSync`/`rmSync` temp state.

## Entry points that reach this code
- `/spec` (and the harness loop) → spec-review band. Only `spec-shippability-review` is a workflow node today; `spec-lint`/`spec-diagram-review`/`spec-traceability-review` are ad-hoc user-invoked (see `.claude/workflows.jsonl` intake-full/spec-entry node DAGs).
- `.claude/skills/harness/SKILL.md` loop-body Step 2 — the **existing parallel-cluster path** (`can_parallel: true` siblings with identical `blockedBy` → one cluster, dispatched via Task tool). Currently every node is `can_parallel: false`. This is the harness seam the fan-out would light up.
- `scripts/build-template.sh` — Stage 0b (mirror autosync), Stage 3 (`build-manifest.mjs` → `obj/template/.claude/manifest.json`), Stage 4 (audit). Rebuild command after shipped-file edits: `bash scripts/build-template.sh`.

## Existing tests
- `tests/rightsize-gate.test.mjs`, `tests/drift-reverify-guard.test.mjs`, `tests/rightsize-gate.test.mjs` — pattern templates for the new evaluator/ledger tests. Passing.
- `tests/governance-no-python3-runtime.test.mjs` — governance test pattern (asserts a property over shipped files); model for an "Article II rewrite only present when gate passed" governance test.
- No existing tests for spec-diagram-review / spec-traceability-review (no helpers to test).

## Constraints and co-changes
- **seed.md → CLAUDE.md → mirrors → annex → audit** must move in lockstep for any Article II edit (Article I.4). Run `node scripts/sync-constitution-mirror.mjs --write` then `bash scripts/build-template.sh` then audit.
- **Editing any shipped baseline-owned file** (`.claude/skills/**`, `seed.md`, `CLAUDE.md`, new hooks) forces a `build-manifest.mjs` rebuild + re-audit — the recurring self-dev rebuild tax (landmine below).
- New helpers must be `.mjs`/`.js` or `.sh` (no new Python in shipped skills — `spec-shippability-review` C2 + `tests/governance-no-python3-runtime.test.mjs` enforce).
- Evidence ledger + gate state → `.claude/state/<slug>/` (gitignored), per the `.claude/state/drift|simplify|tdd|spec-shippability/` convention.

## Patterns in use here
Mechanical helpers are stdlib-only ESM with `main(argv, deps={})`, dependency-injected for tests, fail-open or fail-safe by construction, emitting single-line JSON. Findings are structured records, never prose. Oracle discipline (§II.A + `-d186`): a finding may BLOCK only if backed by a concrete mechanical artifact (parse result, grep hit, manifest key, cycle-check, exit code); bare LLM assertion is advisory→backlog and can never block.

## Risks / landmines
- **MEMORY DISCREPANCY (re-verify before citing, Article IX.2):** the velocity backlog narrative states the mutation oracle `-f029` "shipped (6c85282), advisory-only." Scout found **no mutation-oracle implementation on disk** — only a `.gitignore` reservation (`.claude/state/mutation/`, `.stryker-tmp/`) and an annex mention. **§II.A is charter-only; no live maker/checker exists.** So this cycle builds the FIRST bounded maker/checker implementation, not an extension. `/research` must reconcile this before the spec relies on prior art. **Flag for memory correction at /memory-flush.**
- **Circularity trap (the load-bearing correctness risk):** to make the two LLM reviews block-eligible (so the ≥3 governed round-trips have *mechanically-grounded* blocking findings), their checks must be **mechanized into artifact-producing helpers** first. A checker re-reading another LLM's prose review is exactly the "two LLMs agree on a hallucination" failure clause 7 exists to prevent. The genuine work is: mechanize diagram-review + traceability-review checks → oracle-bind all four → THEN the bounded round-trip + fan-out.
- **Amendment-surface minimization:** if the fan-out runs on the **Workflow runtime** (workflow-runtime agents, per §II.A line 190), it adds **no declared subagent** → `EXPECTED_AGENTS`, the seed count-prose, and `.claude/agents/` stay unchanged. The amendment is then *only* seed.md §II.A clause 6/7 text + CLAUDE.md §II.A reference + mirrors + annex. Choosing a new declared subagent instead would balloon the audit surface. `/research` should weigh this.
- **CLAUDE.md char budget:** 5,004 headroom; the Article II rewrite prose must fit or spill detail to `.claude/CONSTITUTION.md`.
- **Rebuild tax** (DATA POINT 7 in velocity backlog): expect the manifest-rebuild + re-verify loop to inflate whichever phase the shipped-file edits land in.
