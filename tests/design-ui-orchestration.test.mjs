import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const REF_DIR       = join(ROOT, '.claude/skills/design-ui/references');
const ORCHESTRATION = join(REF_DIR, 'orchestration.md');
const STATE_MACHINE = join(REF_DIR, 'state-machine.md');

describe('design-ui — orchestration gates (AC-006)', () => {
  it('test_when_orchestration_md_exists_then_documents_3_iteration_loop_cap', async () => {
    const text = await readFile(ORCHESTRATION, 'utf8');
    // The cap is 3 — accept "3 iterations", "cap of 3", "three iterations", "iteration 3" near "cap".
    assert.match(
      text,
      /\b3\s*(?:iteration|loop|time|attempt|pass)|cap\D{0,20}3|three\s*iteration|iteration\s*3/i,
      'must document 3 as the iteration cap'
    );
    assert.match(text, /needs_human/, 'must mention needs_human terminal state on cap hit');
    assert.match(
      text,
      /(no|never|stop|terminate|will not|does not)[^.\n]{0,60}(fourth|4th|iteration\s*4)|iteration\s*3[^.\n]{0,80}(terminat|stop|halt|exit|surfac)/i,
      'must explicitly state no fourth iteration runs (or that iteration 3 terminates)'
    );
  });

  it('test_when_orchestration_md_then_documents_p0_blocking', async () => {
    const text = await readFile(ORCHESTRATION, 'utf8');
    assert.match(
      text,
      /P0[^.\n]{0,80}(block|deny|stop|surface|halt)/i,
      'must document that P0 issues block (rather than looping)'
    );
  });

  // AC-007 — caller-policy table has a mixed_brief row instructing fan-out per lane_split
  // and forbidding auto-invocation of /tdd or prose in the same tick.
  it('test_when_orchestration_md_then_has_mixed_brief_caller_policy_row', async () => {
    const text = await readFile(ORCHESTRATION, 'utf8');
    // Find a table row mentioning mixed_brief; the row must span the table-pipe delimiters,
    // so scan line-by-line for one starting with `|` and containing the keyword.
    const rowLines = text.split('\n').filter(line => /^\s*\|/.test(line) && /mixed_brief/.test(line));
    assert.ok(
      rowLines.length >= 1,
      'orchestration.md caller-policy table must include a row keyed on "mixed_brief"'
    );
    const row = rowLines.join('\n');
    assert.match(
      row,
      /lane_split/,
      'mixed_brief row must reference lane_split (the field the caller reads)'
    );
    assert.match(
      row,
      /fan[\s-]*out|per[\s-]*row|each row/i,
      'mixed_brief row must describe per-surface fan-out behavior'
    );
    assert.match(
      row,
      /do\s*NOT\s*auto[-\s]*invoke|do\s*not\s*auto[-\s]*invoke/i,
      'mixed_brief row must explicitly forbid auto-invoking /tdd or prose in this tick'
    );
  });
});

describe('design-ui — state machine (AC-007)', () => {
  it('test_when_state_machine_md_exists_then_documents_resume_logic', async () => {
    const text = await readFile(STATE_MACHINE, 'utf8');
    assert.match(text, /\bstep_index\b/, 'must mention step_index');
    assert.match(
      text,
      /skip[^.\n]{0,40}(completed|prior|done|earlier)|resume[^.\n]{0,40}step|previously[^.\n]{0,20}completed/i,
      'must describe the resume rule (skip completed steps / resume at step_index)'
    );
  });

  it('test_when_state_machine_md_then_documents_state_json_shape', async () => {
    const text = await readFile(STATE_MACHINE, 'utf8');
    const required = [
      'slug', 'started_at', 'intent', 'recipe',
      'step_index', 'invocations', 'verifications', 'state',
    ];
    const missing = required.filter(f => !new RegExp(`\\b${f}\\b`).test(text));
    assert.equal(
      missing.length,
      0,
      `state-machine.md must document all required state-file fields; missing: ${missing.join(', ')}`
    );
  });

  it('test_when_state_machine_md_then_documents_terminal_states', async () => {
    const text = await readFile(STATE_MACHINE, 'utf8');
    // AC-006 — mixed_brief joins the four pre-existing terminal states.
    for (const state of ['complete', 'needs_human', 'blocked', 'not_a_design_task', 'mixed_brief']) {
      assert.match(
        text,
        new RegExp(`\\b${state}\\b`),
        `state-machine.md must mention the "${state}" terminal state`
      );
    }
  });

  // AC-004 — re-invocation with the same slug returns the cached lane_split (sticky).
  it('test_when_state_machine_md_then_documents_mixed_brief_sticky_resume', async () => {
    const text = await readFile(STATE_MACHINE, 'utf8');
    assert.match(
      text,
      /mixed_brief[^.\n]{0,120}(sticky|cached|return the existing|delete the state)/i,
      'state-machine.md resume-logic must document mixed_brief as sticky-on-resume ' +
      '(mirroring the not_a_design_task rule)'
    );
  });
});
