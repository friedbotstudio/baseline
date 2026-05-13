---
name: research
owner: baseline
description: Workflow Phase 3 — Research and Solution Exploration. Surfaces 2–4 candidate solution approaches with concrete tradeoffs, grounded in current library docs via context7 MCP — never in training-data recall. Output lives at `docs/research/<slug>.md`. Executes in main context.
---

You are surfacing a small set of candidate approaches to a task, with honest tradeoffs, so the spec author can pick one. Decisions are not made here — the human reviewer decides at `/spec`. Your job is to lay out the option space.

# Prereqs

- `scout` in `completed` OR in `exceptions`.

# Inputs

- The intake at `docs/intake/<slug>.md` — **Constraints** and **Acceptance criteria** sections filter which approaches are viable.
- The scout report at `docs/scout/<slug>.md` — patterns in use, touchpoints, landmines.
- The BRD at `docs/brd/<slug>.md` if present — NFR-### requirements (latency, compliance, etc.).
- The existing tech stack — read `package.json`, `pyproject.toml`, `go.mod`, lockfiles.

# Mandatory: context7 MCP for library APIs

For any library you intend to cite:

1. `mcp__plugin_context7_context7__resolve-library-id`
2. `mcp__plugin_context7_context7__query-docs`

**Never cite an API from memory.** Record the version present in the lockfile and confirm the docs match that major version. If context7 has no coverage, fall back to `WebFetch` against the library's official docs and note that.

# Method

1. **Identify libraries and frameworks** the solution would likely touch.
2. **Verify each library API** via context7 (above).
3. **For each candidate**, evaluate against:
   - Fit with existing patterns (per scout report).
   - YAGNI: does it need abstractions beyond what this task requires?
   - Test-ability: can it be driven by tests seed.md permits — no internal mocks, no mocked DB?
   - Reversibility: if it proves wrong post-implementation, what is the blast radius?
4. **Rank candidates.** State your recommendation. Name what would flip the decision.

# Output

Write the memo to `docs/research/<slug>.md`. Format:

```
# Pattern Research — <task>

## Candidate A: <short name>
- **Summary**: <1–2 sentences>
- **API references (current)**:
  - `<lib>@<version>` — <specific API> — <context7 or doc URL>
- **Fits**: <yes/no — anchored to a Scout observation>
- **Tests it enables**: <kinds of tests>
- **Tradeoffs**: <honest, not marketing>

## Candidate B: ...

## Recommendation
<Which candidate, and what would flip the decision.>

## Open questions
<Things a human reviewer must decide before the spec is written.>
```

After writing the file, append `"research"` to `workflow.json → completed`.

Tell the user: `Research memo at <path>. Next: /spec.`

# Constraints

- **No code generation.** Memo only.
- **No API assertion without a context7/docs reference.** "Unable to verify" is the honest answer when you hit a gap; do not guess.
- **No reimplementing what an approved dependency provides** (YAGNI, per seed.md).
- **Prefer 2–3 candidates over 6+.** Half-baked options are noise.
- **The recommendation is a recommendation.** The human reviewer decides at `/spec`.
- **Project source is read-only.** The only write is to `docs/research/<slug>.md`.
