// T5a — /spec carries a Program design section (AC-013, AC-014).
//
// D-4 (spec): Program design is a REQUIRED `##` section wired into
// project.json -> artifacts.required_sections.spec, not a `###` under Design.
// artifact_template_guard reads that key, so a required heading is enforced at
// the write boundary; an advisory subsection is the kind of thing an author
// skips under time pressure, which is exactly when the design is worth writing.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, readFileSync, existsSync } from './helpers/memory-fixtures.mjs';
import { runPreToolUseHook, writeEditPayload } from './helpers/memory-git-fixtures.mjs';

const TEMPLATE = '.claude/skills/spec/template.md';
const GUARD = '.claude/hooks/artifact_template_guard.mjs';
const SECTION = 'Program design';

const REQUIRED_PARTS = [
  { label: 'Data access', pattern: /data access/i },
  { label: 'Call stack', pattern: /call stack/i },
  { label: 'Layout', pattern: /\blayout\b/i },
];

// Every required section EXCEPT the one under test, so the guard's denial can
// only be attributable to the missing Program design heading.
function specMissingProgramDesign() {
  return [
    '# Fixture spec',
    '## Goal', 'x',
    '## Design', 'x',
    '## Design calls', '- *(none)*',
    '## System delta', '- *(none)*',
    '## Acceptance criteria', '| ID |', '|---|', '| AC-001 |',
    '## Test plan', '| Category |', '|---|', '| Golden path |',
  ].join('\n\n');
}

function projectWithGuardConfig() {
  const root = mkdtempSync(join(tmpdir(), 'progdesign-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  mkdirSync(join(root, 'docs/specs'), { recursive: true });
  cpSync(join(REPO_ROOT, '.claude/project.json'), join(root, '.claude/project.json'));
  return root;
}

// The template is a 350-line document; assert.match would print all of it on a
// failure. These print only the claim.
function carries(text, pattern, message) {
  assert.ok(pattern.test(text), message);
}

describe('spec Program design section', () => {
  // AC-014 — the template teaches the three parts.
  it('test_when_spec_template_read_then_program_design_has_data_access_call_stack_and_layout', () => {
    const path = join(REPO_ROOT, TEMPLATE);
    assert.ok(existsSync(path), `${TEMPLATE} must exist`);
    const template = readFileSync(path, 'utf8');

    carries(
      template,
      new RegExp(`^##\\s+${SECTION}\\s*$`, 'im'),
      `${TEMPLATE} must carry a top-level "## ${SECTION}" heading — D-4 made it a required section, and a required section has to exist in the template an author copies`,
    );

    const body = template.slice(template.search(new RegExp(`^##\\s+${SECTION}\\s*$`, 'im')));
    const section = body.slice(0, body.indexOf('\n## ', 3) === -1 ? body.length : body.indexOf('\n## ', 3));

    for (const { label, pattern } of REQUIRED_PARTS) {
      carries(section, pattern, `the ${SECTION} section must name its "${label}" part`);
    }
    carries(
      section,
      /when it is load-bearing|only when load-bearing|if load-bearing|where it is load-bearing/i,
      'Call stack must be marked as required only when load-bearing — mandating a call stack for every one-frame edit is ceremony, not design',
    );
  });

  // AC-013 — the guard denies a spec without it.
  it('test_when_spec_lacks_program_design_heading_then_template_guard_denies', () => {
    const root = projectWithGuardConfig();
    try {
      const target = join(root, 'docs/specs/fixture.md');
      const res = runPreToolUseHook(GUARD, writeEditPayload(target, specMissingProgramDesign()), root);

      // A PreToolUse guard signals refusal through its decision JSON, not through
      // its exit code — it exits 0 and denies in the payload. Asserting on status
      // here would pass against a guard that allowed the write.
      const decision = JSON.parse(res.stdout).hookSpecificOutput;
      assert.equal(decision.permissionDecision, 'deny', 'artifact_template_guard must DENY a spec missing a required section');
      assert.match(
        decision.permissionDecisionReason,
        new RegExp(SECTION, 'i'),
        `the denial must NAME the missing section so the author knows what to add; got: ${decision.permissionDecisionReason.slice(0, 300)}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // AC-013 — the required-sections key is what the guard reads, so it must list it.
  it('test_when_project_config_read_then_required_sections_spec_lists_program_design', () => {
    const config = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/project.json'), 'utf8'));
    const sections = config?.artifacts?.required_sections?.spec;
    assert.ok(Array.isArray(sections), 'artifacts.required_sections.spec must be an array');
    assert.ok(
      sections.includes(SECTION),
      `"${SECTION}" must be in required_sections.spec — that key is what artifact_template_guard reads; a template heading with no config entry is advisory only. Got ${JSON.stringify(sections)}`,
    );
  });
});
