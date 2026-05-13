---
name: intake
owner: baseline
description: Draft a Workflow Phase 1 intake document capturing a new request — the problem, the desired outcome, constraints, and testable acceptance criteria. Use when a user brings a new feature, change, or investigation that doesn't yet have a spec. The output lives at `docs/intake/<slug>.md` and feeds `/scout`, `/research`, and `/spec` downstream.
---

# Intake — Workflow Phase 1

You are drafting an **intake document** — the earliest structured artifact in the workflow. Its job is to compress a conversation into a single file downstream phases can trust.

## Prerequisite

`.claude/state/workflow.json` exists (written by `/triage`) with `entry_phase` either `intake` or a later phase that lists `intake` in `exceptions`. If neither is true, stop and instruct the user to run `/triage` first.

## Inputs

- The user's request (in plain English, usually the first thing they said after triage).
- The `template.md` file next to this SKILL.md — the canonical structure to produce.

## Steps

1. Verify the prerequisite above.
2. Read `template.md` in this skill directory. Use it as the skeleton of the output — every heading must survive into the final document.
3. **Never write a section with placeholder text, "TBD", or fabricate content the user didn't state.** Either:
   - Ask the user a targeted question per section before writing it, OR
   - Leave the section empty except for a single bullet under **## Open questions** listing what you still need.
4. Derive the slug from the first non-trivial noun phrase in the request. Use kebab-case, lowercase, ≤ 40 chars. Example: "add retry to webhook worker" → `webhook-worker-retry`.
5. Write the populated intake to `docs/intake/<slug>.md`.
6. Append `"intake"` to `.claude/state/workflow.json` → `completed` and update `updated_at` (current epoch).
7. Tell the user: "Intake captured at `docs/intake/<slug>.md`. Open questions: N. Next: `/scout`." If the request is cross-functional or spans multiple systems, also suggest `/brd` before `/scout`.

## Drafting rules

- **Acceptance criteria must be testable.** A criterion that starts with "users should find it easy to…" is not testable — rewrite it as "given X, when user does Y, system does Z." If you cannot restate it testably, put it in **Open questions**.
- **Non-goals are not optional.** Every intake names at least one explicit non-goal. If the user says "everything is in scope," push back: the lack of non-goals is how scope creep starts.
- **Stakeholders must be concrete.** "Product", "Engineering", "Design" are roles. Name the specific person or team on the hook for each.
- **No stubs, no TODOs** (seed.md § Always Production Code). Unknown content goes in **Open questions**, not as placeholder prose.
- **Do not self-approve**; intake does not need approval in this workflow, but don't add "Status: Approved" lines — that's a spec-only concept and the spec_approval_guard will block it.

## What downstream phases expect

- `/scout` reads **Problem** and **Goal** to scope the codebase search.
- `/research` reads **Constraints** and **Acceptance criteria** to filter candidate solutions.
- `/spec` reads **Non-goals** to avoid re-expanding scope, and **Acceptance criteria** as the seed for the spec's own AC section.

Write for those downstream readers, not for the user re-reading it in isolation.
