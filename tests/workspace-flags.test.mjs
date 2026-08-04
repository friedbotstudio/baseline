// Feature flags for the workspace corpus (AC-003, AC-004).
//
// Both flags default OFF. Seeding makes the corpus non-empty, and at that instant
// every scout run would switch from discovery to reconcile — for consumers too,
// with no opt-out. These flags make that a deliberate per-project choice
// (spec decision D5, owner engineer).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { tryImport, REPO_ROOT } from './helpers/memory-fixtures.mjs';

const FLAGS = '.claude/skills/workspace/flags.mjs';

// One consumer, four lines: extracting this into a shared helper would be
// premature (laziness ladder rung 5).
function projectWith(config) {
  const root = mkdtempSync(join(tmpdir(), 'wsflags-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  if (config !== undefined) {
    writeFileSync(join(root, '.claude', 'project.json'), config, 'utf8');
  }
  return root;
}

describe('workspace flag (AC-003, AC-004)', () => {
  it('test_when_workspace_flag_true_then_enabled', async () => {
    const flags = await tryImport(FLAGS);
    assert.ok(flags, `${FLAGS} does not exist yet`);
    const root = projectWith(JSON.stringify({ memory: { workspace: { enabled: true } } }));
    assert.equal(flags.workspaceEnabled({ rootDir: root }), true);
  });

  it('test_when_workspace_flag_absent_or_false_then_disabled', async () => {
    const flags = await tryImport(FLAGS);
    assert.ok(flags, `${FLAGS} does not exist yet`);

    const cases = [
      ['{}', 'absent key'],
      [JSON.stringify({ memory: { workspace: { enabled: false } } }), 'explicit false'],
      [JSON.stringify({ memory: { workspace: { enabled: null } } }), 'null'],
      [JSON.stringify({ memory: { workspace: { enabled: 'true' } } }), 'string "true" is not the boolean'],
    ];
    for (const [config, label] of cases) {
      const root = projectWith(config);
      assert.equal(
        flags.workspaceEnabled({ rootDir: root }),
        false,
        `${label} must resolve false — an opt-in feature stays off unless the config strictly says otherwise`,
      );
    }
  });

  it('test_when_project_json_unreadable_then_flags_false', async () => {
    const flags = await tryImport(FLAGS);
    assert.ok(flags, `${FLAGS} does not exist yet`);

    const missing = projectWith(undefined);
    const malformed = projectWith('{ not valid json');
    for (const root of [missing, malformed]) {
      assert.doesNotThrow(() => flags.workspaceEnabled({ rootDir: root }));
      assert.equal(flags.workspaceEnabled({ rootDir: root }), false);
      assert.equal(flags.annotationsEnabled({ rootDir: root }), false);
    }
  });

  it('test_when_annotations_flag_absent_then_disabled', async () => {
    const flags = await tryImport(FLAGS);
    assert.ok(flags, `${FLAGS} does not exist yet`);
    // Only the workspace flag is set — the annotations flag must not inherit it.
    const root = projectWith(JSON.stringify({ memory: { workspace: { enabled: true } } }));
    assert.equal(flags.workspaceEnabled({ rootDir: root }), true);
    assert.equal(flags.annotationsEnabled({ rootDir: root }), false, 'the two flags are independent');
  });
});

// @kind:wiring — the four tests above exercise the READER. A flag nothing calls
// gates nothing, which is the same orphan shape as document-gate shipping without
// its receipt producer. AC-003/AC-004 are claims about scout's behavior, so the
// consumer is what has to be asserted.
describe('flags are actually consulted (AC-003, AC-004)', () => {
  it('test_when_scout_reconciles_then_it_consults_the_workspace_flag', () => {
    const skill = readFileSync(join(REPO_ROOT, '.claude/skills/scout/SKILL.md'), 'utf8');

    assert.match(
      skill,
      /workspaceEnabled|memory\.workspace\.enabled/,
      'scout must consult the workspace flag — an unconsulted flag gates nothing',
    );
    const gateAt = skill.search(/workspaceEnabled|memory\.workspace\.enabled/);
    const callAt = skill.indexOf('workspace/reconcile.mjs');
    assert.ok(callAt > 0, 'sanity: scout still invokes reconcile.mjs');
    assert.ok(
      gateAt < callAt,
      'the flag must be checked BEFORE the reconcile call, not merely mentioned somewhere in the file',
    );
  });

  it('test_when_code_structure_places_an_annotation_then_it_consults_the_annotations_flag', () => {
    const skill = readFileSync(join(REPO_ROOT, '.claude/skills/code-structure/SKILL.md'), 'utf8');

    assert.match(
      skill,
      /annotationsEnabled|memory\.annotations\.enabled/,
      'code-structure must consult the annotations flag before placing anything',
    );
    assert.match(
      skill,
      /annotationPlacementAllowed/,
      'sanity: the load_bearing gate from the prior cycle must still be documented',
    );
  });
});
