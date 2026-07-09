// Governance scan of the harness + commit SOPs.
// Defends the invariant the original bug violated: once `/commit` Step 1 moves
// `.claude/state/workflow.json` into `docs/archive/<date>/<slug>/`, nothing may
// append to it. The live statefile is gone and the archived bundle was landed by
// the very commit in flight, so a post-move append re-dirties a just-committed
// file. Three archived bundles (org-team-charter, erp-portables-slice-c,
// erp-portables-slice-j) carried exactly that damage before the SOPs were fixed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMIT_SKILL = join(REPO_ROOT, '.claude/skills/commit/SKILL.md');
const HARNESS_SKILL = join(REPO_ROOT, '.claude/skills/harness/SKILL.md');

describe('archived bundles are immutable after /commit Step 1 moves workflow.json', () => {
  it('test_when_commit_skill_read_then_terminal_step_forbids_appending_commit', () => {
    const text = readFileSync(COMMIT_SKILL, 'utf8');
    assert.match(
      text,
      /Do NOT append `"commit"` to `completed`/,
      'commit/SKILL.md terminal step must forbid appending "commit" to completed'
    );
    assert.doesNotMatch(
      text,
      /^\s*\d+\.\s*Append `"commit"` to `completed`/m,
      'commit/SKILL.md must not instruct an append to completed after the archive move'
    );
  });

  it('test_when_harness_skill_read_then_append_is_skipped_when_statefile_absent', () => {
    const text = readFileSync(HARNESS_SKILL, 'utf8');
    assert.match(
      text,
      /Skip this append when `\.claude\/state\/workflow\.json` no longer exists/,
      'harness/SKILL.md must skip the completed[] append once the statefile is archived'
    );
    assert.match(
      text,
      /Never resolve `workflow\.json` to the archived copy/,
      'harness/SKILL.md must forbid resolving workflow.json to the archived copy'
    );
  });

});

// Note: 11 bundles committed before this fix carry a "commit" entry in completed[] —
// the same post-move append, absorbed into a later workflow's commit rather than left
// dirty. They are not re-litigated here: an archived bundle is immutable, and the SOP
// scans above are what stop new ones from appearing.
