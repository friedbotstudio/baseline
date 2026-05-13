# RCA: <short incident name>

<!--
Root Cause Analysis. Produced by the `rca` skill.
Required sections (enforced by artifact_template_guard): Summary, Timeline,
Impact, Root cause, Action items.
Blameless by convention: describe systems and processes, not individuals.
-->

## Summary

<Two sentences. What broke, when, and whether it's resolved as of writing.>

## Timeline

<Wall-clock, one timezone (state which). Sourced from evidence. Every entry
links to a log / alert / commit / chat where possible.>

- `YYYY-MM-DD HH:MM TZ` — <event>. <link/evidence>
- `YYYY-MM-DD HH:MM TZ` — <event>. <link/evidence>
- `YYYY-MM-DD HH:MM TZ` — <event>. <link/evidence>

## Impact

<Quantified. Users affected with counting method. Duration precise.
Business/SLA/dollar impact or "none measurable".>

- **Users affected**: <count/estimate + method>
- **Duration**: <start → end, total minutes>
- **SLA impact**: <e.g., 23 minutes against 99.9% monthly error budget>
- **Business impact**: <dollars, or "none measurable">
- **Data impact**: <loss? corruption? none?>

## Detection

<How did we notice? Who/what raised the alarm? Was the detection time
acceptable? What would have made detection faster?>

## Root cause

<Single sentence. What was the underlying condition that, removed, would
have prevented this incident? If inconclusive, state so here and enumerate
candidates under Contributing factors.>

## Contributing factors

<Conditions that worsened the incident but are not the single root cause.>

- <factor>
- <factor>

## Resolution

<What was done to resolve it. Commands run, configs reverted, deploys. Link
the fix commit(s) if any.>

## What went well

<Behaviours/tools/practices that limited the blast radius or sped recovery.
These should persist.>

- <item>

## What could be improved

<Process gaps exposed by the incident.>

- <item>

## Action items

<Each has: a description, an owner (named person), a due date (absolute,
YYYY-MM-DD), and a status.>

- [ ] **AI-01** — <description>. Owner: <name>. Due: <YYYY-MM-DD>. Status: open.
- [ ] **AI-02** — <description>. Owner: <name>. Due: <YYYY-MM-DD>. Status: open.

## Links

<Incident ticket, deploy logs, dashboards, related commits, prior RCAs if
this is a recurrence.>

- <label>: <url>
