# Codebase Scout Report — seed.md §II.A bounded maker/checker amendment

Scope: the constitutional change surface for legalizing a bounded one-maker / one-checker experiment. Source-of-truth precedence: `seed.md` > `CLAUDE.md` > implementation (Art I.4). This is a **documentation/governance** change — no product code, no hooks, no new subagents.

## Primary touchpoints

The "Article II" principle is **not** a single file — it is stated in four mirror files plus the annex. The amendment edits `seed.md` FIRST, then propagates:

- `docs/init/seed.md:173` — `### §4.2 Subagents (1)` — the canonical Article-II-analog in the genesis spec. Body (lines 173–183) states "ships exactly one subagent", the architectural reason (subagents lose conversational context), and the `swarm-worker` table. **This is the primary insertion site** for the bounded-exception clause + graduation gate. **Pre-§16 region → must be byte-identical in `src/seed.template.md` (see parity below).**
- `docs/init/seed.md:47` — `## §2 — Non-negotiable engineering rules` and `:14` (overview paragraph: "forty skills, one subagent... Decisions live in main context") — secondary text that asserts the "one subagent" framing; the amendment must not contradict it.
- `CLAUDE.md:20–36` — `## Article II — Architectural principle`. Opens with the bold invariant "Decisions live in main context. Subagents only execute pre-decided recipes...", the `swarm-worker` paragraph, the five-execution-skills sub-skill table, and the "SHALL NOT route conversational judgment through a subagent" close. **Binding-rules surface — keep the added clause TERSE here (byte budget below); push narrative to the annex + seed.md.**
- `src/CLAUDE.template.md` — **byte-equal mirror of `CLAUDE.md`** (both 38484 bytes). Every `CLAUDE.md` edit applies identically.
- `src/seed.template.md` — second seed mirror (83087 bytes; differs from seed.md only because §16 is a placeholder). The §4.2 edit applies **identically** (pre-§16 region).
- `.claude/CONSTITUTION.md` (annex, 20601 bytes, **no size cap**) — the sanctioned home for the full bounded-exception narrative, graduation-criteria detail, and the maker/checker handshake. Currently contains **no** maker/checker text. Pushing prose here is the primary lever to stay under the CLAUDE.md byte budget.

## Entry points that reach this code

Governance text has no runtime entry point; the "entry points" are the gates and audits that read these files:

- `/approve-spec` (gate A) — the only human ratification step; consent is structural (`spec_approval_guard`).
- `.claude/skills/audit-baseline/audit.mjs` — CI drift check (exit 0/1). Reads all four mirror files + manifest.
- The build (`obj/template/` overlay) — `src/CLAUDE.template.md` overlays into `obj/template/CLAUDE.md`; the **manifest hash is computed from the `src/` pristine**, so a CLAUDE.md ↔ src mismatch FAILs the manifest hash after rebuild (landmine `constitutional-amendment-tripwires`, companion requirement).

## Existing tests (the gating suite)

- `tests/code-browser-primary-navigation.test.mjs:39` — **`CLAUDE_TARGET_MAX = 38500`** (tighter than the 40000 char cap; AC-007, ≥1500 headroom). Current `CLAUDE.md` = **38484 bytes → only 16 bytes of slack.** Also asserts (`:43–45`) every `## Article I`…`## Article XI` heading present, and (`:47`) `REQUIRED_BINDING_MARKERS = ['No stubs','YAGNI','Context7','swarm-worker','approve-spec','grant-commit','§17']` all present. **Any net CLAUDE.md addition busts this** — offset by trimming existing prose, never drop a marker or an Article heading.
- `tests/seed-template-parity.test.mjs` — `docs/init/seed.md` and `src/seed.template.md` must be **byte-identical pre-§16 AND in the §17+ tail**; only §16 diverges (template keeps the `*Reserved.*` placeholder). §16 boundary: seed `:597`, §17 seed `:688` / template `:597`→`:612`. The §4.2 edit (line 173, pre-§16) **must be applied identically to both files.**
- `tests/governance-no-python3-runtime.test.mjs:30` — **python3 line-ledger** `ALLOWED_LINES['docs/init/seed.md'] = {14, 169, 652}`. Inserting N lines at §4.2 (line 173) shifts the line-652 mention (the §16 "Script-based consent gates" backlog bullet) down to **652+N**. The ledger Set must be bumped to `{14, 169, 652+N}` in the same edit (lines 14, 169 are above 173, unaffected). The test comment delegates the ledger to implementers ("must adjust this map together with their edits") — it is data, not an assertion. **Verify** whether `src/seed.template.md` / `CLAUDE.md` / `src/CLAUDE.template.md` ledger entries also shift (template §16 is placeholder, so its 652 bullet does not exist there).
- `.claude/skills/audit-baseline/audit.mjs` checks (read-only, CI): `:103` `EXPECTED_AGENTS = {'swarm-worker'}`; `:225` `agentsClaimed = findCount(/\b(\d+|one|two|...)\s+subagents?\b/i)` matched against disk agent count (= 1); `:240` count check; `:262` names match; `:317` CLAUDE.md must cite `## Article XI` + `manifest`; `:322` seed must cite `## §17` + `manifest`; `:334` `CLAUDE_CHAR_CAP = 40000`.

## Constraints and co-changes (the tripwires, from `landmines.md`)

1. **CLAUDE.md 38500-byte budget (NOT 40000).** 16 bytes of slack. The bounded-exception clause in Article II must be near-zero net bytes — terse binding statement only; full rule to the annex + seed.md; trim verbose existing CLAUDE.md prose to offset if needed.
2. **Two seed parity mirrors.** `CLAUDE.md ↔ src/CLAUDE.template.md` (byte-equal) AND `docs/init/seed.md ↔ src/seed.template.md` (byte-identical pre-§16 + §17 tail). Four files move in lockstep; the §4.2 edit hits all of seed.md + seed.template + (CLAUDE.md + CLAUDE.template if Article II changes).
3. **python3 line-ledger** must be bumped for the seed.md insertion offset.
4. **"One subagent" count is load-bearing.** The maker + checker run on the **dynamic Workflow runtime** — they are NOT `.claude/agents/*.md` subagents. `diskAgents` stays `{swarm-worker}`, count stays 1. The amendment text MUST frame maker/checker as workflow/runtime agents explicitly distinct from "the one subagent", and must NOT introduce a "two subagents" phrase that the audit's `findCount` regex would catch.
5. **Pre-verify before verify-tick** (landmine mitigation): `wc -c CLAUDE.md` (≤38500); `diff -q CLAUDE.md src/CLAUDE.template.md`; `diff <(sed '/## §16/,$d' docs/init/seed.md) <(sed '/## §16/,$d' src/seed.template.md)`; `grep -n '\bpython3\b' docs/init/seed.md` vs ledger. Cheaper than a 7-minute full-suite failure at integrate.

## Patterns in use here

- The constitution uses deliberate em dashes in governance surfaces (Art X.1 scopes the impeccable ban OUT of `CLAUDE.md`/`seed.md`). Match the existing constitutional voice — SHALL/SHALL NOT normative language, numbered articles/sections.
- Narrative-vs-binding split is the established budget lever: `CLAUDE.md` = binding rules only; `.claude/CONSTITUTION.md` annex + `seed.md` = history, narration, full mechanics. Follow it for the maker/checker clause.
- Amendments edit `seed.md` first, then propagate down (Art I.4); never edit `CLAUDE.md` ahead of `seed.md`.

## Risks / landmines

- **Byte budget is the dominant risk** — 16 bytes of CLAUDE.md slack. Plan the CLAUDE.md delta as net-neutral-or-negative from the first draft; do not discover it at integrate.
- **Where the clause lives is an open design question** (intake Open Q3): inline in Article II / §4.2 vs a delimited §II.A sub-article vs annex-only with a one-line CLAUDE.md pointer. The annex-pointer pattern best protects the budget but must still satisfy the "binding clause present in CLAUDE.md" expectation. Resolve in `/research` + `/spec`.
- **Graduation criteria are unspecified** (intake Open Q1) — the text needs concrete, checkable criteria, not "when we decide". `/research` corroborates against external maker/checker + multi-agent-verification practice.
- **`-9360` absorption** must be reflected consistently: any seed.md/annex/backlog reference treating `-9360` as a separate future charter should be reconciled (this amendment IS the charter; graduation points at an unnamed future permanent rewrite). Check `.claude/memory/backlog.md` for the `-9360` and `-c732` keys during `/spec`.
- The audit's `agentsClaimed` regex scans for the FIRST "N subagents" phrase — keep maker/checker prose clear of any numeral+"subagents" collocation.
