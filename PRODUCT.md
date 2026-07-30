# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Register

brand

## Users

Senior and staff engineers, tech leads, and engineering-team owners who run Claude Code on real production codebases. They have already adopted Claude Code and have already been bitten by its defaults — an unauthorized push, a `--no-verify` commit, a self-approved spec, a mocked internal module, a phase silently skipped. They are tool-chain literate: bash hooks, MCP servers, slash commands, and JSON config files are not friction for them.

They use this site in three modes:

1. **Evaluation** — landing on `/`, deciding in 30 seconds whether the baseline is the missing layer they have been building piecemeal. They scan the hook table, the phase ordering, and the consent-gate explanation, and either install or close the tab.
2. **Reference** — already installed; they hit `/hooks/`, `/skills/`, `/swarm/`, `/memory/` to look up a specific guard, skill, or workflow rule mid-session.
3. **Guided run** — working through a hands-on tutorial with terminals open, following numbered steps to stand something up. Confirmed by the org-setup reference, which is a ~10-minute two-terminal run with prerequisites, copyable commands, a verification step, and a troubleshooting list.

The job to be done: *make it structurally impossible for an AI agent to violate a rule the team has already decided on.* The interface has to make that guarantee visible without making it loud.

## Product Purpose

The Claude Code Baseline is a repository overlay. It ships twenty-six write-boundary and lifecycle hooks, fifty-three baseline-owned skills, one subagent (`swarm-worker`), an eleven-phase workflow with three user-typed workflow gates (plus `/grant-push`, a fourth gate that fires at runtime rather than at a phase), and a small constitution (`CLAUDE.md`) that binds Claude's in-session behavior. It is distributed as `npx @friedbotstudio/create-baseline ./my-target`.

Soft engineering rules — no force-push, no `--amend` of published commits, no mocks of internal modules, no self-approved specs, no skipped phases — become structural guarantees because the hooks run *outside* Claude's tool boundary. Claude cannot forge a consent marker, cannot bypass a guard with a flag, cannot reorder the workflow without an explicit exception written by `/triage`.

Success is a team that stops repeating "don't push, don't `--amend`, don't self-approve specs" every session and starts trusting that the agent simply cannot.

## Positioning

**A discipline layer for Claude Code.** A repository overlay that governs how Claude works in your codebase, intake to commit, and enforces every rule at the tool boundary, where Claude cannot reach.

Two clauses carry the differentiation and neither is optional:

- **At the tool boundary.** The enforcement is not a prompt, a memory entry, or an instruction the model is asked to honor. It is a hook process that runs before or after the tool call, outside the model's reach. A neighboring product that ships prompts and conventions cannot truthfully claim this.
- **You bring your own Claude Code.** The baseline does not ship, wrap, resell, or proxy Claude Code. It is the ruleset, the hooks, the skills, and the workflow, laid into a repository the team already owns.

Adopted 2026-07-28 from the pinned landing reference; supersedes any earlier one-line framing.

## Operating Context

- **Adoption is one command.** `npx @friedbotstudio/create-baseline@latest .` run inside a clean git working tree lays down the overlay: hooks, skills, subagent, MCP servers, constitutional documents, and a CI posture by default. The user then opens the repo in Claude Code (CLI, desktop, or the JetBrains / VS Code extensions), runs `/init-project` to tailor config to the stack, and drives work through `/triage` or `/harness`.
- **Project-agnostic mode is a sanctioned state.** Before `/init-project` runs, hooks are active but `test_runner` and `lint_runner` are in guide mode. Installing and never configuring is allowed, not broken.
- **Upgrades reconcile, they do not clobber.** `create-baseline upgrade` performs a per-file three-way reconcile against the shipped manifest: untouched files refresh, tier-2 merges mechanically, tier-3 stages for semantic reconciliation in main context via `/upgrade-project`, and locally customized tier-1 files prompt first.
- **Org mode is a multi-terminal ritual.** Up to four peer sessions including the lead, one terminal each, coordinating over the `sprint-channel` MCP server that ships in `.mcp.json`. A peer is an ordinary Claude Code session that runs `/companion on <channel_id>`; the channel id is chosen, not defaulted, and the peer id defaults to `companion-1`. The channel is a file-locked directory under `.claude/state/sprint/<channel_id>/`, so every session must be on one machine and in one checkout. The lead dispatches lane-tagged tasks; peers claim, execute in-lane, and escalate what they cannot settle. Requires git and two or more terminals. *(Corrected 2026-07-29: this previously described `SPRINT_POOL_CHANNEL` and a `lobby` default, which belong to `scripts/companion-pool-launch.sh` — a dev-only push-dispatch launcher that is never copied into `obj/template` and so does not exist in a consumer install.)*
- **Documentation is grouped by what the reader is doing, not by topic** (amended 2026-07-29). The surface commits to **16 pages**; those that do not yet exist are debt rather than fiction. Groups follow [Diátaxis](https://diataxis.fr/), whose governing rule is that the four types are not mixed on one page:
  - *(lead)* — Overview
  - **Start here** *(Tutorial)* — Install, Org tutorial
  - **Get a task done** *(How-to)* — Epics, PM mode, Standup
  - **Look it up** *(Reference)* — CLI, Workflow tracks, Hooks, Skills, MCP servers
  - **Why it works this way** *(Explanation)* — Governance, Memory, Velocity, Swarm mode, Org mode

  Overview leads **ungrouped**: it is Explanation by register, but filing it under Explanation puts the one page a newcomer must read first in the last group.

  **Group labels are the reader's words; the Diátaxis type is the author's** (amended 2026-07-29). The sidebar previously used the framework's own names with a blurb underneath to translate them. That was a half-measure: a reader who wants to turn org mode on does not think "that will be under Explanation", and a blurb does not fix a label that has already sent them the wrong way. The labels above are what the sidebar shows. The Diátaxis type survives as the per-page chip and as the `type` key in `docsnav.json`, so the classification still binds what each page may contain — it just stops being the navigation.

  This replaces the four topic groups the pinned docs comp committed to (*Getting started / The workflow / Capabilities / Modes*). Topic groups say nothing about what kind of reading a page offers, which is the distinction a reader actually navigates by. **Array order in `site-src/_data/docsnav.json` is the reading-order contract** — the pager derives from it, so the order is curated by progression, never alphabetically.
- **Docs pages carry a standard apparatus.** Breadcrumb, a type chip derived from the page's group plus any page-specific chips, a left nav rail, a right "on this page" TOC with a page-state panel (status, release, license, flag), a last-updated stamp with an edit-on-GitHub link, and **linked** previous/next pagers that skip unwritten pages and name the group they lead into.

## Capabilities and Constraints

Verified against the repository on 2026-07-28. Every figure below is checkable; the verifiability rule under **Anti-references** governs any use of them in copy.

| Fact | Value | Source of truth |
|---|---|---|
| Hooks | 26 | `.claude/hooks/*.mjs` |
| Baseline-owned skills | 53 | `owner: baseline` frontmatter across `.claude/skills/*/SKILL.md` |
| Subagents | 1 (`swarm-worker`) | `.claude/agents/` |
| Workflow phases | 11 | `CLAUDE.md` Article IV |
| Consent gates | 4 — `/approve-direction`, `/approve-swarm`, `/grant-commit`, `/grant-push` | `.claude/commands/` |
| Workflow tracks | 11 declared, of which 9 are top-level selectable | `.claude/workflows.jsonl` |
| MCP servers shipped | 4 — context7, plantuml, playwright, sprint-channel | `.mcp.json` |
| Package | `@friedbotstudio/create-baseline` | `package.json` |
| Version | 0.20.0 | `package.json` |
| License | Apache-2.0 | `package.json` |
| Repository | `friedbotstudio/baseline` | git remote |

The nine selectable tracks are `intake-full`, `spec-entry`, `tdd-quickfix`, `chore`, `freeform`, `epic`, `epic-child`, `org`, and `power`. The remaining two entries are sub-tracks (swarm implementation, TDD worker-chain) that a top-level track composes rather than the user selecting.

Constraints that bind product claims:

- **Git is a hard prerequisite for swarm, org, and power.** On a non-git tree those phases are excepted at triage and the workflow ends after `/archive`. Solo `/tdd` still works.
- **Org mode and power mode are opt-in and off by default**, behind `velocity.org_mode.enabled` and `velocity.power_mode.enabled`.
- **Org mode is experimental and local for now.** The coordination channel runs inside the baseline's own repo through a dev launcher; the server ships bundled and needs no runtime dependency of its own.
- **`sprint-pool` is not a shipped MCP server.** It is registered ad hoc by `scripts/companion-pool-launch.sh` for a pool session. The four servers in `.mcp.json` are the shipped set.
- **Disabling a hook is constitutional, not silent.** It takes an explicit `seed.md` §4.1 amendment plus the matching settings edit.
- **Secrets never enter the baseline.** `env_guard` blocks every write targeting `.env` files except `.env.example`.
- **Status: public alpha, under active development.** Already stated in the shipping site chrome; the references restate it.

Explicitly undecided or unverified:

- **Project-local workflow tracks surviving upgrades verbatim.** The landing reference's FAQ asserts this. No supporting implementation was found in `.claude/workflows.jsonl`, `seed.md`, or the triage skill on 2026-07-28. Do not publish the claim until the mechanism exists or is located.
- **Skill count in the pinned landing reference is stale.** It says 52 ("browse the 52 skills"); the repository has 53 baseline-owned skills. The repository is authority.
- **Launcher path in the pinned docs reference is stale.** Steps 2 and 3 invoke `.claude/skills/companion/launch.sh`, which has been retired. The current launcher is `scripts/companion-pool-launch.sh`.

## Brand Commitments

- **Name:** `baseline`, lowercase, in product chrome and copy. "The Claude Code Baseline" is the long form used in prose.
- **Tagline:** "A discipline layer for Claude Code."
- **Footer line:** "A discipline layer for Claude Code. Hooks, skills, and a workflow that runs from intake to commit."
- **Legal:** © 2026 baseline · Apache 2.0 · v0.20.0. Owning entity is Friedbot Studio Pvt Ltd.
- **Status chip:** "public alpha", shown alongside version and license in the top chrome.
- **Primary call to action, everywhere:** the install command itself, `npx @friedbotstudio/create-baseline@latest .`, rendered as a click-to-copy terminal affordance rather than a worded button. It appears in the top bar, the hero, the install section, and the closing band.
- **Pinned visual reference (binding, 2026-07-28).** `docs/references/Baseline Landing.dc.html` and `docs/references/Baseline Docs - Org Setup.dc.html` are binding direction for the marketing and documentation surfaces respectively. Future site work honors them rather than re-deciding the world. Recorded here as a constraint only; the token-level system belongs in DESIGN.md, which init does not write.

## Brand Personality

Three words: **constitutional · structural · uncompromising**.

- **Constitutional** — the writing speaks in articles, amendments, precedence, and binding language ("SHALL", "non-negotiable"). Authority is named and traceable: `seed.md` > `CLAUDE.md` > implementation. Voice is formal, declarative, low on adjectives.
- **Structural** — every claim names the mechanism that backs it. The product does not ask for trust; it shows the hook, the file path, the precedence rule. Phrases like *"hooks are load-bearing"*, *"runs outside Claude's tool boundary"*, *"structurally un-invokable"* are the register.
- **Uncompromising** — defaults are firm. A bypass requires an explicit exception, recorded in state, written by a privileged command. The voice never softens this with optimism or caveat.

The site is product copy, not editorial prose, not SaaS pitch. It earns trust through specifics — the hook table, the phase list, the consent-gate diagram — never through adjectives.

**Outcome-led argument (CLAUDE.md XI.1; amended 2026-07-27).** The register above is unchanged. What changes is the *argument*: on user-facing copy a section headline SHALL assert what becomes true for the reader, not name a topic. Mechanism follows the claim; it never replaces it. A page organised as `What it is` / `Why hooks` / `How it flows` is a table of contents — it describes the product instead of making a case for it.

- **Good:** "A blocked tool call never runs." / "Your rules, below the layer Claude can reach." / "Your context is never handed to a stranger."
- **Bad:** "Why hooks" / "Architectural principle" / "What it is" — each names a subject and asserts nothing.

This scopes how the case is made, not what may be said. Every anti-reference below stays binding, and so does the verifiability rule: a claim may only assert what the codebase can be checked against. An outcome headline that cannot be traced to a mechanism is hyperbole, which is still banned.

## Anti-references

This site SHALL NOT look or sound like:

- **AI slop.** Gradient text, glassy cards, generic dashboard chrome, "magical AI assistant" framing. The category-reflex palette of "purple gradient on dark = AI tool" is banned. The **vanity hero-metric template** (big number + small label decorating an unfalsifiable claim — "10x faster", "99.9% uptime", "1M+ users") is also banned. A meta-strip of **structural counts naming load-bearing components** is permitted when each cell is verifiable from the codebase (`26 hooks`, `53 skills`, `1 subagent`, `11 phases`, `4 gates`) — those are the spec, not the brag. **As of 2026-07-26 the landing strip leads with the claim and carries the count as its label** ("Cannot self-approve / 3 structural gates") rather than the other way round: a count is evidence for an argument, and opening the page with six of them stated an inventory instead of making one. The verifiability rule is unchanged and still binding — a tile may only assert what the codebase can be checked against. Do not "restore" a count-led strip on the grounds that this section once encouraged it. **Open conflict (2026-07-28):** the newly pinned landing reference uses a count-led three-cell strip (numeral first, claim as label). This clause and that reference disagree. Resolve explicitly before the strip is next built; do not let either side win by default.
- **"AI-powered" marketing.** The product *powers* Claude Code; it is not powered by AI as a feature. Strike "AI-powered", "10x your productivity", "supercharge your workflow", "agentic" as a noun, and any vague intelligence claim from copy.
- **Hyperbole.** No "revolutionary", "next-generation", "game-changing". The product is a baseline, not a revolution.
- **Cute mascots, illustrated robots, or anthropomorphic AI.** The agent is a tool under a discipline layer, not a character.
- **Fluffy SaaS landing tropes.** Identical card grids of three feature blurbs, decorative drop shadows on every surface, modals as the first thought, side-stripe colored borders.

**Scope.** These anti-references — and the `impeccable` skill's broader Shared Design Laws they echo (no em dashes, no gradient text, no glassmorphism, no hero-metric vanity, etc.) — are scoped to **user-facing copy** per `CLAUDE.md` Art. XI.1. Internal governance documents (this file included), `README.md`, `.claude/skills/*/SKILL.md`, `.claude/memory/*.md`, CLI output, and inline code samples use the constitutional voice deliberately and SHALL NOT be edited to conform to the bans.

## Evidence on Hand

Real material the site may draw on, with paths:

- **`docs/references/Baseline Landing.dc.html`** — pinned marketing comp. Carries the hero refusal transcript (two tool calls blocked by `git_commit_guard` and the push guard, with the closing line "hooks run outside my reach"), the four-strata model (Genesis `seed.md` → Constitution `CLAUDE.md` → Implementation → Tool boundary), the tool-boundary lifecycle diagram, the `intake-full` DAG with gates marked, the main-context versus isolated-worktree split, the four-step adoption sequence, and six evaluator FAQs.
- **`docs/references/Baseline Docs - Org Setup.dc.html`** — pinned docs comp. A six-step org-mode run, the peer → lead → human escalation diagram, teardown verbs (`leave_peer`, `release_task`), and three named failure modes with fixes.
- **The codebase itself** — the strongest evidence the product has. Every count, every hook name, every guard behavior, and every phase is checkable from `.claude/`, `docs/init/seed.md`, and `CLAUDE.md`. A reader verifies a claim by opening a file, not by trusting a tagline.
- **`audit-baseline`** — a shipped drift check that reconciles the manifest against disk. The claim that counts are accurate is itself enforced in CI.

Absences that future work SHALL NOT fabricate:

- No customers, logos, testimonials, case studies, or press. The product is a public alpha with no named adopters on record.
- No benchmarks, performance figures, time-saved numbers, or adoption statistics.
- No pricing, plans, tiers, or commercial terms. Apache 2.0, and nothing beyond it.
- No uptime, scale, or reliability claims. The product is a repository overlay; it runs no service.

## Design Principles

1. **Practice what you preach.** A site that markets discipline must itself be disciplined. No undocumented one-off styles, no decorative glass, no orphan tokens. Every accent surface is in the reserved-accent contract; every section follows the one-per-page editorial budget.
2. **Show the structure.** The page IS the harness. Strata diagrams, hook tables, phase lists, consent-gate sequences. Specifics make the case; adjectives never do. Readers should be able to verify a claim by clicking a link, not by trusting a tagline.
3. **Constitutional voice.** Use the same noun-heavy, declarative register as `seed.md` and `CLAUDE.md`. *"Hooks are load-bearing"* over *"hooks ensure quality"*. *"Claude cannot forge consent"* over *"approval is secure"*. The product's authority comes from naming the mechanism.
4. **Reserved accent.** Orange is a state device, not decoration. It marks the H1 verb-or-period, section eyebrows, primary-button hover, link hover, focus rings, syntax-highlight strings in code windows, and consent-gate annotations. Body copy, plain navigation, hairlines, and active-state rails (sidebar, TOC) stay ink. If you reach for accent on a surface outside the contract, the answer is `--charcoal` or `--muted`.
5. **Cohesion across registers.** The top-level surface is brand; reference pages (`/hooks/`, `/skills/`, `/swarm/`, `/memory/`) wear product-shaped chrome (sidebar, TOC, persistent topnav). DESIGN.md tokens, type families, spacing scale, and motion vocabulary are shared across both — readers feel one site, not two.
6. **The refusal is the demonstration.** The product's central proof is an agent being stopped. Both pinned references lead with a real blocked-tool-call transcript rather than a description of one. Show the refusal; do not narrate it.

## Accessibility & Inclusion

- **WCAG 2.1 AA** is the floor. Body text in `--muted` on `--bg` clears 4.7:1; primary text in `--text` (= `--ink`) on `--bg` clears 14:1; primary button (`--paper` on `--ink`, with `--accent` on hover) clears AA at body and large-text sizes.
- **Focus rings on every interactive element**: 2px solid `--accent` outline at `outline-offset: 2px`, 3px radius. The accent ring against `--bg` and against `--code-bg` both clear AA non-text contrast (3:1). On accent-tinted surfaces, the ring switches to `--paper`.
- **Skip-link** at the top of `<body>` jumping to `#main-content`, visible only on focus.
- **Reduced motion**: honor `prefers-reduced-motion: reduce` by zeroing transition durations and disabling scroll-bound reveals — every motion the system uses must degrade gracefully.
- **Section nav** is its own `<nav aria-label="Page sections">` so AT users can skip the hero on every page.
- **No color-only signaling.** State (active sidebar row, current TOC anchor, validation, consent-gate freshness) is always carried by a non-color cue (weight, position, glyph, label) in addition to color.
- **Keyboard parity.** Every interactive element reachable and operable from the keyboard, in document order; no `tabindex` greater than 0; no keyboard traps in the dev-console hero animation.
- **Copy affordances are real buttons.** The click-to-copy install command is a `<button>` with a state label that changes on copy, not a styled `<div>` — keyboard-operable and announced.
