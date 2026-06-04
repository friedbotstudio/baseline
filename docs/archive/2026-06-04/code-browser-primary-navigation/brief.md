# Brief — code-browser-primary-navigation

Captured via `/brainstorm` (Stage 3). Primary input for `/intake` template-fill.

## actor

Developers using Claude Code in consumer/client installs — both frontend and backend repositories. (The symptom is downstream of this baseline/template repo; the fix must reach consumer installs.)

## trigger

The developer asks a code-navigation question — "where does X come from?", "what renders Y?", "which file for feature Z?", "what API populates this panel?", or a reverse query like "who consumes this service?".

## current_state

For navigation questions the model reaches for **Explore agents or bash grep first**, even though `code-browser`'s own SKILL.md says "Prefer this skill over global grep." code-browser is effectively dormant/bypassed. Compounding this: code-browser's fast-path helpers (`walk.mjs`, `discover.mjs`) are hardwired to JS/TS/Next.js (resolve only `.tsx/.ts/.jsx/.js`, read `tsconfig.json`/`package.json`, hardcoded `src/services|context|components` layers, `byHook/byService/byComponent/byApiCall` output model), so on Python/Go/Rust backends they produce nothing and code-browser collapses to a slow manual walk. The "universal walk" doctrine in SKILL.md is, by contrast, explicitly language-agnostic.

## desired_state

code-browser's language-agnostic **universal walk** is the **first attempt** for navigation questions across all repositories. Broad-search tools (Explore/grep) are reached only when (a) the repo has **no resolvable structure** (flat script piles, unfamiliar layouts, no locatable entry point) or (b) the walk **dead-ends** (dynamic dispatch, generated code). Success is measured by **outcomes**, not by which tool fired:

- **Correct answers** — navigation stops picking the wrong flow from keyword collisions (the failure mode code-browser exists to prevent).
- **Fewer tool calls** — the answer is reached in fewer, more targeted steps than a grep-and-sift loop.
- **Backend coverage** — the same navigation quality holds on Python/Go/Rust repos, not just JS/TS frontends, even without a per-language fast-path adapter (the doctrine carries).

## non_goals

- Building per-language fast-path adapters now (Python/Go/Rust deferred to separate follow-on workflows).
- Changing the existing JS/TS `walk.mjs`/`discover.mjs` fast-path (kept as-is).
- Removing the code-browser skill or changing the governance skill count.
- Adding a 23rd hook if it can be avoided (per the standing "keep the count at 22" constraint).

## solution_leakage

The request carries solution-shaped framing that is **user-decided scope** this session, recorded rather than stripped: "elevate the universal-walk doctrine," "reframe the JS/TS fast-path as an optional accelerator," and "a constitutional routing rule (seed.md then CLAUDE.md, per Article I.4)." The precise mechanism (where the routing rule lives; whether any hook nudge is involved) is left for `/research` and `/spec` to settle.

## open_questions

- How do consumer installs inherit navigation routing — via shipped `CLAUDE.template.md`/seed, via skill descriptions that travel with `.claude/skills/`, or does it need a hook? (`/scout` must answer this; it determines where the fix lands so it reaches the symptom site.)
- Given the "no 23rd hook" constraint, is a binding constitutional/prose rule sufficient, or is an advisory nudge folded into an existing hook warranted? (`/research` → `/spec`.)
- What is the testable form of the outcome criteria (correct answers / fewer tool calls / backend coverage) given navigation behavior is model-judgment, not a deterministic unit under test? (`/spec` AC design.)
