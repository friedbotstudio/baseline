// Greenfield add-row anchoring (AC-013 of read-front-door-sweep).
//
// checkSystemDelta's `add` row check used to resolve an anchor against
// coverage.governedFiles, which is a disk walk — a greenfield directory matches
// nothing, so a spec could never declare a new element before its code existed.
// The row must instead resolve against the DECLARED governed surface
// (roots/codeExtensions/excludedTrees from project.json), never the filesystem.
//
// Contract row: anchorInGovernedSurface(anchor, {rootDir}) -> boolean, backed by
// anchorSurfaceVerdict(anchor, {rootDir}) -> {ok, reason}, reason one of
// 'outside-root' | 'undeclared-extension' | 'excluded' | null.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport } from './helpers/memory-fixtures.mjs';

const COVERAGE = '.claude/skills/workspace/coverage.mjs';
const LINT_MJS = '.claude/skills/spec-lint/lint.mjs';

const DELTA_HEADER = '| Verb | Element | Anchor | Concept | Kind |\n|---|---|---|---|---|';

function deltaTable(rows) {
  const body = rows
    .map((r) => `| ${r.verb} | ${r.elementId} | ${r.anchor} | ${r.concept} | ${r.kind} |`)
    .join('\n');
  return `${DELTA_HEADER}\n${body}`;
}

function specWithDelta(body) {
  return [
    '# Spec — delta greenfield fixture',
    '',
    '## Goal',
    '',
    'Fixture.',
    '',
    '## System delta',
    '',
    body,
    '',
    '## Acceptance criteria',
    '',
    '| ID | Criterion | Upstream AC | Sequence |',
    '|---|---|---|---|',
    '| AC-001 | given x when y then z | intake AC 1 | §Behavior #1 |',
    '',
  ].join('\n');
}

// A fresh tmpdir project whose declared governed surface has no code on disk yet —
// the exact shape a greenfield element declaration needs to pass.
function makeGovernedProject(surfaceOverrides = {}) {
  const { root } = makeProject();
  const pj = {
    memory: {
      architecture_map: {
        enabled: true,
        governed_surface: {
          roots: ['.claude/skills/'],
          codeExtensions: ['.mjs'],
          alwaysIncluded: [],
          excludedSegments: ['tests/'],
          excludedTrees: [],
          ...surfaceOverrides,
        },
      },
    },
  };
  writeFileSync(join(root, '.claude', 'project.json'), JSON.stringify(pj, null, 2), 'utf8');
  return { root, pj };
}

describe('AC-013 — an add anchor resolves against the declaration, not the disk', () => {
  it('test_when_add_anchor_names_absent_directory_inside_governed_root_then_row_passes', async () => {
    const lint = await tryImport(LINT_MJS);
    assert.ok(lint, `${LINT_MJS} does not exist`);
    const { root, pj } = makeGovernedProject();

    const spec = specWithDelta(deltaTable([
      {
        verb: 'add', elementId: 'roadmap-planner', anchor: '.claude/skills/roadmap/plan.mjs', concept: 'roadmap-planning', kind: 'c4_component',
      },
    ]));

    const [status, detail] = lint.checkSystemDelta(spec, pj, root);
    assert.equal(status, 'PASS', `expected PASS even though no file exists on disk yet; got ${status} — ${detail}`);
  });

  it('test_when_add_anchor_extension_undeclared_then_fail_names_the_extension_test', async () => {
    const lint = await tryImport(LINT_MJS);
    assert.ok(lint, `${LINT_MJS} does not exist`);
    const { root, pj } = makeGovernedProject();

    const spec = specWithDelta(deltaTable([
      {
        verb: 'add', elementId: 'roadmap-notes', anchor: '.claude/skills/roadmap/notes.txt', concept: 'roadmap-planning', kind: 'c4_component',
      },
    ]));

    const [status, detail] = lint.checkSystemDelta(spec, pj, root);
    assert.equal(status, 'FAIL', 'an undeclared extension must fail');
    assert.match(detail, /roadmap-notes|notes\.txt/, 'the failure must name the offending row');
    assert.match(detail, /extension/i, 'the failure must name the extension test, not a generic rejection');
  });

  it('test_when_add_anchor_under_excluded_tree_then_fail_names_the_exclusion_test', async () => {
    const lint = await tryImport(LINT_MJS);
    assert.ok(lint, `${LINT_MJS} does not exist`);
    const { root, pj } = makeGovernedProject({ excludedTrees: ['.claude/skills/impeccable/'] });

    const spec = specWithDelta(deltaTable([
      {
        verb: 'add', elementId: 'impeccable-helper', anchor: '.claude/skills/impeccable/helper.mjs', concept: 'design-review', kind: 'c4_component',
      },
    ]));

    const [status, detail] = lint.checkSystemDelta(spec, pj, root);
    assert.equal(status, 'FAIL', 'an anchor under a declared excludedTrees path must fail');
    assert.match(detail, /impeccable-helper|impeccable\/helper\.mjs/, 'the failure must name the offending row');
    assert.match(detail, /exclud/i, 'the failure must name the exclusion test, not a generic rejection');
  });

  it('test_when_add_anchor_outside_every_root_then_fail_names_the_root_test', async () => {
    const lint = await tryImport(LINT_MJS);
    assert.ok(lint, `${LINT_MJS} does not exist`);
    const { root, pj } = makeGovernedProject();

    const spec = specWithDelta(deltaTable([
      {
        verb: 'add', elementId: 'stray-doc', anchor: 'docs/foo.mjs', concept: 'docs-pipeline', kind: 'c4_component',
      },
    ]));

    const [status, detail] = lint.checkSystemDelta(spec, pj, root);
    assert.equal(status, 'FAIL', 'an anchor outside every declared root must fail');
    assert.match(detail, /stray-doc|docs\/foo\.mjs/, 'the failure must name the offending row');
    assert.match(detail, /root/i, 'the failure must name the governed-root test, not a generic rejection');
  });

  it('test_when_anchor_in_governed_surface_called_directly_then_predicate_is_exported', async () => {
    const coverage = await tryImport(COVERAGE);
    assert.ok(coverage, `${COVERAGE} does not exist`);
    assert.equal(
      typeof coverage.anchorInGovernedSurface,
      'function',
      'coverage.mjs must export anchorInGovernedSurface as a composed predicate',
    );
    const { root } = makeGovernedProject();

    // Absent on disk — proves the predicate resolves against the declaration, not a
    // walk. If it walked, this would come back false and the test would catch it.
    assert.equal(
      coverage.anchorInGovernedSurface('.claude/skills/roadmap/plan.mjs', { rootDir: root }),
      true,
      'an anchor inside a declared root, with a declared extension, and not excluded, must resolve true',
    );
    assert.equal(
      coverage.anchorInGovernedSurface('docs/foo.mjs', { rootDir: root }),
      false,
      'an anchor outside every declared root must resolve false',
    );
  });
});
