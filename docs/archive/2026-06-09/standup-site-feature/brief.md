# Brainstorm brief — standup-site-feature

## Actor

Developers who run Claude Code (the baseline audience) landing on the marketing site to evaluate whether to install; and the maintainer, who wants standup to be discoverable and sold.

## Trigger

standup just shipped (commit 3fffd06) and is genuinely demo-able. The maintainer judged it an important feature worth featuring on the homepage. The visitor trigger is evaluating whether the baseline is worth installing.

## Current State

The homepage sells hooks/skills/workflow, but standup has zero marketing presence. A new capability that removes a real daily-ritual pain (reading changelog + git log + backlog by hand) is invisible to site visitors.

## Desired State

A dedicated /standup feature page (a docs.njk peer of memory.njk/swarm.njk) whose centerpiece is the REAL terminal readout as proof-by-demonstration, plus a compact homepage teaser between "How it flows" and "Adoption" linking to it, plus nav + footer + skills-catalog wiring so it is discoverable. Persuasion uses authority-via-competence and liking-via-shared-pain with demonstration as the hero move; no scarcity, urgency, FOMO, or unity. Copy is lowercase, plain, em-dash-free (Article X.1). The CTA is a low-friction click-to-copy /standup pill, no signup.

## Non Goals

- Not a generic features-page rewrite.
- Does not change standup skill behavior (already shipped in 3fffd06).
- No email capture, signup, or lead-gen.
- No scarcity or fake-urgency widgets.
- Not a redesign of the existing homepage sections.

## Solution Leakage

- Recorded, pre-decided with the user (not re-probed): placement = dedicated feature page + homepage teaser; scope = full page + teaser + skills-catalog entry. Both chosen explicitly by the user via AskUserQuestion this session.
- The design/copy/psychology direction was produced earlier this session by /marketing-psychology, /copywriting, and the /design-ui->impeccable plan; captured for traceability, treated as settled.
