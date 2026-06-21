// compression flag-off parity — AC-002 (opt-out byte-identical)
//
// With artifacts.compression.enabled === false, resolveProfile returns the full
// required_diagrams.spec set for EVERY write_set — the diagram-presence behavior
// is byte-identical to the pre-feature baseline. Mirrors the parity-test shape of
// tests/spec-codesign-off-regression.test.mjs. SUT: .claude/hooks/lib/write-set-profile.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUT = path.join(HERE, '../.claude/hooks/lib/write-set-profile.mjs');

const FULL_DIAGRAMS = {
  c4_context:       { min: 1, marker: '!include <C4/C4_Context>' },
  c4_container:     { min: 1, marker: '!include <C4/C4_Container>' },
  c4_component:     { min: 1, marker: '!include <C4/C4_Component>' },
  sequence:         { min: 1, any_of: ['^\\s*participant\\b', '^\\s*actor\\b'] },
  class:            { min: 1, any_of: ['^\\s*class\\s+\\w'] },
  dependency_graph: { min: 1, any_of: ["'\\s*@kind\\s+dependency-graph"] },
};
const NONARCH_PROFILE = {
  id: 'non-architectural',
  when: ['.claude/hooks/**', '.claude/skills/**', 'docs/**', '*.md', '.claude/*.json'],
  required_diagrams: { c4_component: FULL_DIAGRAMS.c4_component, class: FULL_DIAGRAMS.class },
};

function fakeProjectGet(config) {
  return (dotted) => dotted.replace(/^\./, '').split('.').reduce(
    (node, key) => (node == null ? undefined : node[key]), config,
  );
}
const projectGetOff = fakeProjectGet({
  artifacts: {
    compression: { enabled: false },
    diagram_profiles: [NONARCH_PROFILE],
    required_diagrams: { spec: FULL_DIAGRAMS },
  },
  tdd: { source_globs: ['src/**', '.claude/hooks/**', '.claude/skills/**'], ui_globs: ['app/**'] },
});

const WRITE_SETS = [
  'write_set: `.claude/hooks/foo.mjs`',
  'write_set: `.claude/skills/bar/SKILL.md`',
  'write_set: `docs/notes.md`',
  'write_set: `src/foo.js`',
  '(no write_set line)',
];

describe('compression flag-off parity (AC-002)', () => {
  it('test_when_flag_off_then_resolveprofile_is_full_for_every_writeset', async () => {
    const { resolveProfile } = await import(SUT);
    for (const ws of WRITE_SETS) {
      const out = resolveProfile(`# Spec\n\n## Design\n\n${ws}\n`, projectGetOff);
      assert.equal(out.id, 'full', `flag-off must be full for write_set: ${ws}`);
      assert.deepEqual(out.required_diagrams, FULL_DIAGRAMS,
        `flag-off required_diagrams must byte-match the full set for: ${ws}`);
    }
  });
});
