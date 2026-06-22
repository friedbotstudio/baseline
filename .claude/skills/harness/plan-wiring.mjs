// plan-wiring (harness) — live-wiring (E; AC-009/AC-010) of the durable plan object
// into the harness loop as additive Tier-2 orchestration state.
//
// Same velocity class as checker-fanout / rightsize-gate: it adds NO phase and NO
// consent gate, so it needs no Article II/IV amendment. Gated by
// `velocity.durable_plan.enabled`; FAIL-OPEN — a disabled or unreadable config means
// no plan writes (exactly today's behavior). Goes live the first workflow AFTER the
// one that introduces it (introduction-workflow pattern).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPlan, readPlan, recordRevision, currentSnapshot } from './plan-store.mjs';

/** True iff velocity.durable_plan.enabled is set. Unreadable config → false (fail-open). */
export function isPlanWiringEnabled(rootDir) {
  try {
    const project = JSON.parse(readFileSync(join(rootDir ?? process.cwd(), '.claude/project.json'), 'utf8'));
    return !!(project.velocity && project.velocity.durable_plan && project.velocity.durable_plan.enabled);
  } catch {
    return false;
  }
}

/**
 * Plan-mode entry (post approve-spec): create the plan if absent, else return the
 * existing one (idempotent). Returns null when wiring is disabled (no plan writes).
 */
export async function ensurePlanAtPlanMode({ slug, rootDir, goal, tasklist, tier, ts }) {
  if (!isPlanWiringEnabled(rootDir)) return null;
  const existing = readPlan(slug, rootDir);
  if (existing) return existing;
  return createPlan({ slug, goal, tasklist: tasklist ?? [], tier: tier ?? 'internal-tool', rootDir, ts });
}

/**
 * On each phase completion: append a revision marking the transition, so the plan
 * carries an auditable phase trail (AC-009). No-op (null) when disabled or no plan
 * exists yet.
 */
export async function recordPhaseTransition({ slug, rootDir, phase, ts }) {
  if (!isPlanWiringEnabled(rootDir)) return null;
  const plan = readPlan(slug, rootDir);
  if (!plan) return null;
  return recordRevision(plan, currentSnapshot(plan), { author: 'harness', reason: `phase transition: ${phase}`, ts });
}
