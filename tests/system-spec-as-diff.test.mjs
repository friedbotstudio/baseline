// central-system-spec slice D — a spec is a diff against the central spec (AC-017, AC-018).
//
// `.claude/skills/spec/template.md:10-11` has declared this for a whole cycle:
// "Specs REFERENCE the corpus rather than re-deriving it." Nothing enforced it, so
// every spec redrew the same C4 — 1,158 declarations across 108 archived documents.
//
// Test 1 drives the guard as a SUBPROCESS on purpose. Where the satisfaction logic
// lives is an open implementation choice (write-set-profile.mjs is deliberately
// stdlib-only and must not import a skill helper), so pinning an internal function
// here would decide that question by accident.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = join(REPO_ROOT, '.claude/hooks/spec_diagram_presence_guard.mjs');

// Clone the live project.json so unrelated required keys stay satisfied; a minimal
// hand-rolled config fails other checks first and the test proves nothing.
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'as-diff-'));
  const project = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/project.json'), 'utf8'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude/project.json'), `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  mkdirSync(join(root, 'docs/specs'), { recursive: true });

  const specDir = join(root, 'docs', 'system');
  mkdirSync(join(specDir, 'elements'), { recursive: true });
  writeFileSync(
    join(specDir, 'elements', 'consent-gate-grant.md'),
    '---\nid: consent-gate-grant\nkind: component\ntitle: Consent marker writer\nanchor: .claude/hooks/consent_gate_grant.mjs\n---\n\nbody\n',
    'utf8',
  );
  return root;
}

// A spec whose architectural kinds are satisfied by REFERENCE rather than redrawn.
function specReferencing(ref) {
  const behavioural = [
    '```plantuml\n@startuml\ntitle Behavior #1\nactor A\nA -> A : x\n@enduml\n```',
    "```plantuml\n@startuml\n' @kind dependency-graph\n[a] --> [b]\n@enduml\n```",
    '```plantuml\n@startuml\ntitle class\nclass Foo {\n +id: int\n}\n@enduml\n```',
  ].join('\n\n');
  return `# Spec — referencing\n\n## Goal\nx\n\n## Design\n\n${ref}\n\n${behavioural}\n\nwrite_set: \`.claude/hooks/consent_gate_grant.mjs\`\n\n## Design calls\n\n*(none)*\n\n## Acceptance criteria\n\n| ID | Criterion | Kind | Upstream AC | Sequence |\n|---|---|---|---|---|\n| AC-001 | x | behavior | intake AC 1 | §Behavior #1 |\n\n## Test plan\n\n| Category | Scenario | Expected | Covers |\n|---|---|---|---|\n| Golden path | x | y | AC-001 |\n`;
}

function runGuard(root, content) {
  const payload = {
    tool_name: 'Write',
    tool_input: { file_path: join(root, 'docs/specs/example.md'), content },
  };
  return spawnSync('node', [HOOK], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root, HOOK_PAYLOAD: JSON.stringify(payload) },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

describe('D — a spec satisfies a diagram kind by referencing the corpus', () => {
  it('test_when_spec_references_existing_element_then_kind_satisfied', () => {
    const root = makeProject();

    // The guard ALWAYS exits 0; a refusal is `"permissionDecision":"deny"` on stdout.
    const denied = (result) => /"permissionDecision"\s*:\s*"deny"/.test(result.stdout || '');

    const resolvable = runGuard(root, specReferencing('@ref element:consent-gate-grant'));
    assert.equal(denied(resolvable), false,
      `a resolvable corpus reference must satisfy the structural kinds; guard said: ${resolvable.stdout}`);

    const dangling = runGuard(root, specReferencing('@ref element:no-such-element'));
    assert.equal(denied(dangling), true, 'a reference to an element that does not exist must be refused');
    assert.match(dangling.stdout || '', /no-such-element/,
      'the refusal must name the unresolvable reference, not merely report a missing diagram');
  });

  it('test_when_reference_malformed_then_full_diagram_set_required', async () => {
    const mod = await import(resolve(REPO_ROOT, '.claude/hooks/lib/write-set-profile.mjs'));
    const { resolveProfile } = mod;

    // A NON-sensitive write_set, deliberately: `.claude/hooks/**` is in
    // security.sensitive_globs, so resolveProfile short-circuits to the full set
    // before any reference logic runs and the assertion would hold vacuously. Only
    // a reducible write_set proves the malformed reference is what forced the
    // fallback.
    const reducible = (ref) => specReferencing(ref)
      .replace('write_set: `.claude/hooks/consent_gate_grant.mjs`', 'write_set: `.claude/skills/foo/SKILL.md`');

    const live = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/project.json'), 'utf8'));
    // The function's own parameter, injected — config, not an internal-module mock.
    const projectGet = (path) => {
      const key = path.replace(/^\./, '');
      return key.split('.').reduce((node, part) => (node == null ? undefined : node[part]), live);
    };
    const fullSet = projectGet('.artifacts.required_diagrams.spec');

    for (const malformed of ['@ref element:', '@ref element', '@ref  :', '@ref element:../../etc/passwd']) {
      const content = reducible(malformed);
      let profile;
      assert.doesNotThrow(() => { profile = resolveProfile(content, projectGet); },
        `a malformed reference must not throw: ${JSON.stringify(malformed)}`);
      assert.deepEqual(profile.required_diagrams, fullSet,
        `a malformed reference must fall back to the FULL set: ${JSON.stringify(malformed)}`);
    }
  });
});
