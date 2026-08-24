// T9 — the commit SOP does not say the workflow.json move is a plain mv.
//
// Step 1 says a generic "move", so it does not command the failing operation.
// But two neighbours DO say git mv — archive/SKILL.md Step 4 ("moves (`git mv` if
// repo is git, else `mv`)") and commit Step 2.8 ("`git mv`s the epic's discovery
// bundle") — and `.claude/state/` is gitignored, so a reader generalises from the
// neighbours and reaches for a command that fails.
//
// Confirmed by hitting it during the memory-curation-flush landing: git mv on
// that path fails, and plain mv is required.
//
// Docs-only. There is no behaviour to drive, so this asserts the prose says what
// the operator needs and nothing more.
//
// RED until: commit/SKILL.md Step 1 names mv explicitly and states the reason.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMIT_SKILL = join(REPO_ROOT, '.claude/skills/commit/SKILL.md');

function stepOneText() {
  const text = readFileSync(COMMIT_SKILL, 'utf8');
  const start = text.indexOf('1. **Archive `workflow.json` itself.**');
  assert.ok(start >= 0, 'commit/SKILL.md must still carry a Step 1 that archives workflow.json');
  const next = text.indexOf('\n2. ', start);
  return text.slice(start, next > start ? next : undefined);
}

describe('AC-015 — Step 1 states the move is mv, not git mv, and why', () => {
  it('test_when_commit_sop_step_1_is_read_then_it_states_mv_not_git_mv', () => {
    const step = stepOneText();

    assert.match(
      step,
      /\bmv\b/,
      'Step 1 must name the actual command the operator runs'
    );
    assert.match(
      step,
      /not\s+`?git mv`?|never\s+`?git mv`?|rather than\s+`?git mv`?/i,
      'Step 1 must rule out git mv explicitly — the neighbouring steps both say git mv'
    );
    assert.match(
      step,
      /gitignor/i,
      'Step 1 must give the reason, so the reader can generalise correctly next time'
    );
  });

  it('test_when_the_reason_is_stated_then_it_is_true_of_this_repo', () => {
    // The prose claims .claude/state/ is gitignored. Assert the claim rather
    // than trusting it — a doc fix that states a false reason is still wrong.
    const out = execFileSync('git', ['check-ignore', '-q', '.claude/state/workflow.json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    // check-ignore exits 1 when NOT ignored; execFileSync throws on non-zero.
    // Reaching this line at all means the path is ignored.
    });
    assert.equal(String(out), '', 'git check-ignore succeeds silently for an ignored path');
  });

  it('test_when_the_neighbouring_steps_are_read_then_they_still_say_git_mv', () => {
    // Regression guard on the premise: if the neighbours ever stop saying
    // git mv, the ambiguity this ticket fixes no longer exists and the extra
    // sentence in Step 1 should be revisited rather than silently kept.
    const commit = readFileSync(COMMIT_SKILL, 'utf8');
    assert.match(commit, /`git mv`s the epic's discovery bundle/, 'commit Step 2.8 still says git mv');

    const archive = join(REPO_ROOT, '.claude/skills/archive/SKILL.md');
    assert.ok(existsSync(archive), 'archive/SKILL.md must exist');
    assert.match(readFileSync(archive, 'utf8'), /`git mv`/, 'archive Step 4 still says git mv');
  });
});
