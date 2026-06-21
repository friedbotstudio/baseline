// spec_diagram_presence_guard write-set-gated gating — AC-003 / AC-004 (write-boundary)
//
// With compression on and a non-architectural write_set, a spec carrying only
// the reduced diagram set (c4_component+class+sequence+dependency_graph) is
// ALLOWED. With compression off, the same spec is DENIED (the full 6 kinds are
// required — byte-identical to today). Mirrors the hook harness in
// tests/spec-lint-design-calls.test.mjs. SUT: .claude/hooks/spec_diagram_presence_guard.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const HOOK = join(ROOT, '.claude/hooks/spec_diagram_presence_guard.mjs');

const NONARCH_PROFILE = {
  id: 'non-architectural',
  when: ['.claude/hooks/**', '.claude/skills/**', 'docs/**', '*.md', '.claude/*.json'],
  required_diagrams: {
    c4_component:     { min: 1, marker: '!include <C4/C4_Component>' },
    class:            { min: 1, any_of: ['^\\s*class\\s+\\w'] },
    sequence:         { min: 1, any_of: ['^\\s*participant\\b', '^\\s*actor\\b'] },
    dependency_graph: { min: 1, any_of: ["'\\s*@kind\\s+dependency-graph"] },
  },
};

// Clone the live project.json into a tmp root, forcing the compression flag.
async function makeProject({ enabled }) {
  const root = await mkdtemp(join(tmpdir(), 'diagram-profile-'));
  const live = JSON.parse(await readFile(join(ROOT, '.claude/project.json'), 'utf8'));
  const project = JSON.parse(JSON.stringify(live));
  project.artifacts = project.artifacts || {};
  project.artifacts.compression = { enabled };
  project.artifacts.diagram_profiles = [NONARCH_PROFILE];
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(join(root, '.claude/project.json'), JSON.stringify(project, null, 2) + '\n');
  await mkdir(join(root, 'docs/specs'), { recursive: true });
  return root;
}

// A spec body carrying ONLY the four reduced-profile diagram kinds (no C4
// Context, no C4 Container) plus a non-architectural write_set line.
function reducedDiagramSpec() {
  const fences = [
    '```plantuml\n@startuml\n!include <C4/C4_Component>\nContainer_Boundary(c, "c") { Component(cp, "cp", "t", "r") }\n@enduml\n```',
    '```plantuml\n@startuml\ntitle class\nclass Foo {\n +id: int\n}\n@enduml\n```',
    '```plantuml\n@startuml\ntitle Behavior #1\nactor A\nA -> A : x\n@enduml\n```',
    "```plantuml\n@startuml\n' @kind dependency-graph\n[a] --> [b]\n@enduml\n```",
  ].join('\n\n');
  return `# Spec — reduced\n\n## Goal\nx\n\n## Design\n\n${fences}\n\nwrite_set: \`.claude/skills/foo/SKILL.md\`\n\n## Acceptance criteria\n\n| ID | Criterion | Upstream AC | Sequence |\n|---|---|---|---|\n| AC-001 | x | intake AC 1 | §Behavior #1 |\n\n## Test plan\n\n| Category | Scenario | Expected | Covers |\n|---|---|---|---|\n| Golden path | x | y | AC-001 |\n`;
}

function runHook(root, content) {
  const payload = { tool_name: 'Write', tool_input: { file_path: join(root, 'docs/specs/example.md'), content } };
  return spawnSync('node', [HOOK], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root, HOOK_PAYLOAD: JSON.stringify(payload) },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

describe('spec_diagram_presence_guard write-set-gated profile', () => {
  it('test_when_flag_on_nonarch_reduced_spec_then_allows', async () => {
    const root = await makeProject({ enabled: true });
    try {
      const result = runHook(root, reducedDiagramSpec());
      assert.doesNotMatch(result.stdout || '', /"permissionDecision"\s*:\s*"deny"/,
        `flag-on reduced spec must be allowed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
      assert.equal(result.status, 0, 'allow path exits 0');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_flag_off_nonarch_reduced_spec_then_denies', async () => {
    const root = await makeProject({ enabled: false });
    try {
      const result = runHook(root, reducedDiagramSpec());
      assert.match(result.stdout || '', /"permissionDecision"\s*:\s*"deny"/,
        `flag-off must require all 6 diagrams (deny the 4-diagram spec)\nstdout:\n${result.stdout}`);
      assert.match(result.stdout || '', /c4_context|c4_container/i, 'deny reason names the missing C4 kinds');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
