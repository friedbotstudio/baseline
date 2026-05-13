# Intent table — natural-language intent → impeccable recipe

Stage 2 of `design-ui` reads a `task_brief.intent` string and translates it to a sequence of `impeccable` subcommand invocations. This file is that translation table. Each row matches an intent pattern; the first match wins.

`impeccable` ships ~21 subcommands organized in five categories: Build (`shape`, `craft`, `teach`, `document`, `extract`), Evaluate (`critique`, `audit`), Refine (`polish`, `bolder`, `quieter`, `distill`, `harden`, `onboard`), Enhance (`animate`, `colorize`, `typeset`, `layout`, `delight`, `overdrive`), Fix (`clarify`, `adapt`, `optimize`), Iterate (`live`). Each recipe row below names commands by their exact vocabulary so `design-ui` can mechanically dispatch `Skill(impeccable, "<cmd>", "<args>")`.

## Reading the table

Columns:
- **Intent pattern** — the regex / keyword the intent string is matched against. Case-insensitive.
- **Recipe** — the sequence of impeccable subcommands in order.
- **Mode** — `auto` (single-step or "atom"; no user approval needed) or `ask` (multi-step; surface the plan and await `proceed`).
- **Notes** — when this row earns vs. when a different row should match.

The "polish atom" (`audit → polish → audit`) is treated as a **single** step from the orchestrator's point of view: design-ui's Stage 3 runs it as one unit and loops internally (cap 3 — see `orchestration.md`). It is `auto` because the user already said "polish" — they don't need to re-approve the audit they implicitly invoked.

The "build atom" (`shape → craft → audit`) is multi-step and `ask`: `shape` produces a design brief that the user reviews before the destructive `craft` step writes code.

## The table

| Intent pattern | Recipe | Mode | Notes |
|---|---|---|---|
| `/^build\b\|^create\b\|^add a\b/i` | shape → craft → audit | ask | Net-new surface. Multi-step → user approves the plan after `shape` before `craft` writes files. |
| `/^plan\b\|^sketch\b\|^explore\b/i` | shape | auto | Plan only; caller will implement themselves. Single step. |
| `/^review\b\|^score\b/i` | critique ∥ audit | auto | Parallel evaluation: critique (UX scoring) AND audit (technical). Read-only. |
| `/^polish\b\|^finish\b\|^ship\b/i` | audit → polish → audit | auto | Polish atom. Loops internally up to 3 iterations (orchestration.md). Single-step from the orchestrator's POV. |
| `/^make .+ bolder\b\|^amplify\b\|^louder\b/i` | bolder → audit → polish | ask | Refinement with verification. Multi-step. |
| `/^too aggressive\b\|^too loud\b\|^quieter\b\|^tone down\b/i` | quieter → audit → polish | ask | Opposite of bolder. |
| `/^distill\b\|^strip\b\|^reduce\b/i` | distill → audit → polish | ask | Remove complexity. |
| `/^harden\b\|^add error states\b\|^add loading states\b\|^add edge cases\b/i` | harden → audit | ask | Production-ready pass. |
| `/^typography\b\|^fix typography\b\|^typeset\b/i` | typeset → audit | ask | Targeted type-system pass. |
| `/^spacing\b\|^layout\b\|^fix spacing\b\|^rhythm\b/i` | layout → audit | ask | Targeted spacing / hierarchy pass. |
| `/^color\b\|^colorize\b\|^palette\b/i` | colorize → audit | ask | Targeted color / palette pass. |
| `/^add (motion\|animation)\b\|^animate\b/i` | animate → audit | ask | Motion pass with perf re-check. |
| `/^add delight\b\|^add personality\b\|^make it delightful\b/i` | delight → audit | ask | Personality moments. |
| `/^adapt\b\|^make .+ (mobile\|responsive)\b\|^responsive\b/i` | adapt → audit | ask | Multi-viewport pass. |
| `/^clarify\b\|^improve copy\b\|^rewrite (labels\|errors\|microcopy)\b/i` | clarify → audit | ask | UX writing pass; pairs with `prose` skill for body copy. |
| `/^optimize\b\|^perf\b\|^performance\b/i` | optimize → audit | ask | Visual perf pass (paint, layout shift, motion budget). |
| `/^onboard\b\|^first[- ]run\b\|^empty state\b\|^activation\b/i` | onboard → polish | ask | Activation-flow design. |
| `/^match (this )?reference\b\|^like the/i` | shape (with references) → craft → audit | ask | Inspiration-anchored build. `task_brief.references` populates the shape brief. |
| `/^iterate\b\|^variants\b\|^live\b/i` | live | auto | Visual variant exploration in the browser. Single step. |
| `/^extract\b\|^pull (out )?tokens\b\|^promote.+to tokens\b/i` | extract | auto | Token / component extraction. Single step. |
| `/^overdrive\b\|^push (past )?conventional\b/i` | overdrive → audit → polish | ask | Maximalism mode. Three steps, ask before running. |
| `(no match)` | — | — | Ambiguous intent; route to user clarification per `design-vs-development.md`. |

## How a row is selected

1. Lower-case the intent string, strip leading whitespace.
2. Scan rows top-to-bottom. First regex that matches wins.
3. If `target_files` is empty AND no row matches, the intent is surface-less; default recipe is `live` if the intent contains "browser" / "preview" / "iterate", else `extract` if "tokens" / "promote". Otherwise return `not_a_design_task` with a request for clarification.
4. If a row matches but `target_files` is empty for an intent that normally needs a target (e.g., `polish`, `harden`), Stage 1 (capture) asks the user for `target_files` before Stage 2 (translate) commits.

## Single-step vs multi-step (auto vs ask)

- **auto**: design-ui runs the recipe without surfacing it. Used when the user's intent is unambiguous AND the recipe is one impeccable subcommand OR a self-contained atom (audit→polish→audit treated as one unit for orchestrator purposes).
- **ask**: design-ui prints the plan ("Recipe: [shape, craft, audit]. Proceed? (or override)") and waits for the user to type `proceed` (or supply an override). Used for any recipe that's truly multi-step at the orchestrator level.

The mode column above reflects this distinction. Stage 3 (orchestrate) reads the mode and gates accordingly.

## Adding a new row

If a future intent doesn't fit any row above, add a new one *here* before extending Stage 2 logic. The rule of thumb: the row must (a) name a known impeccable subcommand (no inventing new ones), (b) carry a recipe that ends in an evaluation step (`audit` or `critique`) for verification, and (c) classify cleanly as `auto` or `ask`.

Do not add rows that map to `Skill(design-ui, …)` recursively — design-ui is the orchestrator, not a target.
