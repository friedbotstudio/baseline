---
name: document
owner: baseline
description: Workflow Phase 10 — orchestrator for documentation work. Surveys the diff, routes technical writing through the `documentation` skill, tutorials through `technical-tutorials`, and all prose body work (inline docs, README updates, user-facing copy) through the `prose` skill (which mandates `humanizer` and conditionally `copywriting`). Verifies completeness and marks phase done.
---

# document — Phase 10 orchestrator

This skill does **not** write docs directly. It surveys the diff, decides what kinds of doc work are needed, and delegates via the Skill tool.

| Delegate skill | Kind | Runs on |
|---|---|---|
| `prose` | Prose body — any English writing that needs humanizing | inline docs, README surface, user-facing copy, summary/narrative sections |
| `documentation` | Technical reference | API docs, architecture notes, operational runbooks |
| `technical-tutorials` | Step-by-step narrative | quickstarts, walkthroughs, code tutorials |

The key shift: **`prose` is the sole channel for prose-shaping work**. It owns the `humanizer` pass so every word we ship is filtered. The other two are technical specialists that produce structured reference material; when they output prose paragraphs that matter, they invoke `prose` themselves.

## Prereq

`integrate` in `completed` (or `exceptions`).

## When each delegate fires

- **`documentation`** — diff touches a public API, config surface, module architecture, or adds runbook-worthy operational behavior. Reference material a future engineer will look up.
- **`technical-tutorials`** — diff adds a feature a *first-time user* must learn by doing. Hands-on-learning, not lookup-reference.
- **`prose`** — when prose needs to be written or revised:
  - Narrative sections inside docs the above two skills produce.
  - README surface updates.
  - User-facing marketing/product copy on landing, pricing, feature pages.
  - One-paragraph summaries, migration narratives, release notes.

Multiple can fire on one diff. A feature that ships an API, needs a quickstart, and updates the pricing page triggers all three.

## Steps

1. **Verify prereq.** `integrate` is in `completed` or `exceptions`. Otherwise stop and say which phase is missing.

2. **Survey the diff.** `git diff --name-status <merge-base>..HEAD`. Classify touched files:
   - Public API / CLI / contract surfaces → `documentation` candidate.
   - New capability a user learns by doing → `technical-tutorials` candidate.
   - Marketing / pricing / feature / landing pages → `prose` (persuasive register) candidate.
   - README surface or prose anywhere in the diff → `prose` candidate.
   - Internal-only refactor with no external surface → just inline docstrings + the README sanity check.

3. **Always: inline docs.** For every changed public symbol — module-level docstring / header comment / doc comment appropriate to the language. Short. If you need a comment to explain *what*, the abstraction is wrong; comments are for non-obvious *why*.

4. **Delegate.** For each matched category, invoke the delegate skill with a scoped brief:
   - `documentation` / `technical-tutorials`: invoke via `Skill(...)`. Include the diff slice, upstream spec/intake, and the specific deliverable (e.g., "API reference for the new retry endpoint"). Read its output and incorporate it.
   - `prose`: invoke via `Skill(prose)` with brief, source material (diff slice, spec excerpt), audience, register, and output target (file path or section). The `prose` skill applies `humanizer` always, plus the conditional skill you name.

5. **README surface check.** If the root `README.md` or any top-level doc claims behavior the diff changed, update it — route through `prose` so the copy gets humanized.

6. **Scrub.** No `TODO` / `FIXME` / `HACK` / `XXX` in files this phase touched. Seed.md forbids them; humanizer doesn't catch them.

7. **Append `"document"` to `.claude/state/workflow.json → completed`.**

8. Tell the user: "Documentation pass complete. Invoked: `<list of delegates>`. Next: `/archive`."

## Constraints

- **Delegation is mandatory.** You do not write prose here; `prose` does. You do not write API reference here; `documentation` does. You do not write tutorials here; `technical-tutorials` does. This skill decides *who* writes *what* and stitches the result.
- **Do not skip the humanizer pass.** Everything in `prose` runs it. If you find yourself tempted to write a README paragraph inline to save a hop, don't — route it through `prose`.
- **Do not invoke delegates that don't apply.** Internal refactor with no external surface? Don't fire `prose` (persuasive register) just because the skill is available. Step 2's survey gates the invocations.
- **Keep this skill lightweight.** The body is mostly "decide → delegate → verify → mark done". Heavy lifting lives in the delegates.
- **YAGNI on docs.** A doc exists because the code change made it necessary. No speculative documentation.
