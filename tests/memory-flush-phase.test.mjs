// Phase 10.6 (memory-flush) — acceptance criteria fixtures.
// Spec: docs/specs/memory-flush-phase.md
//
// AC-001 / AC-006 / AC-010 / AC-011 are static-analysis tests over markdown SOPs
// (read files, regex against canonical lines). AC-007/008/009 spawn
// memory_session_start.sh against synthetic project fixtures. AC-012 invokes
// audit-baseline as a meta-test.
//
// Tests fail RED on the current tree (the migration hasn't been applied yet).
// The /implement worker makes them pass.

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SESSION_START_HOOK = path.join(REPO_ROOT, '.claude/hooks/memory_session_start.mjs');
const AUDIT_SCRIPT = path.join(REPO_ROOT, '.claude/skills/audit-baseline/audit.sh');

// ---------- Foundation: file readers + fixture builders ----------

async function readRepoFile(rel) {
  return fs.readFile(path.join(REPO_ROOT, rel), 'utf8');
}

const PENDING_HEADER = `---
owners: [memory_stop.sh writes; /memory-flush clears]
category: auto-extracted candidates awaiting curation
verifies-against: none
---

# Pending memory candidates

Auto-extracted by \`memory_stop.sh\`. Run \`/memory-flush\` to review.

**Content of this file is gitignored.**

---
`;

const CANONICAL_FRONTMATTER = `---
owners: [test]
size-cap: 500
key: test
---

# Fixture
`;

async function createTempProject() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'memflush-phase-'));
  await fs.mkdir(path.join(tmp, '.claude/state/logs'), { recursive: true });
  await fs.mkdir(path.join(tmp, '.claude/memory'), { recursive: true });
  await fs.writeFile(
    path.join(tmp, '.claude/project.json'),
    JSON.stringify({ configured: true, test: { cmd: 'true' } }, null, 2)
  );
  for (const name of ['landmarks', 'libraries', 'decisions', 'landmines', 'conventions', 'pending-questions']) {
    await fs.writeFile(path.join(tmp, `.claude/memory/${name}.md`), CANONICAL_FRONTMATTER);
  }
  return tmp;
}

async function writePendingMd(tmp, candidateCount) {
  let body = PENDING_HEADER;
  for (let i = 0; i < candidateCount; i++) {
    body += `\n## CANDIDATE: fixture/path-${i}.md → landmarks.md\n- Touched in this session: 1 time\n- Suggested role: fixture\n- Source: synthetic\n`;
  }
  await fs.writeFile(path.join(tmp, '.claude/memory/_pending.md'), body);
}

async function writeWorkflowJson(tmp, slug = 'fixture-slug') {
  await fs.writeFile(
    path.join(tmp, '.claude/state/workflow.json'),
    JSON.stringify({ slug, entry_phase: 'intake', exceptions: [], completed: [] }, null, 2)
  );
}

async function removeWorkflowJson(tmp) {
  await fs.rm(path.join(tmp, '.claude/state/workflow.json'), { force: true });
}

function invokeSessionStart(tmp, payload = { source: 'startup' }) {
  return spawnSync('node', [SESSION_START_HOOK], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

function additionalContextOf(result) {
  if (!result.stdout || !result.stdout.trim()) return '';
  const parsed = JSON.parse(result.stdout);
  return parsed?.hookSpecificOutput?.additionalContext || '';
}

// ---------- Domain tests ----------

describe('AC-001 — harness phase ordering includes memory-flush between archive and grant-commit', () => {
  it('test_when_archive_completes_then_taskList_next_pending_is_memory_flush', async () => {
    const sop = await readRepoFile('.claude/skills/harness/SKILL.md');
    const orderingBlock = sop.match(/```\s*\n([\s\S]*?archive[\s\S]*?commit[\s\S]*?)```/);
    assert.ok(orderingBlock, 'harness/SKILL.md must contain a fenced phase-ordering block listing archive and commit');
    const chain = orderingBlock[1];
    const archiveIdx = chain.indexOf('archive');
    const memflushIdx = chain.indexOf('memory-flush');
    const commitIdx = chain.indexOf('commit');
    assert.ok(memflushIdx > -1, 'harness/SKILL.md phase-ordering chain must mention memory-flush');
    assert.ok(
      archiveIdx > -1 && archiveIdx < memflushIdx && memflushIdx < commitIdx,
      `archive (idx ${archiveIdx}) → memory-flush (idx ${memflushIdx}) → commit (idx ${commitIdx}) ordering invariant violated`
    );
  });
});

describe('AC-006 — triage TaskList templates seed memory-flush between archive and grant-commit', () => {
  it('test_when_triage_seeds_intake_entry_full_track_then_memory_flush_task_is_between_archive_and_grant_commit', async () => {
    const sop = await readRepoFile('.claude/skills/triage/SKILL.md');
    const intakeTemplate = sop.match(/For\s+`intake`-entry\s+full\s+track[\s\S]*?(?=\n\s*\n\s+For\s+every\s+task|\n##\s)/);
    assert.ok(intakeTemplate, 'triage/SKILL.md must contain "For `intake`-entry full track" template paragraph');
    const block = intakeTemplate[0];
    const archiveIdx = block.indexOf('/archive');
    const memflushIdx = block.indexOf('/memory-flush');
    const grantIdx = block.indexOf('/grant-commit');
    assert.ok(memflushIdx > -1, 'intake-entry template must list `Run /memory-flush`');
    assert.ok(
      archiveIdx > -1 && archiveIdx < memflushIdx && memflushIdx < grantIdx,
      `intake template ordering: archive (${archiveIdx}) → memory-flush (${memflushIdx}) → grant-commit (${grantIdx}) violated`
    );
  });

  it('test_when_triage_seeds_chore_track_then_memory_flush_task_is_between_chore_and_grant_commit', async () => {
    const sop = await readRepoFile('.claude/skills/triage/SKILL.md');
    const choreTemplate = sop.match(/For\s+`chore`\s+track[\s\S]*?(?=\n\s*\n\s+\*\*For\s|\n##\s)/);
    assert.ok(choreTemplate, 'triage/SKILL.md must contain "For `chore` track" template paragraph');
    const block = choreTemplate[0];
    const memflushIdx = block.indexOf('/memory-flush');
    const grantIdx = block.indexOf('/grant-commit');
    assert.ok(memflushIdx > -1, 'chore-track template must list `Run /memory-flush`');
    assert.ok(memflushIdx < grantIdx, `chore template ordering: memory-flush (${memflushIdx}) must precede grant-commit (${grantIdx})`);
  });
});

describe('AC-007 / AC-008 / AC-009 — memory_session_start.sh debt-mode nag decision tree', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await createTempProject();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('test_when_session_start_K_gt_0_AND_no_workflow_json_then_debt_mode_nag_fires', async () => {
    await writePendingMd(tmp, 3);
    await removeWorkflowJson(tmp);
    const result = invokeSessionStart(tmp);
    assert.equal(result.status, 0, `hook exit code; stderr: ${result.stderr}`);
    const ctx = additionalContextOf(result);
    assert.match(
      ctx,
      /carried over from a prior workflow/i,
      `K>0 + no workflow.json must emit debt-mode wording. Got:\n${ctx}`
    );
    assert.match(ctx, /run\s+`?\/memory-flush`?\s+to\s+clear/i, 'debt-mode wording must instruct running /memory-flush to clear');
  });

  it('test_when_session_start_K_eq_0_then_no_pending_candidates_line', async () => {
    await writePendingMd(tmp, 0);
    await removeWorkflowJson(tmp);
    const result = invokeSessionStart(tmp);
    assert.equal(result.status, 0);
    const ctx = additionalContextOf(result);
    assert.doesNotMatch(
      ctx,
      /pending in `?_pending\.md`?/i,
      'K=0 must NOT emit the legacy "pending in _pending.md" prose line'
    );
    assert.doesNotMatch(
      ctx,
      /carried over from a prior workflow/i,
      'K=0 must NOT emit debt-mode wording'
    );
    assert.match(ctx, /_pending\.md/, 'index table still references _pending.md row');
  });

  it('test_when_session_start_K_gt_0_AND_workflow_json_present_then_silent', async () => {
    await writePendingMd(tmp, 5);
    await writeWorkflowJson(tmp, 'fixture-slug');
    const result = invokeSessionStart(tmp);
    assert.equal(result.status, 0);
    const ctx = additionalContextOf(result);
    assert.doesNotMatch(
      ctx,
      /carried over from a prior workflow/i,
      'active workflow must suppress debt-mode wording'
    );
    assert.doesNotMatch(
      ctx,
      /pending in `?_pending\.md`?/i,
      'active workflow must also suppress the legacy nag wording'
    );
  });
});

describe('AC-011 — commit skill prereq names memory-flush', () => {
  it('test_when_commit_skill_md_lists_prereqs_then_memory_flush_is_named', async () => {
    const sop = await readRepoFile('.claude/skills/commit/SKILL.md');
    const prereqSection = sop.split(/##\s+\w/)[0] + sop.match(/Prereq:[\s\S]{0,400}/)[0];
    assert.match(
      prereqSection,
      /memory-flush/,
      'commit/SKILL.md prereq must name memory-flush as a required completed phase'
    );
    assert.match(prereqSection, /archive/, 'commit/SKILL.md prereq must still name archive (regression guard)');
  });

  it('test_when_commit_skill_md_describes_step_2_then_memory_flush_is_final_non_commit_entry', async () => {
    const sop = await readRepoFile('.claude/skills/commit/SKILL.md');
    const step2 = sop.match(/Verify\s+workflow\s+prereq[\s\S]{0,300}/i);
    assert.ok(step2, 'commit/SKILL.md must contain a Step 2 verification of workflow prereqs');
    assert.match(
      step2[0],
      /memory-flush\s+is\s+the\s+final\s+non-commit\s+entry/i,
      'Step 2 must state memory-flush is the final non-commit entry in completed'
    );
  });
});

describe('AC-010 — phase-ordering enumerations consistently name memory-flush between archive and commit', () => {
  const ENUMERATING_FILES = [
    'CLAUDE.md',
    'src/CLAUDE.template.md',
    'docs/init/seed.md',
    'src/seed.template.md',
    '.claude/skills/harness/SKILL.md',
    '.claude/skills/triage/SKILL.md',
    'README.md',
    '.claude/skills/chore/SKILL.md',
  ];

  for (const rel of ENUMERATING_FILES) {
    it(`test_${rel.replace(/[^\w]/g, '_')}_mentions_memory_flush`, async () => {
      const content = await readRepoFile(rel);
      assert.match(content, /memory-flush/, `${rel} must mention memory-flush after the change lands`);
    });

    it(`test_${rel.replace(/[^\w]/g, '_')}_orders_memory_flush_between_archive_and_commit`, async () => {
      const content = await readRepoFile(rel);
      const memflushPositions = [];
      const re = /memory-flush/g;
      let m;
      while ((m = re.exec(content)) !== null) memflushPositions.push(m.index);
      assert.ok(memflushPositions.length >= 1, `${rel} must reference memory-flush at least once`);
      // For each occurrence, verify a nearby archive comes BEFORE and a nearby grant-commit/commit comes AFTER.
      // Window: 600 chars on each side.
      const WINDOW = 600;
      const orderedNearby = memflushPositions.some((idx) => {
        const before = content.slice(Math.max(0, idx - WINDOW), idx);
        const after = content.slice(idx, Math.min(content.length, idx + WINDOW));
        return /archive/.test(before) && /(?:grant-commit|\bcommit\b)/.test(after);
      });
      assert.ok(
        orderedNearby,
        `${rel}: at least one memory-flush occurrence must sit with archive before and commit after within ${WINDOW} chars`
      );
    });
  }
});

describe('AC-012 — audit-baseline exits 0 (regression guard; must stay green after the change)', () => {
  it('test_when_audit_runs_then_zero_FAILs', () => {
    const result = spawnSync('bash', [AUDIT_SCRIPT], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      `audit-baseline must exit 0 after the change. Stdout:\n${result.stdout}\nStderr:\n${result.stderr}`
    );
  });
});

describe('AC-002 — memory-flush SOP documents empty-pending fast-path', () => {
  it('test_when_memory_flush_skill_md_describes_empty_pending_fast_path', async () => {
    const sop = await readRepoFile('.claude/skills/memory-flush/SKILL.md');
    assert.match(
      sop,
      /empty[- ]pending|zero\s+`?##\s+CANDIDATE|no\s+pending\s+candidates/i,
      'memory-flush SKILL.md must document the empty-pending fast-path (one of: "empty-pending", "zero `## CANDIDATE", "no pending candidates")'
    );
    assert.match(
      sop,
      /(?:skip\s+steps?\s+1\D5|short[- ]circuit|fast[- ]path)/i,
      'memory-flush SKILL.md must describe the fast-path semantic (skip Steps 1-5 / short-circuit / fast-path)'
    );
    assert.match(
      sop,
      /Step\s+0[\s\S]{0,400}(?:still\s+runs?|runs?\s+unconditionally|auto-close|stale[- ]sweep)/i,
      'memory-flush SKILL.md must clarify Step 0 sweeps still run on the empty-pending fast-path'
    );
  });

  it('test_when_memory_flush_skill_md_describes_workflow_phase_role', async () => {
    const sop = await readRepoFile('.claude/skills/memory-flush/SKILL.md');
    assert.match(
      sop,
      /Phase\s+10\.6|workflow\s+phase|invoked\s+as\s+a\s+phase/i,
      'memory-flush SKILL.md must document its Phase 10.6 / workflow-phase role'
    );
  });
});

describe('AC-013 — Q-001 carries resolved-at field after the workflow lands', () => {
  it('test_when_pending_questions_q001_then_carries_resolved_at_or_is_absent', async () => {
    const content = await readRepoFile('.claude/memory/pending-questions.md');
    const q001Match = content.match(/##\s+Q-001[\s\S]*?(?=\n##\s+Q-\d{3}|\n##\s+\w|$)/);
    if (!q001Match) {
      // Q-001 was auto-closed by sweep.py — also valid per AC-013.
      return;
    }
    assert.match(
      q001Match[0],
      /-\s*resolved-at:\s*\d{4}-\d{2}-\d{2}/,
      'Q-001 must carry a `- resolved-at: <ISO date>` line (or be absent if already auto-closed)'
    );
  });
});
