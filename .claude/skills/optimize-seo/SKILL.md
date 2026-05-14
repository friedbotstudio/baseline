---
name: optimize-seo
description: "SEO + performance optimization orchestrator for the Friedbot Studio website. Drives a repeatable measure → diagnose → scope → fix → verify → commit loop. Use when performance scores drop, a PageSpeed audit surfaces issues, or before major traffic events. Trigger on: 'optimize the site', 'run a perf audit', 'fix pagespeed issues', 'improve core web vitals', 'check site performance'."
metadata:
  version: 1.0.0
  disable-model-invocation: true
---

# Optimize SEO — Performance & Accessibility Workflow

You are the SEO and performance optimization orchestrator. Your job is to take the site from a baseline measurement through diagnosis, targeted fixes, and verification — with repeatability and no guesswork.

This is the **parallel orchestrator to `/orchestrate`**. Where `/orchestrate` delivers new features (requirements → design → copy → build), `/optimize-seo` improves existing features (measure → diagnose → fix → verify).

## Workflow Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  1. MEASURE  │───▶│  2. DIAGNOSE │───▶│  3. SCOPE    │
│  PageSpeed    │    │  Root causes │    │  Fix plan    │
└─────────────┘    └─────────────┘    └─────────────┘
                                             │
┌─────────────┐    ┌─────────────┐    ┌──────▼──────┐
│  6. COMMIT   │◀───│  5. VERIFY   │◀───│  4. FIX      │
│  Ship it      │    │  Re-measure   │    │  Apply fixes │
└─────────────┘    └─────────────┘    └─────────────┘
```

**Never skip phases.** Never fix before diagnosing. Never ship without re-measuring.

---

## Task-Based Execution (mandatory)

At the start of every optimization cycle, create ALL tasks upfront using TaskCreate. Execute them strictly in order. Do not start a task until the previous one is marked complete.

### Task List Template

Create these tasks when starting a new cycle (replace `[scope]` with e.g. `home-page`, `site-wide`):

```
 1. [Measure] Create progress tracker at docs/progress/optimize-[scope].md
 2. [Measure] Run pagespeed.mjs for mobile + desktop, capture baseline scores
 3. [Measure] Run Playwright MCP to capture baseline screenshots (desktop 1280, tablet 768, mobile 375)
 4. [Diagnose] Invoke /pagespeed-insights to interpret the report and identify root causes
 5. [Diagnose] Invoke /nextjs-performance for framework-specific optimizations
 6. [Diagnose] Invoke /web-design-guidelines for accessibility audits
 7. [Diagnose] Cross-reference diagnosis against the codebase (Grep, Read) to confirm root causes
 8. [Scope] Draft fix plan in the progress tracker — batched by impact, with acceptance criteria
 9. [Scope] Get user approval on scope and batch order
10. [Fix] Execute fix batches in order — each batch pauses at a visual verification gate
11. [Verify] Re-run pagespeed.mjs for mobile + desktop, diff against baseline
12. [Verify] Re-run Playwright screenshots, compare against baseline — no visual regressions
13. [Verify] Invoke /simplify-code on all changed files
14. [Verify] Present before/after report to user, confirm acceptance criteria met
15. [Commit] Invoke /plan-commits
16. [Commit] Finalize progress tracker — mark all phases Done with completion dates
17. [Commit] Execute commits — REQUIRES USER APPROVAL (destructive action)
```

### Execution Rules

- **Mark each task complete immediately** after finishing it. Do not batch completions.
- **Do not skip tasks.** If a task is not applicable (e.g., no visual changes = skip screenshot diff), mark it complete with a note explaining why.
- **Task 1 creates the progress tracker**: Write `docs/progress/optimize-[scope].md` with all phases set to Pending. Update Measure to In Progress immediately.
- **Task 10 (Fix) is a parent task**: During scope (Task 8), break the fix plan into batches. For each batch, add child tasks dynamically via TaskCreate. Each batch must visually verify via Playwright before moving on.
- **Task 9 is a gate**: Present the scope document to the user and pause. Do not proceed until user approves the fix plan.
- **Task 14 is a gate**: Present the before/after report. Do not commit unless targets are met.
- **Task 17 MUST get explicit user approval** via AskUserQuestion before executing. This is destructive (git commits).

---

## Phase Details

### Phase 1: MEASURE
**Tasks**: 1-3

**Goal**: Establish a factual baseline. No guessing what's slow — measure it.

**Actions**:

1. Create the progress tracker file at `docs/progress/optimize-[scope].md` using the template in the Progress Tracking section. Set Measure to In Progress.
2. Run `node .claude/skills/optimize-seo/scripts/pagespeed.mjs --url=https://friedbotstudio.com --output=/tmp/psi-baseline.json`. Capture scores and failing audits for both mobile and desktop strategies.
3. Use **Playwright MCP** to capture screenshots at desktop (1280px), tablet (768px), and mobile (375px) widths. Save to `/tmp/screenshots-baseline/`.

**Required inputs**:
- `G_PAGESPEED_KEY` in `.env.local` (API key for PageSpeed Insights)
- Deployed live URL (default: `https://friedbotstudio.com`)

**Output**: Baseline scores + screenshots recorded in the progress tracker

---

### Phase 2: DIAGNOSE
**Tasks**: 4-7

**Goal**: Understand the root cause of every failing audit. Not the symptom — the cause.

**Actions**:

1. **(Task 4)** Invoke `/pagespeed-insights` — let the skill interpret the Lighthouse report, surface the most impactful issues, and explain what each audit measures.
2. **(Task 5)** Invoke `/nextjs-performance` — for any Next.js-specific findings (LCP, image optimization, RSC boundaries, bundle splitting, caching). This skill knows framework-level fixes.
3. **(Task 6)** Invoke `/web-design-guidelines` — for accessibility-related failures (contrast, heading hierarchy, focus states, ARIA).
4. **(Task 7)** Ground every diagnosis in code. Use Grep and Read to trace each failing audit to a specific file or pattern. Document file paths + line numbers in the progress tracker. If you cannot point to code, you do not have a root cause — keep investigating.

**Sub-skills invoked (mandatory):**

| Skill                    | Role                                               |
| ------------------------ | -------------------------------------------------- |
| `/pagespeed-insights`    | Interpret Lighthouse audits, prioritize fixes      |
| `/nextjs-performance`    | Next.js / React / Tailwind perf patterns           |
| `/web-design-guidelines` | Accessibility and UX best practices                |

**Output**: Root-cause map — for each failing audit, a concrete file/pattern reference

---

### Phase 3: SCOPE
**Tasks**: 8-9

**Goal**: A written, approved fix plan before any code changes.

**Actions**:

1. **(Task 8)** Draft the fix plan in the progress tracker. Structure:
   - Baseline scores
   - Target scores (explicit numbers)
   - Findings and root causes (with file references from Phase 2)
   - Fix plan, batched by impact (biggest wins first)
   - Acceptance criteria
   - Risks and mitigations
   - Out of scope
2. **(Task 9)** Present the scope document to the user. Pause for approval. Do not proceed to fixes until user confirms batch order and acceptance criteria.

**Gate (Task 9)**: User approves the scope document before any code changes.

---

### Phase 4: FIX
**Tasks**: 10 (with dynamic child tasks)

**Goal**: Execute fixes in batches. Each batch is independently verifiable.

**Actions**:

1. For each batch in the approved scope:
   - Create child tasks via TaskCreate for the specific fixes in the batch
   - Execute the fixes in order
   - Use **Context7 MCP** for any library API lookups (do not rely on memory)
   - Use `/code-structure` for all component changes (enforced by PostToolUse hook)
   - After the batch, take a Playwright screenshot of affected pages at desktop + mobile
   - Compare against baseline screenshots — no visual regressions allowed
2. Mark each batch complete before starting the next.

**Sub-skills invoked (mandatory):**

| Skill                       | Role                                    |
| --------------------------- | --------------------------------------- |
| `/nextjs-performance`       | Applied during every fix for guidance   |
| `/code-structure`           | Enforced on every TSX/JSX edit (hook)   |
| `/tailwind-design-system`   | For any design token changes            |

**Tools invoked (mandatory):**

| Tool               | Role                              |
| ------------------ | --------------------------------- |
| **Context7 MCP**   | Live library documentation lookup |
| **Playwright MCP** | Visual verification per batch     |

**Output**: Implemented fixes, visual parity confirmed per batch

---

### Phase 5: VERIFY
**Tasks**: 11-14

**Goal**: Prove the fixes worked. No wishful thinking — measure.

**Actions**:

1. **(Task 11)** Re-run `pagespeed.mjs` with `--baseline=/tmp/psi-baseline.json` to get a diff. Save to `/tmp/psi-after.json`.
2. **(Task 12)** Re-run Playwright screenshots at 3 widths. Compare against `/tmp/screenshots-baseline/`. Flag any unexpected visual changes.
3. **(Task 13)** Invoke `/simplify-code` on all changed files. Fix any High/Medium confidence issues before committing.
4. **(Task 14)** Present a before/after report:
   - Scores table: baseline vs after, per category, per strategy
   - Specific audits that improved (and by how much)
   - Any audits that regressed (must be zero)
   - Visual verification: pass/fail
   - Code quality: pass/fail
   - Acceptance criteria met: yes/no
5. If acceptance criteria are NOT met, loop back to Phase 4 (Fix) with a new batch. Do not commit under-delivered work.

**Sub-skills invoked (mandatory):**

| Skill             | Role                        |
| ----------------- | --------------------------- |
| `/simplify-code`  | Code quality + refactoring  |

**Gate (Task 14)**: Acceptance criteria must be met before commit.

---

### Phase 6: COMMIT
**Tasks**: 15-17

**Goal**: Clean, conventional commits and a finalized progress tracker.

**Actions**:

1. **(Task 15)** Invoke `/plan-commits` — audit `.gitignore`, group changes into logical commits, run pre-commit checks.
2. **(Task 16)** Finalize the progress tracker — mark all phases Done with completion dates, attach the before/after report.
3. **(Task 17)** Execute commits. **REQUIRES EXPLICIT USER APPROVAL.** Use AskUserQuestion to confirm before staging any files.

**Gate (Task 17)**: User explicitly approves before commits are executed.

---

## How to Use This Skill

### Starting a new optimization cycle

```
User: /optimize-seo the home page
```

The skill will:

1. Create the progress tracker at `docs/progress/optimize-home-page.md`
2. Create all 17 tasks upfront
3. Execute tasks in order, pausing at gates for approval

### Resuming work

```
User: /optimize-seo — where are we on the home page optimization?
```

Check the task list for current status. Also check `docs/progress/optimize-[scope].md`.

### Running a scheduled audit (no fixes)

```
User: /optimize-seo audit only
```

Run phases 1-2 only. Produce a baseline + diagnosis report. Stop before Scope.

---

## Progress Tracking

For each optimization cycle, maintain a progress file at `docs/progress/optimize-[scope].md`:

```markdown
# Performance Optimization — [Scope] — Progress

| Phase    | Status      | Date       | Notes            |
| -------- | ----------- | ---------- | ---------------- |
| Measure  | Done        | YYYY-MM-DD | Baseline captured |
| Diagnose | In Progress | —          | —                |
| Scope    | Pending     | —          | —                |
| Fix      | Pending     | —          | —                |
| Verify   | Pending     | —          | —                |
| Commit   | Pending     | —          | —                |

## Baseline Scores

| Category       | Mobile | Desktop |
| -------------- | ------ | ------- |
| Performance    | XX     | XX      |
| Accessibility  | XX     | XX      |
| Best Practices | XX     | XX      |
| SEO            | XX     | XX      |

## Target Scores
...

## Findings & Root Causes
...

## Fix Plan
...

## Acceptance Criteria
...

## Before/After (populated at Verify phase)
...
```

**Task 1 creates this file.** Task 16 finalizes it. Update phase statuses as you enter each phase.

---

## Rules

1. **Never fix without diagnosing** — guesswork burns time and introduces risk
2. **Every root cause must cite a file and/or line** — if you can't point to code, you don't have a root cause
3. **Every batch must visually verify** — perf wins that break the layout are regressions, not improvements
4. **Never commit without a before/after diff** — prove the fix worked
5. **Pause at gates** — scope approval (Task 9), verify report (Task 14), commit approval (Task 17)
6. **One scope at a time** — full site vs page-specific vs single-component. Don't mix.
7. **Sub-skill invocation is mandatory** — `/pagespeed-insights`, `/nextjs-performance`, `/web-design-guidelines`, `/simplify-code`, `/plan-commits` all have required invocation points
8. **Use Context7 MCP for library API lookups during Fix** — do not rely on training data for Next.js, React, Tailwind APIs
9. **Progress tracker is mandatory** — Task 1 creates it, Task 16 finalizes it before commits are executed

---

## Integration with `/orchestrate`

If a perf issue is discovered while delivering a new page, finish the `/orchestrate` cycle first. Run `/optimize-seo` as a separate follow-up cycle. Do not interleave.

If the same fix will ship alongside a new feature, scope it inside the `/orchestrate` Build phase, document it in the new page's progress tracker, and skip `/optimize-seo` for that cycle.
