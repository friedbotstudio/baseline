// write-set-profile resolver — AC-002/003/004 (unit, fail-open)
//
// resolveProfile(content, projectGet) extracts the spec write_set and returns
// {id, required_diagrams}: the non-architectural profile when every write_set
// path is covered by a profile's `when` globs and compression is on; the full
// diagram set otherwise (flag off, architectural write_set, no match, or any
// failure). SUT: .claude/hooks/lib/write-set-profile.mjs (not yet built → RED).

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
  required_diagrams: {
    c4_component:     FULL_DIAGRAMS.c4_component,
    class:            FULL_DIAGRAMS.class,
    sequence:         FULL_DIAGRAMS.sequence,
    dependency_graph: FULL_DIAGRAMS.dependency_graph,
  },
};

// A projectGet stub: maps dotted config paths to values from a plain config tree.
function fakeProjectGet(config) {
  return (dotted) => dotted.replace(/^\./, '').split('.').reduce(
    (node, key) => (node == null ? undefined : node[key]), config,
  );
}
function configWith({ enabled, profiles } = {}) {
  return {
    artifacts: {
      compression: enabled === undefined ? undefined : { enabled },
      diagram_profiles: profiles,
      required_diagrams: { spec: FULL_DIAGRAMS },
    },
    tdd: { source_globs: ['src/**', 'bin/**', '.claude/hooks/**', '.claude/skills/**'], ui_globs: ['app/**'] },
  };
}
const specWithWriteSet = (line) => `# Spec\n\n## Design\n\n${line}\n`;
const kinds = (resolved) => Object.keys(resolved.required_diagrams).sort();

describe('resolveProfile (write-set-gated diagram profile)', () => {
  it('test_when_flag_on_nonarch_writeset_then_reduced_profile', async () => {
    const { resolveProfile } = await import(SUT);
    const out = resolveProfile(
      specWithWriteSet('write_set: `.claude/hooks/foo.mjs`'),
      fakeProjectGet(configWith({ enabled: true, profiles: [NONARCH_PROFILE] })),
    );
    assert.equal(out.id, 'non-architectural');
    assert.deepEqual(kinds(out), ['c4_component', 'class', 'dependency_graph', 'sequence']);
    assert.ok(!('c4_context' in out.required_diagrams), 'c4_context must be dropped');
    assert.ok(!('c4_container' in out.required_diagrams), 'c4_container must be dropped');
  });

  it('test_when_flag_on_architectural_writeset_then_full_profile', async () => {
    const { resolveProfile } = await import(SUT);
    const out = resolveProfile(
      specWithWriteSet('write_set: `src/foo.js`'),
      fakeProjectGet(configWith({ enabled: true, profiles: [NONARCH_PROFILE] })),
    );
    assert.equal(out.id, 'full');
    assert.equal(kinds(out).length, 6, 'architectural write_set keeps all 6 diagrams');
  });

  it('test_when_garbled_writeset_then_full_profile_failopen', async () => {
    const { resolveProfile } = await import(SUT);
    const out = resolveProfile(
      '# Spec\n\n## Design\n\n(no write_set line here)\n',
      fakeProjectGet(configWith({ enabled: true, profiles: [NONARCH_PROFILE] })),
    );
    assert.equal(out.id, 'full', 'no extractable write_set must fail open to full');
    assert.equal(kinds(out).length, 6);
  });

  it('test_when_flag_off_then_full_profile', async () => {
    const { resolveProfile } = await import(SUT);
    const out = resolveProfile(
      specWithWriteSet('write_set: `.claude/hooks/foo.mjs`'),
      fakeProjectGet(configWith({ enabled: false, profiles: [NONARCH_PROFILE] })),
    );
    assert.equal(out.id, 'full', 'flag off must yield the full set regardless of write_set');
    assert.equal(kinds(out).length, 6);
  });

  it('test_when_profile_config_absent_then_full_profile', async () => {
    const { resolveProfile } = await import(SUT);
    const out = resolveProfile(
      specWithWriteSet('write_set: `.claude/hooks/foo.mjs`'),
      fakeProjectGet(configWith({ enabled: true, profiles: undefined })),
    );
    assert.equal(out.id, 'full', 'absent diagram_profiles must fail open to full without throwing');
    assert.equal(kinds(out).length, 6);
  });

  it('test_when_writeset_hits_sensitive_glob_then_full_profile', async () => {
    const { resolveProfile } = await import(SUT);
    const cfg = configWith({ enabled: true, profiles: [NONARCH_PROFILE] });
    cfg.security = { sensitive_globs: ['.claude/hooks/**', '**/auth/**'] };
    const out = resolveProfile(
      specWithWriteSet('write_set: `.claude/hooks/foo.mjs`'),
      fakeProjectGet(cfg),
    );
    assert.equal(out.id, 'full',
      'a write_set under a security-sensitive glob must force the full profile even when a profile would otherwise cover it');
    assert.equal(kinds(out).length, 6);
  });
});
