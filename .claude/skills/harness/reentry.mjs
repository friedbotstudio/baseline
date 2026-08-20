// Domain — the sole writer of `workflow.json → attempts`.
//
// `attempts` is the one field the harness records by SKILL.md prose rather than by
// hook, and it is the one field never recorded once across 117 archived bundles.
// The archived timing research predicted this when it chose a deterministic hook
// over a model-appended log: a prose-driven record "is written by the model
// following SKILL.md prose; a missed/misordered append silently corrupts the table."
//
// This module does NOT make the counter oracle-bound and cannot — `phase_timer`
// observes `completed[]`, and a re-entry never changes that array. What it removes
// is the multi-step hand edit: one named call replaces read-parse-increment-write,
// which is the step that was actually being skipped. The residual risk is recorded
// in the spec's Open questions rather than implied to be solved.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomic } from '../../hooks/lib/common.mjs';

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

// REJECT, never repair. Normalising a malformed slug would write to a different path
// than the caller named and hide the traversal at the one moment it is visible.
export function assertSafeSlug(slug) {
  if (typeof slug !== 'string' || !SAFE_SLUG.test(slug)) {
    throw new Error(`unsafe slug: ${JSON.stringify(slug)}`);
  }
  return slug;
}

const workflowPath = (rootDir) => join(rootDir, '.claude/state/workflow.json');

// The first RECORDED re-entry is the second entry, so the counter starts at 2. A 1
// here would mean the initial entry had been counted twice, and `retryLabels` would
// then emit an `attempt-1` row for a phase that never retried.
export function recordReentry({ rootDir, slug, phase } = {}) {
  assertSafeSlug(slug);
  if (typeof phase !== 'string' || phase.length === 0) throw new Error('recordReentry needs a phase');

  const path = workflowPath(rootDir);
  if (!existsSync(path)) return null;

  const workflow = JSON.parse(readFileSync(path, 'utf8'));
  const attempts = { ...(workflow.attempts ?? {}) };
  attempts[phase] = (attempts[phase] ?? 1) + 1;

  workflow.attempts = attempts;
  workflow.updated_at = Math.floor(Date.now() / 1000);
  // Atomic: this runs at re-entry, which is when the session is already unstable.
  writeJsonAtomic(path, workflow);

  return attempts[phase];
}

export function readAttempts({ rootDir }) {
  const path = workflowPath(rootDir);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')).attempts ?? {};
  } catch {
    return {};
  }
}
