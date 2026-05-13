# Design vs development vs copy

Stage 0 of `design-ui` classifies an incoming `task_brief` into one of three lanes. Only the **design** lane proceeds through `design-ui`; the other two return early with `final_state: "not_a_design_task"` and a pointer to the correct lane.

The split is **per-concern**, not per-file. A single source file (say `app/settings/page.tsx`) may carry behavior, surface, and prose all at once; each concern routes through its own lane, and the same file gets touched by all three over the lifetime of the feature.

## The three lanes

| Lane | Concerns | Routes through | Examples of intent phrasing |
|---|---|---|---|
| **Design** | Surface, motion, layout, typography, spacing, color, hierarchy, identity moments, register, visual accessibility (focus rings, contrast, motion-reduce) | `design-ui` → `impeccable` | "build a settings page that doesn't feel like a SaaS template" · "polish the FAQ" · "fix typography on `/cli/`" · "make the hero bolder" · "add motion to the buttons" · "adapt the docs for mobile" |
| **Development** | Behavior, event handlers, data flow, state machines, validation logic, business rules, API integration, error-handling logic, performance optimizations behind the surface | `/tdd` → `scenario` → `implement` → `verify` | "add input validation to the settings form" · "implement the save handler" · "add error retry to the save endpoint" · "fix the off-by-one in the pagination" · "add tests for the auth flow" |
| **Copy** | Body prose, marketing copy, README sections, documentation bodies, PR descriptions, microcopy when it's the prose itself (not the visual treatment) | `/document` → `prose` (which always invokes `humanizer`, conditionally invokes `copywriting` / `documentation` / `technical-tutorials`) | "rewrite the install instructions" · "improve the README" · "draft the launch announcement" · "polish the error messages' wording" |

## Per-concern classification rule

When a `task_brief` arrives, Stage 0 evaluates **two signals** in order:

1. **Intent string match** — see `references/intent-table.md`. Each row names an intent pattern and the lane it belongs to. The first matching row decides.
2. **`target_files` heuristic** — if the intent is ambiguous (no row matches OR a row matches but the intent could also fit another lane), inspect `target_files`:
   - All paths match `tdd.ui_globs` AND no logic-file extensions → **design**.
   - All paths are logic files (`.ts`, `.js`, `.go`, `.py`, `.rs`, etc., excluding `.tsx` / `.jsx` / `.vue` / `.svelte`) → **development**.
   - All paths are `.md` / `.mdx` and the intent mentions "write", "rewrite", "improve", "draft" → **copy**.
   - Mixed → return to step 1 with the user surfaced; ask which concern they mean.

## Overlap is normal — same file, three lanes

A single feature commonly cycles through all three lanes:

| Sequence | Lane | What lands |
|---|---|---|
| 1. `/tdd` writes failing tests for behavior, then implements them | Development | `app/settings/page.tsx` gets the onSubmit handler, validation logic, data binding |
| 2. `/tdd` Step 6 invokes `design-ui` per the spec's `## Design calls` | Design | Same file gets the type scale, spacing, motion, focus rings, hover states — via `impeccable craft` / `polish` |
| 3. `/document` invokes `prose` for any user-facing text the spec marks | Copy | Same file's button labels, headings, error messages get rewritten through `prose` → `humanizer` |

The lanes do not contend; they touch different parts of the same file. A button has:
- behavior (the `onClick` handler) — development
- surface (the size, padding, color, transition) — design
- copy (the label text the user reads) — copy

Each part routes to the lane that owns its concern.

## Edge cases

### Error states and loading states

The **logic** that decides "we are in an error state" / "we are loading" belongs to **development**. The **visual treatment** of those states (skeleton shape, error illustration, retry button placement, micro-animation) belongs to **design**. The **wording** of the error message belongs to **copy**.

### Forms

Layout, label typography, focus rings, hover affordance, motion → **design**.
Validation logic (which fields are required, regex constraints), submit handler, server integration → **development**.
Field labels, helper text, validation error wording → **copy**.

### A11y

Per WCAG 2.1 AA: focus rings, color contrast, motion-reduce honoring → **design**. Keyboard event handlers, `aria-*` attribute logic when it depends on state → **development**. Alt text and screen-reader copy → **copy**.

### Tokens (design-system level)

"Extract reusable tokens from the brand" or "promote the code-window palette to tokens" — these are **design** intents (specifically the `extract` recipe via `impeccable extract`). They touch CSS variable declarations and the design system file; they are surface concerns, not behavior.

### Performance

Visual performance (image loading, animation jank, layout shift, paint cost) — **design** via `impeccable optimize`.
Backend / data-fetching performance, query optimization, memoization for re-render avoidance — **development**.

## Misroute handling

If Stage 0 classifies the intent as **development** or **copy** (not design), `design-ui` immediately returns:

```jsonc
{
  "final_state": "not_a_design_task",
  "correct_lane": "/tdd" | "/document",
  "reason": "<plain-language classification rationale>",
  "state_file": ".claude/state/design/<slug>.json"  // checkpoint written even on misroute
}
```

The caller (a workflow phase or the user) reads `correct_lane` and re-routes. `design-ui` never silently passes a non-design brief through to `impeccable` — that would muddy impeccable's contract.

## When in doubt

If the per-concern split is ambiguous *and* both signals (intent string + target_files) fail to resolve, surface to the user with a one-line question:

> "This task seems to span design and development: <intent>. Which concern are you asking about? (a) design — surface, motion, visual a11y; (b) development — behavior, logic, data; (c) both, in sequence — start with `/tdd` for behavior, then this skill for design."

Do not guess. The clean separation is what makes the lanes structural.
