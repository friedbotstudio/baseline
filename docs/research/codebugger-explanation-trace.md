# Pattern Research — codebugger-explanation-trace

## Prior art (retrieved)

`retrieve.mjs` scanned 225 sources and returned 208 term hits with `structural: 0` and an
empty `structuralUnresolved`. A 208-hit return at scores of 7–9 out of 18 terms is word
overlap, not prior art — governance words like `artifact`, `runtime`, and `track` appear in
nearly every archived spec. Four hits are real, and they change the design.

**`.claude/memory/decisions/durable-diagram-witness-rule-replaces-kind-whitelist-2026-08-06.md`**
(`via: terms`) — **this repo already has a witness rule, and a module that implements it.**
`.claude/skills/workspace/witness.mjs` binds a durable diagram to what falsifies it:

```
anchor-digest — the structural interface hash already in digest.mjs
test          — a named test that must resolve and pass
none          — nothing checks it; permitted, but never citable as evidence
```

`bindingFor(kind, {rootDir})` resolves the binding from
`project.json → memory.architecture_map.witnesses`; `isCitable(witness)` returns true for
`anchor-digest` and `test` only. An unregistered kind binds `none` rather than throwing,
deliberately, so the registry cannot silently become a whitelist again.

**`.claude/memory/decisions/unwitnessed-diagrams-are-the-only-noncitable-ones-2026-08-06.md`**
(`via: terms`) — the companion narrowing. An unwitnessed artifact is **permitted but
non-citable**, and the rationale is stated as the honest middle: excluding it makes the
model "lie by omission", pretending it is checked makes it "lie outright".

This is the intake's proposed rule, already built, already gate-A approved, for a different
artifact class. The delta below is therefore **not** "invent a witness rule" — it is
"does a runtime reading join that taxonomy, or sit beside it".

**`.claude/memory/decisions/context7-outcome-not-tool-mandate.md`** (`via: terms`) — the
outcome-mandate precedent, with its enforcement recipe spelled out: split the audit roster
into `EXPECTED_MCP_SERVERS` (required) and `DEFAULT_MCP_SERVERS` (optional, replaceable),
and prove the split by running the audit with the server removed. It also records the
governance class of such a change: "Class-A amendment (seed §2.5 genesis + Article VI.5),
Low Threat-Value Tier".

**`docs/archive/2026-06-22/spec-rollout-enforceability-review/spec.md`** (`via: terms`) —
the BLOCKER/ADVISORY split on evidence quality: a prerequisite whose `enforced-by` is
missing or dangling is a BLOCKER, one left in free prose is ADVISORY.

Everything below is the genuine delta.

## Library verification (Article VI.5)

Verified against the npm registry and the project's own docs. Nothing here is recalled.

| Fact | Value | Source |
|---|---|---|
| Package | `@debugmcp/mcp-debugger` | registry.npmjs.org/@debugmcp/mcp-debugger/latest |
| Version | `0.23.0` | same |
| License | `MIT` | same |
| `engines` | `{"node":">=22.0.0"}` | same |
| `bin` | `{"mcp-debugger":"dist/cli"}` | same |
| `dependencies` | `{}` — zero runtime deps | same |
| npx form | `{"type":"stdio","command":"npx","args":["@debugmcp/mcp-debugger","stdio"]}` | context7 `/debugmcp/mcp-debugger`, quoting the project's own `CLAUDE.md` |
| Global-install form | `{"command":"mcp-debugger","args":["stdio"]}` | context7, quoting `docs/usage.md` |
| Why `stdio` is positional | "The `stdio` argument is required to prevent console corruption of JSON-RPC protocol." | project README |

**Tool surface** (parameter names as written in the README):

| Tool | Parameters |
|---|---|
| `create_debug_session` | `language`, `name` |
| `set_breakpoint` | `sessionId`, `file`, `line` |
| `start_debugging` | `sessionId`, `scriptPath` |
| `get_stack_trace` | `sessionId` |
| `get_scopes` | `sessionId`, `frameId` |
| `get_variables` | `sessionId`, `scope` |
| `evaluate_expression` | `sessionId`, expression context |
| `get_output` | `sessionId` |
| `list_supported_languages` | none |
| `close_debug_session` | `sessionId` |

Two properties matter for this baseline. `dependencies: {}` matches the baseline's own
zero-runtime-dependency stance. MIT with no login and no paid tier means U6 is satisfied on
the licensing axis before the outcome mandate is even written.

**Unable to verify — the redaction claim.** The project README asserts "Automatic secret
redaction (API keys, tokens masked before reaching the agent)". The only redaction I could
reach in the documentation is in `docs/logging-format-specification.md`, and it describes
the **log** path: variable values truncated to 200 characters, at most 10 variables per
entry, environment-variable values replaced with a count summary, sensitive keys scrubbed
by pattern match. That is log-side scrubbing, not a documented guarantee about the tool
result returned to the agent. Treat the agent-path redaction as **unverified**. Candidate
P below is built on that answer rather than on the marketing line.

---

## Candidate A: extend the existing witness taxonomy

- **Summary**: add a fourth witness kind — a value read from a paused process — to
  `.claude/skills/workspace/witness.mjs`, and reuse `isCitable()` unchanged as the
  predicate that decides whether an Observations row may be cited by a Root cause.
- **API references (current)**: no third-party API. In-repo:
  `.claude/skills/workspace/witness.mjs` `bindingFor:33`, `isCitable:44`; registry read
  from `project.json → memory.architecture_map.witnesses` via
  `workspace/surface.mjs → readProjectConfig`.
- **Fits**: yes, and it is the only candidate that satisfies the constitution's own
  language rule that one word carries one meaning. The scout report found no competing
  definition of "witness" anywhere in the tree. The two 2026-08-06 decisions already
  establish permitted-but-non-citable as the treatment for the unwitnessed tier, which is
  precisely what an unproven hypothesis needs.
- **Tests it enables**: `isCitable` is a pure function — table tests over the four kinds.
  A trace fixture whose Root cause cites a `none` row must be refused; one citing a
  runtime-read row must pass. No mocks, no DB, no internal stubbing.
- **Tradeoffs**: the module currently reads a registry keyed by *diagram kind* and lives
  under `workspace/`, which is the durable-corpus skill. A trace is not a diagram and
  `/codebugger` is not the corpus, so either the registry key generalises beyond diagram
  kinds or the module gains a second entry point. That is a real coupling question, not a
  formality — `readWitnesses` reaches into `memory.architecture_map.witnesses`, a config
  path whose name says architecture map. Extending it makes a corpus module load-bearing
  for a debugging session, and `memory.architecture_map.enabled` gating would then bear on
  whether a root cause is citable, which is wrong.

## Candidate B: a trace-local scanner beside the skill

- **Summary**: ship `.claude/skills/codebugger/evidence.mjs` exporting a single
  `scanClaim`, modelled one-for-one on `.claude/skills/brainstorm/discipline.mjs:36`
  `scanTurn`. It refuses a Root-cause sentence that cites no Observations row. The witness
  *vocabulary* is borrowed from `witness.mjs` — same four names, same citability rule —
  but the module is independent.
- **API references (current)**: none third-party. In-repo pattern:
  `brainstorm/discipline.mjs` (pattern banks as module-level `const` arrays, one exported
  scanner), `brainstorm/brief-writer.mjs:32` (`writeBrief`, the stable-section-order
  writer, the model for `trace-writer.mjs`).
- **Fits**: yes, and it matches the scout report's stated house pattern exactly — "small
  single-purpose ESM modules beside their SKILL.md, each exporting one or two named
  functions". Eight existing tests already exercise this shape for brainstorm, so the test
  layout is copy-and-adapt.
- **Tests it enables**: same table-test shape as `tests/brainstorm-discipline-violation`
  and `tests/discipline-mc-probe`. Pure function, no fixtures beyond strings.
- **Tradeoffs**: two modules will define citability. That is duplication, and duplication
  of a *rule* is worse than duplication of code — the day one is amended and the other is
  not, the baseline says two different things about what counts as evidence. Mitigable by
  importing `isCitable` from `witness.mjs` while keeping the scanner local, which is the
  hybrid the recommendation names.

## Candidate C: no new module — BLOCKER/ADVISORY on the existing review pattern

- **Summary**: write no scanner. Express the rule as a read-only checker in the
  `spec-rollout-enforceability-review` mould: an uncited Root cause is a BLOCKER, a row
  whose only evidence is instrumentation is ADVISORY.
- **API references (current)**: in-repo,
  `docs/archive/2026-06-22/spec-rollout-enforceability-review/spec.md`, and the
  `checker-fanout.mjs` `DEFAULT_CHECKER_REGISTRY` extension point named in
  `harness/SKILL.md`.
- **Fits**: partially. The BLOCKER/ADVISORY vocabulary is right and already understood.
  But the checker fan-out runs at the **spec-review boundary**, after a spec exists — and
  a debug track produces no spec. The checker would have to run somewhere new.
- **Tests it enables**: verdict-shape tests against a trace fixture.
- **Tradeoffs**: it enforces after the fact rather than at the point of writing, so a bad
  Root cause is written first and rejected later. Candidates A and B refuse it at
  composition time, which is cheaper and matches how `discipline.mjs` already works —
  scan the probe *before* emitting it. It also adds a checker to a fan-out that is
  documented as running only on spec tracks.

## Candidate P: where the trace lives, given that agent-path redaction is unverified

This is a separate axis from A/B/C and needs its own decision.

- **P1 — committed, archived like intake and scout.** Simplest, matches every other
  workflow artifact, and `/archive` sweeps it. But an Observations table holds values read
  out of a running program. With agent-path redaction unverified, this commits whatever
  those values were — connection strings, tokens, customer rows — to git history, in a
  baseline that installs into other people's repositories. The blast radius of being wrong
  here is a secret in a permanent history, which is the least reversible failure in this
  whole design.
- **P2 — gitignored working state, promoted summary.** The full trace lives at
  `.claude/state/debug/<slug>.md` (Tier 2 workflow state, gitignored). Only the Signal,
  Reproduction, Root cause, Fix direction, and Proof obligation are promoted into a
  committed `docs/debug/<slug>.md`; the Observations table stays local. Gate A approves the
  committed file. Costs: the reviewable causal chain is split across two files, and a
  reviewer on another machine cannot see the rows the Root cause cites — which weakens the
  one property the whole feature exists to create.
- **P3 — committed, values recorded under a declared shape.** One file, committed, but the
  `Observed` cell records a **typed, bounded rendering** rather than a raw dump: type,
  length, boundary comparison, or an explicit redaction marker — `"undefined"`,
  `"array, length 0"`, `"string, 44 chars, starts 'sk-'"`. The claim a Root cause needs is
  almost always about a type, a boundary, or an absence, not about the literal bytes. The
  session records the rendering; the raw value never leaves the debug session.

## Recommendation

**On the witness rule: Candidate B, importing `isCitable` from Candidate A's module.**
Ship `codebugger/evidence.mjs` beside the skill so the scanner follows the house pattern
and refuses a bad claim at composition time, but import the citability predicate from
`.claude/skills/workspace/witness.mjs` rather than restating it, so one function decides
what counts as evidence for both diagrams and traces. This takes A's single-vocabulary
benefit without making a debugging session depend on `memory.architecture_map.enabled`.

What would flip it: if `isCitable` cannot be imported without dragging in
`readProjectConfig` and the architecture-map config gate, then the coupling costs more
than the duplication saves, and B stands alone with the four witness names duplicated as
constants and a test asserting the two lists agree.

Candidate C is rejected: it enforces after writing rather than at writing, and it attaches
to a fan-out that only runs on tracks with a spec.

**On persistence: Candidate P3.** It keeps the causal chain in one reviewable committed
file — the property §2.5 asks for — while never committing a raw value read out of a
running process. It also happens to be the better *evidence*: "array, length 0" states the
observation the hypothesis turns on, where a raw dump buries it.

What would flip it: a verified guarantee that the agent-path result is redacted. If the
maintainer confirms that from source rather than the README, P1 becomes viable and is
simpler. If the maintainer judges the residual risk unacceptable even under P3, P2 is the
conservative fallback, at the cost of a split review artifact.

## Open questions

These need a human decision before the spec is written.

1. **CLAUDE.md has six characters of headroom — this blocks the planned Article VI.8.**
   Measured: `CLAUDE.md` is 27,994 characters against the 28,000 advisory target pinned at
   `tests/warm-context-diet.test.mjs:25,222`. Separately,
   `tests/warm-context-diet.test.mjs:30,252-257` pins the **Article VI slice** to sha256
   `f0db0f6a…` with the message "Article VI changed — the non-negotiable engineering rules
   ship byte-identical". Adding a VI.8 clause breaks both. Three ways out, and the choice
   is yours:
   - Add VI.8 and compress elsewhere in `CLAUDE.md` to stay under 28,000, updating the
     Article VI hash deliberately.
   - Raise the advisory target. **This contradicts a recorded instruction of yours.**
     `.claude/memory/decisions/claude-md-headroom-target-28000-chars-5a04.md` carries
     `source: user-instruction` and the verbatim *"Cut into binding rules to hit 28,000"*,
     recorded after you declined my recommendation to amend the target to 32,000. Under
     Article IX.6 the verbatim is canonical, so I will not treat this as available without
     you saying so.
   - Put the rule in `seed.md` §2.7 only, leave `CLAUDE.md` untouched, and let the skill
     plus `evidence.mjs` enforce it. Cheapest, and consistent with the §8 size-cap fallback
     the context7 decision already used once — but a rule outside `CLAUDE.md` is not warm
     in session, which is the whole argument for Articles.
2. **Does the witness taxonomy generalise, or fork?** Candidate A's coupling concern is
   real: `witness.mjs → readWitnesses` reads `memory.architecture_map.witnesses`, so a
   naive extension makes root-cause citability depend on whether the architecture map is
   enabled. Confirm the recommendation's import-only hybrid, or accept the fork.
3. **Trace persistence** — confirm P3, or direct P1/P2. This decides whether observed
   program values enter git history in a repository that ships to other people.
4. **Adapter scope for the acceptance evidence.** This tree is Node/ESM, so `js-debug` is
   the only adapter exercisable end to end here. Is one witnessed language plus the
   instrumentation fallback sufficient evidence for slice B, or does acceptance require a
   second adapter?
5. **`autoApprove` is not adopted.** The project's own config examples list
   `autoApprove: ["create_debug_session","set_breakpoint","get_variables"]`. That key is a
   client-side permission grant. The baseline's `.mcp.json` carries no such key on any of
   its four servers, and pre-approving tool calls sits uneasily beside a constitution built
   on typed consent. I have left it out; say if you want it.
