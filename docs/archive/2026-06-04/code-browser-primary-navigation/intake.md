# Make code-browser the primary navigation path across all repositories

<!-- Intake document. Produced by the `intake` skill. Brief: docs/brief/code-browser-primary-navigation.md -->

## Problem

In consumer/client installs of the baseline, when a developer asks a code-navigation question — "where does X come from?", "what renders Y?", "which file for feature Z?", "who consumes this service?" — the model reaches for **Explore agents or bash `grep` first**. The `code-browser` skill, which exists precisely to answer these by walking the structural graph top-down, is effectively dormant and bypassed, even though its own SKILL.md says "Prefer this skill over global grep — keyword search routinely picks up unrelated flows that share the same domain word and produces wrong answers."

Two concrete consequences: (1) keyword search lands on the wrong flow when a domain word appears in unrelated code (the exact failure code-browser was built to avoid); (2) on Python/Go/Rust **backend** repos, code-browser's fast-path helpers (`walk.mjs`, `discover.mjs`) are hardwired to JS/TS/Next.js — they read `tsconfig.json`/`package.json`, resolve only `.tsx/.ts/.jsx/.js`, and assume `src/services|context|components` layers — so they produce nothing and code-browser degrades to a slow manual walk. The "universal walk" doctrine in the same SKILL.md is, by contrast, explicitly language-agnostic and works regardless of framework.

This is a symptom in **consumer installs**, not in this baseline/template repo (a CLI/governance codebase with no page→component→API graph to walk). The fix must therefore reach consumer installs.

## Goal

For code-navigation questions in any repository, code-browser's language-agnostic universal walk is the first thing reached for — broad search is the fallback, not the default — so developers get correct, efficient navigation answers regardless of language.

## Non-goals

- Building per-language fast-path adapters now (Python/Go/Rust `walk`/`discover` support is deferred to separate follow-on workflows).
- Changing the existing JS/TS `walk.mjs`/`discover.mjs` fast-path (kept as-is).
- Removing the code-browser skill or changing the governance skill count (stays 40).
- Adding a 23rd hook, unless research proves prose/doctrine alone cannot achieve primacy (the standing constraint is to keep the count at 22).

## Success metrics

Outcome-based per the brief (not "was code-browser invoked"):

- **Navigation correctness** — baseline: keyword-collision wrong-flow picks occur; target: navigation answers trace the actual import/call graph, no wrong-flow picks; measured via: qualitative eval on a set of navigation questions across a frontend and a backend repo.
- **Tool-call economy** — baseline: grep-and-sift loops; target: fewer, more targeted steps to the answer; measured via: tool-call count on the same eval set.
- **Backend coverage** — baseline: code-browser yields nothing on Python/Go/Rust; target: the universal-walk doctrine produces correct navigation on backend repos without a fast-path adapter; measured via: the eval set includes at least one non-JS/TS repo.

## Stakeholders

- **Requester**: Tushar Srivastava (project owner) — razieldecarte@gmail.com
- **Reviewer**: Tushar Srivastava (project owner) — approves the spec and the constitutional change, if any
- **Operator**: consumer-install developers (who experience the routing in their own projects); the baseline maintainer ships the change via the template/upgrade path

## Constraints

- Any in-session behavior rule must reach **consumer installs** through whatever surface the baseline ships to them (resolved by `/scout`) — a rule that binds only this repo's `CLAUDE.md` would not fix the symptom.
- Precedence: a change to Articles I–IX requires editing `docs/init/seed.md` first, then `CLAUDE.md` (Article I.4). A project-amendment (Article X) binds alongside but cannot contradict I–IX.
- The 22-hook count is a standing governance constraint; prefer prose/doctrine or folding into an existing hook over a new hook.
- `audit-baseline` must still PASS (skill/hook counts, citations, manifest hashes); the byte-equal mirrors (`src/CLAUDE.template.md`, `src/seed.template.md`) must stay in sync if the constitution changes.

## Acceptance criteria

1. Given a navigation question in any repository, the documented routing doctrine states that code-browser's universal walk is the **first attempt**, and that broad search (Explore/grep) is used only when (a) no resolvable structure exists or (b) the walk dead-ends.
2. Given `code-browser/SKILL.md`, the **language-agnostic universal walk** is presented as the primary path and the JS/TS `walk.mjs`/`discover.mjs` helpers are framed as an **optional accelerator** for JS/TS repos, not as the primary mechanism.
3. Given a consumer install, the navigation-routing rule reaches it through the baseline's shipping surface (the specific surface is named by `/scout`); a change confined to this repo's working `CLAUDE.md` alone does not satisfy this criterion.
4. Given the existing JS/TS fast-path, `walk.mjs` and `discover.mjs` are unchanged (byte-identical) after this workflow.
5. Given the governance counts, the skill count remains 40, the hook count remains 22 (or any deviation is explicitly justified and the audit assertions are updated to match), and `audit-baseline` exits PASS.
6. Given a constitutional change (if the chosen mechanism is one), `docs/init/seed.md` is edited before `CLAUDE.md`, and the byte-equal mirrors `src/seed.template.md` and `src/CLAUDE.template.md` stay in sync.

## Open questions

- How do consumer installs inherit navigation routing — shipped `CLAUDE.template.md`/seed, skill descriptions that travel with `.claude/skills/`, or a hook? (`/scout` must answer; determines where the fix lands.)
- Given the "no 23rd hook" constraint, is a binding prose/doctrine rule sufficient to flip the model's default from Explore/grep to code-browser, or is an advisory nudge folded into an existing hook warranted? (`/research` → `/spec`.)
- How are the outcome criteria (correctness, fewer calls, backend coverage) made into checkable acceptance tests, given navigation is model-judgment rather than a deterministic unit? (`/spec` AC design — may settle as an eval-set artifact rather than a unit test.)
