// brainstorm-and-codesign — AC-005 contract
//
// When workflow.json codesign_mode is true and a spec was written without a
// ## Decisions section, /spec-lint produces a finding. /spec-lint gains a
// Check #4 ("codesign-decisions-presence") that fires only when codesign_mode
// is true in workflow.json.
//
// SUT: .claude/skills/spec-lint/lint.mjs (gains Check #4)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const HERE = path.dirname(__filename);
const REPO_ROOT = path.resolve(HERE, '..');
const LINT = path.join(REPO_ROOT, '.claude/skills/spec-lint/lint.mjs');

const SPEC_WITHOUT_DECISIONS = `# Spec — foo
## Goal
do thing
## Design
prose
## Design calls
- *(none)*
## Acceptance criteria
| AC-001 | x | y | §Behavior #1 |
## Test plan
| Golden | a | b | AC-001 |
`;

const SPEC_WITH_DECISIONS = SPEC_WITHOUT_DECISIONS + `
## Decisions

### Decision: foo
**Chosen:** A
**Engineer rationale (verbatim):**
> picked A
`;

describe('spec-lint Check #4: codesign decisions presence (AC-005 contract)', () => {
  it('test_when_spec_codesign_mode_true_but_decisions_section_missing_then_speclint_flags', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'speclint-cs-'));
    try {
      await fs.mkdir(path.join(tmp, 'docs/specs'), { recursive: true });
      await fs.mkdir(path.join(tmp, '.claude/state'), { recursive: true });
      await fs.writeFile(path.join(tmp, 'docs/specs/foo.md'), SPEC_WITHOUT_DECISIONS);
      await fs.writeFile(path.join(tmp, '.claude/state/workflow.json'), JSON.stringify({
        slug: 'foo', track_id: 'intake-full', codesign_mode: true, completed: [], exceptions: [],
      }));

      let stderr = '';
      let exit = 0;
      try {
        execFileSync('node', [LINT, 'foo'], { cwd: tmp, env: { ...process.env, CLAUDE_PROJECT_DIR: tmp }, stdio: 'pipe' });
      } catch (e) {
        exit = e.status ?? 1;
        stderr = (e.stderr || '').toString() + (e.stdout || '').toString();
      }
      assert.notEqual(exit, 0, 'spec-lint must exit non-zero when codesign_mode=true and ## Decisions absent');
      assert.match(stderr, /[Dd]ecisions/, 'lint output names the missing Decisions section');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_spec_codesign_mode_true_and_decisions_section_present_then_speclint_passes_check4', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'speclint-cs-ok-'));
    try {
      await fs.mkdir(path.join(tmp, 'docs/specs'), { recursive: true });
      await fs.mkdir(path.join(tmp, '.claude/state'), { recursive: true });
      await fs.writeFile(path.join(tmp, 'docs/specs/foo.md'), SPEC_WITH_DECISIONS);
      await fs.writeFile(path.join(tmp, '.claude/state/workflow.json'), JSON.stringify({
        slug: 'foo', track_id: 'intake-full', codesign_mode: true, completed: [], exceptions: [],
      }));

      let out = '';
      let exit = 0;
      try {
        out = execFileSync('node', [LINT, 'foo'], { cwd: tmp, env: { ...process.env, CLAUDE_PROJECT_DIR: tmp }, stdio: 'pipe', encoding: 'utf8' });
      } catch (e) {
        // Other checks (diagrams, AC traceability) will fail on this synthetic spec; that's expected.
        // Check #4 specifically should NOT be among the failures.
        out = (e.stdout || '').toString() + (e.stderr || '').toString();
        exit = e.status ?? 1;
      }
      assert.ok(!/codesign[- ]decisions[- ]presence.*fail/i.test(out),
        'Check #4 must not fail when ## Decisions section is present');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('test_when_codesign_mode_false_then_speclint_does_not_run_check4', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'speclint-cs-off-'));
    try {
      await fs.mkdir(path.join(tmp, 'docs/specs'), { recursive: true });
      await fs.mkdir(path.join(tmp, '.claude/state'), { recursive: true });
      await fs.writeFile(path.join(tmp, 'docs/specs/foo.md'), SPEC_WITHOUT_DECISIONS);
      await fs.writeFile(path.join(tmp, '.claude/state/workflow.json'), JSON.stringify({
        slug: 'foo', track_id: 'intake-full', codesign_mode: false, completed: [], exceptions: [],
      }));

      let out = '';
      try {
        out = execFileSync('node', [LINT, 'foo'], { cwd: tmp, env: { ...process.env, CLAUDE_PROJECT_DIR: tmp }, stdio: 'pipe', encoding: 'utf8' });
      } catch (e) {
        out = (e.stdout || '').toString() + (e.stderr || '').toString();
      }
      assert.ok(!/codesign/i.test(out) || !/fail/i.test(out),
        'Check #4 is skipped (not run, not failed) when codesign_mode is false');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
