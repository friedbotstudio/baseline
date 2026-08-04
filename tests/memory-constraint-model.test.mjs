// Ticket B — constraint model. Covers AC-004 and AC-010 of
// docs/specs/living-system-model-abcd.md (§Behavior #2).
//
// A constraint is a first-class node with a lifecycle distinct from a decision's:
// mutable and re-verifiable where a decision is immutable and superseded. The edge
// that earns the eighth category is invalidation — when a constraint's `state`
// flips, every decision whose `rests_on` names it becomes suspect.
//
// RED until .claude/memory/constraints/ is registered and the invalidation walk
// exists.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { makeProject, writeShard, tryImport } from './helpers/memory-fixtures.mjs';

const CONSTRAINTS_MODULE = '.claude/skills/memory-index/constraints.mjs';
const CATEGORIES_MODULE = '.claude/skills/memory-index/categories.mjs';

function seedConstraintGraph() {
  const project = makeProject();
  writeShard(project.memDir, 'constraints', 'no-jvm', {
    key: 'no-jvm',
    fields: { state: 'true', 'state_verified_at': 'abc1234' },
    bodyLines: ['- Constraint: this repo has no JVM available.'],
  });
  writeShard(project.memDir, 'decisions', 'plantuml-advisory', {
    key: 'plantuml-advisory',
    fields: { rests_on: 'no-jvm', load_bearing: 'true' },
    bodyLines: ['- Decision: plantuml_syntax_guard is advisory by default.'],
  });
  writeShard(project.memDir, 'decisions', 'structurizr-semantics-only', {
    key: 'structurizr-semantics-only',
    fields: { rests_on: 'no-jvm', load_bearing: 'true' },
    bodyLines: ['- Decision: adopt Structurizr semantics, reject the dependency.'],
  });
  writeShard(project.memDir, 'decisions', 'unrelated-decision', {
    key: 'unrelated-decision',
    fields: { load_bearing: 'false' },
    bodyLines: ['- Decision: unrelated to the JVM constraint.'],
  });
  return project;
}

describe('constraint model (ticket B)', () => {
  it('test_when_constraint_state_flips_then_dependent_decisions_surface_as_suspect', async () => {
    const project = seedConstraintGraph();
    try {
      const mod = await tryImport(CONSTRAINTS_MODULE);
      assert.ok(mod, `${CONSTRAINTS_MODULE} must exist and export the invalidation walk`);

      const suspects = mod.decisionsRestingOn(project.memDir, 'no-jvm');
      const keys = suspects.map((entry) => entry.key).sort();

      assert.deepEqual(
        keys,
        ['plantuml-advisory', 'structurizr-semantics-only'],
        'every decision whose rests_on names the flipped constraint is surfaced as suspect (AC-004)',
      );
      assert.ok(
        !keys.includes('unrelated-decision'),
        'a decision that does not rest on the constraint is left untouched (AC-004)',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_constraint_written_before_category_registered_then_rejected', async () => {
    const project = makeProject();
    try {
      const categories = await tryImport(CATEGORIES_MODULE);
      assert.ok(categories, `${CATEGORIES_MODULE} must exist`);

      const mod = await tryImport(CONSTRAINTS_MODULE);
      assert.ok(mod, `${CONSTRAINTS_MODULE} must exist`);

      // Simulate the preflight condition: the category is not registered.
      const unregistered = categories.CANONICAL.filter((name) => name !== 'constraints');

      assert.throws(
        () => mod.writeConstraint(project.memDir, 'orphan', { state: true }, { canonical: unregistered }),
        /constraints/,
        'a constraint write must be REJECTED while the category is unregistered, not written to an unindexed directory (AC-010, rollout prerequisite P1)',
      );

      const dir = join(project.memDir, 'constraints');
      const written = existsSync(dir) ? readdirSync(dir) : [];
      assert.deepEqual(written, [], 'nothing may reach disk when the category is unregistered (AC-010)');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
});
