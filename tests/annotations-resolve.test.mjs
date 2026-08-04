// Ticket F — tracking comments (AC-008, AC-009, AC-010, AC-011).
//
// AC-011 defends spec decision D5, owner ENGINEER: Claude may propose
// load_bearing: with cited rationale, but the marker does not stick without
// engineer confirmation. That marker decides where annotations land in source, so
// an unaided wrong call either scatters comments or hides the ones that matter.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  join, makeProject, tryImport, writeShard, writeFlatCategory, snapshotTree, REPO_ROOT,
} from './helpers/memory-fixtures.mjs';
import { readFileSync, existsSync } from 'node:fs';

const REFS = '.claude/skills/workspace/refs.mjs';
const PLACEMENT = '.claude/skills/workspace/placement.mjs';
const CATEGORIES = '.claude/skills/memory-index/categories.mjs';

function seedDecision(memDir, key, fields = {}) {
  return writeShard(memDir, 'decisions', key, {
    key,
    fields: { governs: '.claude/skills/**', ...fields },
    bodyLines: ['- The corpus is authored, not inferred from code.'],
  });
}

function seedLandmine(memDir, key, fields = {}) {
  return writeShard(memDir, 'landmines', key, {
    key,
    fields: { governs: '.claude/skills/workspace/store.mjs', ...fields },
    bodyLines: ['- The trap: a gate can be fully built and called by nothing.'],
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

// Slice F delivery — the marker means the same thing wherever it sits (D1, owner
// engineer). Measured at triage: 23 markers on disk, of which only 3 are decisions.
// A gate reading one category left 20 of them authorising nothing.
describe('F — the load_bearing gate spans every canonical category (AC-004, AC-005, AC-006)', () => {
  it('test_when_landmine_carries_load_bearing_then_placement_allowed', async () => {
    const placement = await tryImport(PLACEMENT);
    assert.ok(placement, `${PLACEMENT} does not exist yet`);
    const { memDir } = makeProject();
    seedLandmine(memDir, 'gate-with-no-consumer', { load_bearing: 'true' });
    seedLandmine(memDir, 'merely-noted');

    assert.equal(
      placement.annotationPlacementAllowed(memDir, 'gate-with-no-consumer'),
      true,
      'a landmine marked load_bearing is precisely where a maintainer would confidently break something',
    );
    assert.equal(
      placement.annotationPlacementAllowed(memDir, 'merely-noted'),
      false,
      'widening the gate must not weaken it — an unmarked entry still declines',
    );
  });

  it('test_when_landmine_annotation_parsed_then_resolves_with_hook', async () => {
    const refs = await tryImport(REFS);
    assert.ok(refs, `${REFS} does not exist yet`);
    const { memDir } = makeProject();
    seedLandmine(memDir, 'gate-with-no-consumer', { load_bearing: 'true' });

    const result = refs.resolveAnnotation(memDir, '@landmine:gate-with-no-consumer');
    assert.equal(
      result.resolved,
      true,
      'widening the placement gate without widening the verb set would authorise an annotation no parser can read',
    );
    assert.match(result.hook, /built and called by nothing/, 'the hook line must be surfaced');
  });

  it('test_when_canonical_category_has_no_verb_then_assertion_throws_naming_it', async () => {
    const refs = await tryImport(REFS);
    assert.ok(refs, `${REFS} does not exist yet`);
    assert.equal(
      typeof refs.assertVerbMapTotal,
      'function',
      'the totality assertion must be exported so it can be exercised; a map that is merely correct today rots silently',
    );

    const categories = await tryImport(CATEGORIES);
    assert.doesNotThrow(
      () => refs.assertVerbMapTotal(categories.CANONICAL),
      'the shipped map must cover every canonical category',
    );
    assert.throws(
      () => refs.assertVerbMapTotal([...categories.CANONICAL, 'ninth-category']),
      /ninth-category/,
      'an unmapped category must fail LOUDLY and name itself — seven of nine surfaces failed silently when constraints was added',
    );
  });
});

describe('F — the marker write follows the entry, not a hardcoded directory (AC-007, AC-008)', () => {
  it('test_when_engineer_confirms_landmine_marker_then_written_to_landmines_not_decisions', async () => {
    const placement = await tryImport(PLACEMENT);
    assert.ok(placement, `${PLACEMENT} does not exist yet`);
    const { memDir } = makeProject();
    const shardPath = seedLandmine(memDir, 'gate-with-no-consumer');

    const result = placement.proposeLoadBearing({
      memDir,
      key: 'gate-with-no-consumer',
      rationale: 'governs a seam four cycles broke in a row',
      confirmed: true,
    });

    assert.equal(result.written, true);
    assert.match(readFileSync(shardPath, 'utf8'), /load_bearing:\s*true/, 'the marker lands in the entry that owns it');
    assert.equal(
      existsSync(join(memDir, 'decisions', 'gate-with-no-consumer.md')),
      false,
      'a widened read gate with an unwidened write target silently fabricates a decisions shard',
    );
  });

  it('test_when_confirmed_is_truthy_but_not_boolean_true_then_refused', async () => {
    const placement = await tryImport(PLACEMENT);
    assert.ok(placement, `${PLACEMENT} does not exist yet`);
    const { memDir } = makeProject();
    const shardPath = seedLandmine(memDir, 'candidate-landmine');

    for (const confirmed of [1, 'true', {}, 'yes']) {
      const result = placement.proposeLoadBearing({
        memDir, key: 'candidate-landmine', rationale: 'r', confirmed,
      });
      assert.equal(
        result.written,
        false,
        `confirmed: ${JSON.stringify(confirmed)} must be refused — a gate that accepts a truthy accident is not a gate`,
      );
      // Without this the test passes vacuously against the decisions-only gate: the
      // landmine is simply never found, so the confirmation check never runs and a
      // green result proves nothing about the thing under test.
      assert.match(
        String(result.reason),
        /confirmation/i,
        `the refusal must be ABOUT confirmation, not a lookup miss (got: ${result.reason})`,
      );
    }
    assert.ok(!/load_bearing:\s*true/.test(readFileSync(shardPath, 'utf8')), 'the shard stays unmarked');
  });

  it('test_when_key_is_path_shaped_then_rejected_before_any_path_is_constructed', async () => {
    const placement = await tryImport(PLACEMENT);
    assert.ok(placement, `${PLACEMENT} does not exist yet`);
    const { memDir } = makeProject();
    seedDecision(memDir, 'innocent');
    const before = snapshotTree(memDir);

    assert.throws(
      () => placement.proposeLoadBearing({
        memDir,
        key: '.claude/skills/workspace/placement.mjs:1',
        rationale: 'landmark keys are paths',
        confirmed: true,
      }),
      /REJECT, never normalize/,
      'F-1 (CWE-22) stays closed: a path-shaped key is rejected, never repaired into something writable',
    );
    assert.deepEqual(snapshotTree(memDir), before, 'nothing may be written anywhere on the reject path');
  });

  it('test_when_store_is_flat_then_propose_reports_rather_than_throwing', async () => {
    const placement = await tryImport(PLACEMENT);
    assert.ok(placement, `${PLACEMENT} does not exist yet`);
    const { memDir } = makeProject();
    writeFlatCategory(memDir, 'decisions', [
      { key: 'flat-entry', bodyLines: ['- Lives in a flat file, not a shard.'] },
    ]);

    let result;
    assert.doesNotThrow(() => {
      result = placement.proposeLoadBearing({
        memDir, key: 'flat-entry', rationale: 'r', confirmed: true,
      });
    }, 'a flat store must not throw ENOENT on a sharded path that was never going to exist');
    assert.equal(result.written, false);
    assert.match(String(result.reason), /flat/i, 'the refusal must name why, so the caller can act on it');
  });
});
