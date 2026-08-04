// Ticket F — tracking comments (AC-008, AC-009, AC-010, AC-011).
//
// AC-011 defends spec decision D5, owner ENGINEER: Claude may propose
// load_bearing: with cited rationale, but the marker does not stick without
// engineer confirmation. That marker decides where annotations land in source, so
// an unaided wrong call either scatters comments or hides the ones that matter.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, makeProject, tryImport, writeShard, REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { readFileSync } from 'node:fs';

const REFS = '.claude/skills/workspace/refs.mjs';
const PLACEMENT = '.claude/skills/workspace/placement.mjs';

function seedDecision(memDir, key, fields = {}) {
  return writeShard(memDir, 'decisions', key, {
    key,
    fields: { governs: '.claude/skills/**', ...fields },
    bodyLines: ['- The corpus is authored, not inferred from code.'],
  });
}

describe('F — annotation resolution', () => {
  it('test_when_source_carries_decision_annotation_then_entry_resolves_and_hook_surfaced', async () => {
    const refs = await tryImport(REFS);
    assert.ok(refs, `${REFS} does not exist yet`);
    const { memDir } = makeProject();
    seedDecision(memDir, 'corpus-is-authored');

    const result = refs.resolveAnnotation(memDir, '@decision:corpus-is-authored');
    assert.equal(result.resolved, true, 'an annotation naming a live entry must resolve');
    assert.match(result.hook, /authored, not inferred/, 'the first hook line must be surfaced, not just a boolean');
  });

  it('test_when_annotation_names_deleted_entry_then_reported_unresolved_not_skipped', async () => {
    const refs = await tryImport(REFS);
    assert.ok(refs, `${REFS} does not exist yet`);
    const { memDir } = makeProject();
    seedDecision(memDir, 'still-here');

    const result = refs.resolveAnnotation(memDir, '@decision:was-deleted');
    assert.equal(result.resolved, false, 'a dangling annotation must be reported');
    assert.equal(result.key, 'was-deleted', 'the report must name the missing key');
    assert.ok('resolved' in result, 'a dangling annotation must never be silently skipped');
  });
});

describe('F — placement gated on load_bearing', () => {
  it('test_when_entry_not_load_bearing_then_placement_declined', async () => {
    const placement = await tryImport(PLACEMENT);
    assert.ok(placement, `${PLACEMENT} does not exist yet`);
    const { memDir } = makeProject();
    seedDecision(memDir, 'absent-marker');
    seedDecision(memDir, 'explicit-false', { load_bearing: 'false' });
    seedDecision(memDir, 'explicit-true', { load_bearing: 'true' });

    assert.equal(placement.annotationPlacementAllowed(memDir, 'absent-marker'), false, 'absent load_bearing must decline');
    assert.equal(placement.annotationPlacementAllowed(memDir, 'explicit-false'), false, 'load_bearing:false must decline');
    assert.equal(placement.annotationPlacementAllowed(memDir, 'explicit-true'), true, 'load_bearing:true must allow');
  });

  // @kind:wiring — placement.mjs is policy nothing enforces unless code-structure
  // actually consults it. The gate must also be described as a GATE: a SKILL.md that
  // merely names the module leaves placement to judgement, which is the broad-
  // annotation failure AC-010 exists to prevent.
  it('test_when_code_structure_places_an_annotation_then_it_consults_the_load_bearing_gate', () => {
    const skill = readFileSync(join(REPO_ROOT, '.claude/skills/code-structure/SKILL.md'), 'utf8');
    assert.match(
      skill,
      /workspace\/placement\.mjs/,
      'code-structure/SKILL.md must consult placement.mjs — unenforced policy is not a gate',
    );
    assert.match(
      skill,
      /annotationPlacementAllowed/,
      'the placement decision must name the gate function, not just the module',
    );
    assert.match(
      skill,
      /proposeLoadBearing/,
      'the propose-only path must be documented so the marker is never set unaided (D5)',
    );
    assert.match(
      skill,
      /confirmed:\s*true/,
      'the engineer-confirmation requirement must be explicit, not implied',
    );
  });

  it('test_when_load_bearing_proposed_without_engineer_confirmation_then_marker_not_written', async () => {
    const placement = await tryImport(PLACEMENT);
    assert.ok(placement, `${PLACEMENT} does not exist yet`);
    const { memDir } = makeProject();
    const shardPath = seedDecision(memDir, 'candidate');

    const unconfirmed = placement.proposeLoadBearing({
      memDir,
      key: 'candidate',
      rationale: 'governs a hook seam a maintainer would confidently break',
    });
    assert.equal(unconfirmed.written, false, 'an unconfirmed proposal must NOT write the marker (D5, owner engineer)');
    assert.ok(unconfirmed.rationale, 'the proposal must still carry its cited rationale for the engineer to judge');
    assert.ok(
      !/load_bearing:\s*true/.test(readFileSync(shardPath, 'utf8')),
      'the shard must be unchanged until the engineer confirms',
    );

    const confirmed = placement.proposeLoadBearing({
      memDir,
      key: 'candidate',
      rationale: 'governs a hook seam a maintainer would confidently break',
      confirmed: true,
    });
    assert.equal(confirmed.written, true, 'an engineer-confirmed proposal writes the marker');
    assert.match(readFileSync(shardPath, 'utf8'), /load_bearing:\s*true/, 'confirmed marker must land in frontmatter');
  });
});
