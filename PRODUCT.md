# Product

## Register

brand

## Users

Senior and staff engineers, tech leads, and engineering-team owners who run Claude Code on real production codebases. They have already adopted Claude Code and have already been bitten by its defaults — an unauthorized push, a `--no-verify` commit, a self-approved spec, a mocked internal module, a phase silently skipped. They are tool-chain literate: bash hooks, MCP servers, slash commands, and JSON config files are not friction for them.

They use this site in two modes:

1. **Evaluation** — landing on `/`, deciding in 30 seconds whether the baseline is the missing layer they have been building piecemeal. They scan the hook table, the phase ordering, and the consent-gate explanation, and either install or close the tab.
2. **Reference** — already installed; they hit `/hooks/`, `/skills/`, `/swarm/`, `/memory/` to look up a specific guard, skill, or workflow rule mid-session.

The job to be done: *make it structurally impossible for an AI agent to violate a rule the team has already decided on.* The interface has to make that guarantee visible without making it loud.

## Product Purpose

The Claude Code Baseline is a repository overlay. It ships twenty-two write-boundary and lifecycle hooks, thirty-six skills, one subagent (`swarm-worker`), an eleven-phase workflow with three user-typed consent gates, and a small constitution (`CLAUDE.md`) that binds Claude's in-session behavior. It is distributed as `npx @friedbotstudio/create-baseline ./my-target`.

Soft engineering rules — no force-push, no `--amend` of published commits, no mocks of internal modules, no self-approved specs, no skipped phases — become structural guarantees because the hooks run *outside* Claude's tool boundary. Claude cannot forge a consent marker, cannot bypass a guard with a flag, cannot reorder the workflow without an explicit exception written by `/triage`.

Success is a team that stops repeating "don't push, don't `--amend`, don't self-approve specs" every session and starts trusting that the agent simply cannot.

## Brand Personality

Three words: **constitutional · structural · uncompromising**.

- **Constitutional** — the writing speaks in articles, amendments, precedence, and binding language ("SHALL", "non-negotiable"). Authority is named and traceable: `seed.md` > `CLAUDE.md` > implementation. Voice is formal, declarative, low on adjectives.
- **Structural** — every claim names the mechanism that backs it. The product does not ask for trust; it shows the hook, the file path, the precedence rule. Phrases like *"hooks are load-bearing"*, *"runs outside Claude's tool boundary"*, *"structurally un-invokable"* are the register.
- **Uncompromising** — defaults are firm. A bypass requires an explicit exception, recorded in state, written by a privileged command. The voice never softens this with optimism or caveat.

The site is product copy, not editorial prose, not SaaS pitch. It earns trust through specifics — the hook table, the phase list, the consent-gate diagram — never through adjectives.

## Anti-references

This site SHALL NOT look or sound like:

- **AI slop.** Gradient text, glassy cards, generic dashboard chrome, "magical AI assistant" framing. The category-reflex palette of "purple gradient on dark = AI tool" is banned. The **vanity hero-metric template** (big number + small label decorating an unfalsifiable claim — "10x faster", "99.9% uptime", "1M+ users") is also banned. A meta-strip of **structural counts naming load-bearing components** is permitted and encouraged when each cell is verifiable from the codebase (`22 hooks`, `36 skills`, `1 subagent`, `11 phases`, `3 gates`) — those are the spec, not the brag.
- **"AI-powered" marketing.** The product *powers* Claude Code; it is not powered by AI as a feature. Strike "AI-powered", "10x your productivity", "supercharge your workflow", "agentic" as a noun, and any vague intelligence claim from copy.
- **Hyperbole.** No "revolutionary", "next-generation", "game-changing". The product is a baseline, not a revolution.
- **Cute mascots, illustrated robots, or anthropomorphic AI.** The agent is a tool under a discipline layer, not a character.
- **Fluffy SaaS landing tropes.** Identical card grids of three feature blurbs, decorative drop shadows on every surface, modals as the first thought, side-stripe colored borders.

**Scope.** These anti-references — and the `impeccable` skill's broader Shared Design Laws they echo (no em dashes, no gradient text, no glassmorphism, no hero-metric vanity, etc.) — are scoped to **user-facing copy** per `CLAUDE.md` Art. X.1. Internal governance documents (this file included), `README.md`, `.claude/skills/*/SKILL.md`, `.claude/memory/*.md`, CLI output, and inline code samples use the constitutional voice deliberately and SHALL NOT be edited to conform to the bans.

## Design Principles

1. **Practice what you preach.** A site that markets discipline must itself be disciplined. No undocumented one-off styles, no decorative glass, no orphan tokens. Every accent surface is in the reserved-accent contract; every section follows the one-per-page editorial budget.
2. **Show the structure.** The page IS the harness. Strata diagrams, hook tables, phase lists, consent-gate sequences. Specifics make the case; adjectives never do. Readers should be able to verify a claim by clicking a link, not by trusting a tagline.
3. **Constitutional voice.** Use the same noun-heavy, declarative register as `seed.md` and `CLAUDE.md`. *"Hooks are load-bearing"* over *"hooks ensure quality"*. *"Claude cannot forge consent"* over *"approval is secure"*. The product's authority comes from naming the mechanism.
4. **Reserved accent.** Orange is a state device, not decoration. It marks the H1 verb-or-period, section eyebrows, primary-button hover, link hover, focus rings, syntax-highlight strings in code windows, and consent-gate annotations. Body copy, plain navigation, hairlines, and active-state rails (sidebar, TOC) stay ink. If you reach for accent on a surface outside the contract, the answer is `--charcoal` or `--muted`.
5. **Cohesion across registers.** The top-level surface is brand; reference pages (`/hooks/`, `/skills/`, `/swarm/`, `/memory/`) wear product-shaped chrome (sidebar, TOC, persistent topnav). DESIGN.md tokens, type families, spacing scale, and motion vocabulary are shared across both — readers feel one site, not two.

## Accessibility & Inclusion

- **WCAG 2.1 AA** is the floor. Body text in `--muted` on `--bg` clears 4.7:1; primary text in `--text` (= `--ink`) on `--bg` clears 14:1; primary button (`--paper` on `--ink`, with `--accent` on hover) clears AA at body and large-text sizes.
- **Focus rings on every interactive element**: 2px solid `--accent` outline at `outline-offset: 2px`, 3px radius. The accent ring against `--bg` and against `--code-bg` both clear AA non-text contrast (3:1). On accent-tinted surfaces, the ring switches to `--paper`.
- **Skip-link** at the top of `<body>` jumping to `#main-content`, visible only on focus.
- **Reduced motion**: honor `prefers-reduced-motion: reduce` by zeroing transition durations and disabling scroll-bound reveals — every motion the system uses must degrade gracefully.
- **Section nav** is its own `<nav aria-label="Page sections">` so AT users can skip the hero on every page.
- **No color-only signaling.** State (active sidebar row, current TOC anchor, validation, consent-gate freshness) is always carried by a non-color cue (weight, position, glyph, label) in addition to color.
- **Keyboard parity.** Every interactive element reachable and operable from the keyboard, in document order; no `tabindex` greater than 0; no keyboard traps in the dev-console hero animation.
