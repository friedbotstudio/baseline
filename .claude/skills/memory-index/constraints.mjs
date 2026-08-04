// Domain — the constraint node and the invalidation edge that earns it a category
// of its own (spec ticket B, epic decision D2).
//
// A constraint and a decision have different lifecycles. A decision is immutable
// and expires by supersession. A constraint is MUTABLE: its `state` flips when the
// world changes, and `state_verified_at` records when that was last checked. That
// difference is the whole reason `constraints` is an eighth category rather than a
// field on decisions — a constraint shared by five decisions would otherwise be
// written five times, and a flip would have no single home to record it in.
//
// The edge that pays for the category is invalidation: when a constraint flips,
// every decision whose rationale rests on it becomes suspect. Without a first-class
// node there is nowhere for that walk to start.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CANONICAL, asList } from './categories.mjs';
import { resolveCategory } from './lift-fields.mjs';
import { assertSafeFactKey, assertSafeFieldValue } from './migrate.mjs';

export class UnregisteredCategoryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnregisteredCategoryError';
  }
}

// Every decision whose `rests_on:` names this constraint. Read-only and
// shape-agnostic — resolveCategory normalizes flat and sharded stores, so this
// answers correctly on an unmigrated consumer install too.
export function decisionsRestingOn(memDir, constraintKey) {
  const { entries } = resolveCategory(memDir, 'decisions');
  return entries.filter((entry) => asList(entry.fields.rests_on).includes(constraintKey));
}

// Rollout prerequisite P1: a constraint may not be written before the category is
// registered, or it lands in a directory no reader walks — present on disk,
// invisible to the index, and silently absent from every lookup. Rejected, never
// repaired: writing it anyway is the failure this guards.
export function writeConstraint(memDir, key, fields = {}, { canonical = CANONICAL } = {}) {
  if (!canonical.includes('constraints')) {
    throw new UnregisteredCategoryError(
      'refusing to write a constraint: "constraints" is not registered in CANONICAL, '
      + 'so the entry would land in an unindexed directory (AC-010, rollout prerequisite P1)',
    );
  }
  // Reuse the store's existing key validator rather than adding a second one — an
  // unbounded key interpolates straight into frontmatter (security review F-5, the
  // same class as the ledger's F-3).
  assertSafeFactKey(key);
  const dir = join(memDir, 'constraints');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${key}.md`);
  writeFileSync(path, renderConstraint(key, fields), 'utf8');
  return path;
}

// `state` is coerced to a boolean so it cannot carry a newline; `key` is bounded by
// assertSafeFactKey. `state_verified_at` and `governs` were interpolated raw and
// forged real frontmatter fields — the same F-2 hole as writeElement, found here by
// probe during the living-system-model-ef review.
function renderConstraint(key, fields) {
  const verifiedAt = assertSafeFieldValue('state_verified_at', fields.state_verified_at ?? 'unverified');
  const governs = assertSafeFieldValue('governs', asList(fields.governs).join(','));
  const frontmatter = [
    `key: ${key}`,
    'category: constraints',
    `state: ${fields.state === true || String(fields.state) === 'true'}`,
    `state_verified_at: ${verifiedAt}`,
    `governs: ${governs}`,
  ];
  return `---\n${frontmatter.join('\n')}\n---\n\n${fields.body ?? ''}\n`;
}
