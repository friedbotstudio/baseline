# Add retry to webhook worker

<!--
Pre-feature intake snapshot fixture for brainstorm-and-codesign regression test.

This file represents the canonical output of the PRE-FEATURE /intake skill
(before the brainstorm helper landed). It is the baseline against which
intake-skip-brainstorm-regression.test.mjs asserts byte-identity when
workflow.json -> skip_brainstorm is true.

Synthesized fixture — not a real production intake. The shape mirrors the
intake/template.md skeleton exactly; the content is short and deterministic
so the regression diff is meaningful.
-->

## Problem

Webhook deliveries occasionally 5xx upstream and require manual replay by oncall. The pager fires for transient upstream errors that would heal on retry.

## Goal

Webhook deliveries retry transparently on 5xx upstream; oncall is paged only for the dead-letter queue.

## Non-goals

- Changing the webhook payload shape.
- Adding new metrics; existing `webhook.delivery_attempt` counter is reused.

## Success metrics

- Pager incidents tagged `webhook-5xx-transient` — baseline: 4/week, target: 0/week, measured via: oncall pager log.

## Stakeholders

- **Requester**: razieldecarte@gmail.com
- **Reviewer**: razieldecarte@gmail.com
- **Operator** (who runs it in prod): razieldecarte@gmail.com

## Constraints

- Must not increase upstream load — retry budget capped at 3 attempts.
- Must not change persistence schema; payload retries reuse existing job table.

## Acceptance criteria

1. Given a webhook delivery returns 502/503/504, when the worker receives the response, then the worker retries at 100ms / 200ms / 400ms backoff up to 3 attempts before dead-lettering.
2. Given retries exhaust, when the 4th attempt fails, then the job moves to the `webhook_dead_letter` queue and a single pager event fires.

## Open questions

- Should 429 responses also retry, or pass through unchanged?
