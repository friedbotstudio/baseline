// project.json compression config — AC-002/004 (config presence + shape)
//
// The live .claude/project.json carries artifacts.compression.enabled === true
// (default ON, maintainer decision) and a non-architectural diagram profile that
// keeps c4_component+class+sequence+dependency_graph and drops the two C4 top
// levels. SUT: .claude/project.json (edited by the implement tick → RED until then).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_JSON = path.join(HERE, '../.claude/project.json');

async function loadProject() {
  return JSON.parse(await readFile(PROJECT_JSON, 'utf8'));
}
function nonArchProfile(profiles) {
  return profiles.find((p) => Array.isArray(p.when) && p.when.includes('.claude/skills/**'));
}

describe('project.json compression config', () => {
  it('test_when_projectjson_loaded_then_compression_enabled_true', async () => {
    const project = await loadProject();
    assert.equal(project.artifacts?.compression?.enabled, true,
      'artifacts.compression.enabled must default to true');
  });

  it('test_when_projectjson_loaded_then_nonarch_profile_drops_top_c4_keeps_rest', async () => {
    const project = await loadProject();
    const profiles = project.artifacts?.diagram_profiles;
    assert.ok(Array.isArray(profiles) && profiles.length > 0, 'diagram_profiles must be a non-empty array');
    const profile = nonArchProfile(profiles);
    assert.ok(profile, 'a non-architectural profile (when includes .claude/skills/**) must exist');
    assert.ok(profile.when.includes('.claude/skills/**'), 'profile.when must cover .claude/skills/**');
    assert.ok(!profile.when.includes('.claude/hooks/**'),
      'security fix: .claude/hooks/** is sensitive and must NOT be in the reduced profile when');
    const kept = Object.keys(profile.required_diagrams);
    for (const k of ['c4_component', 'class', 'sequence', 'dependency_graph']) {
      assert.ok(kept.includes(k), `non-arch profile must keep ${k}`);
    }
    assert.ok(!kept.includes('c4_context'), 'non-arch profile must drop c4_context');
    assert.ok(!kept.includes('c4_container'), 'non-arch profile must drop c4_container');
  });

  it('test_when_projectjson_loaded_then_existing_keys_intact', async () => {
    const project = await loadProject();
    // Sanity: the new keys live UNDER artifacts; pre-existing config is untouched.
    assert.ok(project.tdd?.ui_globs, 'tdd.ui_globs preserved');
    assert.ok(project.artifacts?.required_diagrams?.spec, 'artifacts.required_diagrams.spec preserved');
    assert.equal(typeof project.configured, 'boolean', 'top-level configured flag preserved');
  });
});
