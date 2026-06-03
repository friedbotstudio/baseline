# Brainstorm brief — llm-assisted-memory-capture-routing

## Actor

Whoever resumes a thread of work — the next-session or post-/clear agent AND the human developer — plus the /memory-flush curation step that consumes captured candidates.

## Trigger

Three moments: (a) end-of-turn auto-capture (memory_stop); (b) session start / resume after /clear; (c) skill/command launches that inject SKILL.md and wrapper boilerplate into the transcript.

## Current State

memory_stop.mjs capture is pure anchored line-start regex (INTENT_TRIGGERS), so salient intent stated mid-sentence is dropped (the cf4a instruction itself was never captured). _resume.md is overwritten every turn, so a durable 'what we were working on + why' thread does not survive /clear. shelve_capture.mjs pushes every user-role event text as a verbatim cue with no noise filter, so SKILL.md bodies (prefixed 'Base directory for this skill:') and <command-name>/<system-reminder>/<local-command-> wrappers get captured as cues.

## Desired State

Salient decisions and intent are reliably captured regardless of phrasing or sentence position and land in the right _pending bucket (landmark/decision/open-question/backlog); a durable, curated thread restores real working context on resume; boilerplate no longer pollutes captured cues. When unsure, err toward capture-more — the human curates at /memory-flush.

## Non Goals

The existing canonical entry schema (landmarks/decisions/landmines/conventions/pending-questions/backlog shapes) stays unchanged — only how candidates are captured and routed into _pending changes. This is memory-capture only, NOT the baseline-v1 agent-team / thought-compiler epoch.

## Solution Leakage

Request is solution-rich: 'LLM-assisted capture pass', 'route to landmark/decision/open-question/backlog buckets', 'deterministic isBoilerplate noise filter lifted into lib/common.mjs', 'semantic decision-vs-boilerplate weighting'. Underlying need behind these: high-recall capture that survives phrasing, correct bucketing, clean cues, and durable resume context.
