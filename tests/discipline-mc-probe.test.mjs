// A3 — discipline.mjs multiple-choice probe ban. RED until scanTurn flags
// multiple-choice framing as 'multiple-choice-probe'. Existing violations must
// still fire (no regression).
// Covers: AC-301 (mc framing flagged), AC-302 (open question passes), AC-303
// (existing solution-verb/library violations still fire).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DISC = join(REPO_ROOT, '.claude/skills/brainstorm/discipline.mjs');

const cats = (v) => v.map((x) => x.category);

describe('A3 multiple-choice probe ban', () => {
  it('test_when_scanTurn_multiple_choice_paren_then_mc_violation', async () => {
    const { scanTurn } = await import(DISC);
    assert.ok(cats(scanTurn('we can do (a) X or (b) Y')).includes('multiple-choice-probe'));
  });

  it('test_when_scanTurn_option_form_then_mc_violation', async () => {
    const { scanTurn } = await import(DISC);
    assert.ok(cats(scanTurn('option 1 keeps it inline, option 2 splits it out')).includes('multiple-choice-probe'));
  });

  it('test_when_scanTurn_which_prefer_then_mc_violation', async () => {
    const { scanTurn } = await import(DISC);
    assert.ok(cats(scanTurn('which do you prefer: sync or async?')).includes('multiple-choice-probe'));
  });

  it('test_when_scanTurn_open_question_then_no_mc_violation', async () => {
    const { scanTurn } = await import(DISC);
    assert.ok(!cats(scanTurn('what constraint makes this hard to change?')).includes('multiple-choice-probe'));
  });

  it('test_when_scanTurn_solution_verb_then_still_fires', async () => {
    const { scanTurn } = await import(DISC);
    const c = cats(scanTurn('let us implement Redis'));
    assert.ok(c.includes('solution-verb'), 'existing solution-verb still fires');
    assert.ok(c.includes('library'), 'existing library still fires');
  });
});
