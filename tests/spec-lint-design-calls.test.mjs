import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT    = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const LINT_SH = join(ROOT, '.claude/skills/spec-lint/lint.sh');
const HOOK_SH = join(ROOT, '.claude/hooks/spec_design_calls_guard.sh');

const UI_GLOBS         = ['app/**/*.{tsx,jsx}', '**/*.css'];
const UI_GLOBS_TARGET  = 'app/settings/page.tsx';
const BACKEND_TARGET   = 'src/api/orders.ts';

// Synthesizes a project root under tmpdir with a minimal .claude/project.json
// that lint.sh and the hook both read. Cloning the live project.json preserves
// the artifacts.required_sections + required_diagrams config those tools need.
async function makeProject({ uiGlobs }) {
  const root = await mkdtemp(join(tmpdir(), 'design-calls-spec-'));
  const live = JSON.parse(await readFile(join(ROOT, '.claude/project.json'), 'utf8'));
  const project = JSON.parse(JSON.stringify(live));
  project.tdd.ui_globs = uiGlobs;
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(join(root, '.claude/project.json'), JSON.stringify(project, null, 2) + '\n');
  await mkdir(join(root, 'docs/specs'), { recursive: true });
  return root;
}

// Build a minimal-but-spec-shaped fixture body: the required headings, the
// required diagram kinds (so other lint checks don't fail first), a write_set
// reference line, and optionally a populated `## Design calls` section.
function specBody({ writeSetPath, includeDesignCalls }) {
  const diagrams = [
    `\`\`\`plantuml
@startuml
!include <C4/C4_Context>
Person(u, "u", "r")
System(s, "s", "p")
Rel(u, s, "r")
@enduml
\`\`\``,
    `\`\`\`plantuml
@startuml
!include <C4/C4_Container>
System_Boundary(s, "s") { Container(c, "c", "t", "r") }
@enduml
\`\`\``,
    `\`\`\`plantuml
@startuml
!include <C4/C4_Component>
Container_Boundary(c, "c") { Component(cp, "cp", "t", "r") }
@enduml
\`\`\``,
    `\`\`\`plantuml
@startuml
title class fixture
class Foo {
  +id: int
}
@enduml
\`\`\``,
    `\`\`\`plantuml
@startuml
title Behavior #1 — fixture
actor A
A -> A : x
@enduml
\`\`\``,
    `\`\`\`plantuml
@startuml
' @kind dependency-graph
[a] --> [b]
@enduml
\`\`\``,
  ].join('\n\n');

  const designCallsSection = includeDesignCalls
    ? `\n## Design calls\n\n| Slug | Intent | Target files | Write set | Register | References |\n|---|---|---|---|---|---|\n| fixture-call | build a fixture surface | ${writeSetPath} | ${writeSetPath} | inherit | — |\n`
    : '';

  return `# Spec — fixture

## Goal
Test fixture.

## Design

${diagrams}

write_set: \`${writeSetPath}\`
${designCallsSection}
## Acceptance criteria

| ID | Criterion | Upstream AC | Sequence |
|---|---|---|---|
| AC-001 | given x when y then z | intake AC 1 | §Behavior #1 |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | x | y | AC-001 |
`;
}

function runLint(root, slug) {
  return spawnSync('bash', [LINT_SH, slug], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
}

function runHook(root, payload) {
  return spawnSync('bash', [HOOK_SH], {
    cwd: root,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR:  root,
      CLAUDE_PROJECT_ROOT: root,
      HOOK_PAYLOAD:        JSON.stringify(payload),
    },
    input:    JSON.stringify(payload),
    encoding: 'utf8',
  });
}

describe('spec-lint check_design_calls (AC-004 preflight)', () => {
  it('test_when_spec_lint_runs_on_ui_spec_without_design_calls_then_fails', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const slug = 'fixture-ui-no-design-calls';
      await writeFile(
        join(root, `docs/specs/${slug}.md`),
        specBody({ writeSetPath: UI_GLOBS_TARGET, includeDesignCalls: false }),
      );
      const result = runLint(root, slug);
      assert.notEqual(
        result.status, 0,
        `expected non-zero exit; got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assert.match(result.stdout, /design_calls/i, 'output must mention design_calls');
      assert.match(result.stdout, /FAIL/,           'output must mark FAIL');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_spec_lint_runs_on_ui_spec_with_design_calls_then_passes', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const slug = 'fixture-ui-with-design-calls';
      await writeFile(
        join(root, `docs/specs/${slug}.md`),
        specBody({ writeSetPath: UI_GLOBS_TARGET, includeDesignCalls: true }),
      );
      const result = runLint(root, slug);
      assert.equal(
        result.status, 0,
        `expected exit 0; got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assert.match(result.stdout, /design_calls\s+PASS/i, 'design_calls row must PASS');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_spec_lint_runs_on_non_ui_spec_without_design_calls_then_passes', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const slug = 'fixture-backend-no-design-calls';
      await writeFile(
        join(root, `docs/specs/${slug}.md`),
        specBody({ writeSetPath: BACKEND_TARGET, includeDesignCalls: false }),
      );
      const result = runLint(root, slug);
      assert.equal(
        result.status, 0,
        `expected exit 0; got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assert.match(
        result.stdout, /design_calls\s+(PASS|SKIP)/i,
        'design_calls row must PASS or SKIP when no UI files in write_set',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('spec_design_calls_guard hook (AC-004 write-boundary)', () => {
  it('test_when_hook_runs_on_ui_spec_without_design_calls_then_denies', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const specPath = join(root, 'docs/specs/example.md');
      const content = specBody({ writeSetPath: UI_GLOBS_TARGET, includeDesignCalls: false });
      const payload = {
        tool_name:  'Write',
        tool_input: { file_path: specPath, content },
      };
      const result = runHook(root, payload);
      assert.match(
        result.stdout || '',
        /"permissionDecision"\s*:\s*"deny"/,
        `expected deny\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assert.match(
        result.stdout || '',
        /design[_\s]calls|Design calls/i,
        'deny reason must mention Design calls',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('test_when_hook_runs_on_ui_spec_with_design_calls_then_allows', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const specPath = join(root, 'docs/specs/example.md');
      const content = specBody({ writeSetPath: UI_GLOBS_TARGET, includeDesignCalls: true });
      const payload = {
        tool_name:  'Write',
        tool_input: { file_path: specPath, content },
      };
      const result = runHook(root, payload);
      assert.equal(
        result.status, 0,
        `hook must exit 0 on allow; got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assert.doesNotMatch(
        result.stdout || '',
        /"permissionDecision"\s*:\s*"deny"/,
        'allow path must not contain a deny decision',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
