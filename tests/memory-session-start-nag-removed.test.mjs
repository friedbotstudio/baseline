// T3 — the session-start pending-memory nag is deleted (AC-006..AC-008).
//
// Two facts this ticket corrects, and the tests separate them:
//   - the nag itself (AC-006) — buildIndex must stop emitting it in BOTH
//     branches, active-workflow and no-workflow;
//   - the constitution's description of it (AC-008) — CLAUDE.md Art. III.4
//     claimed the nag was workflow-conditional while the code fired it always,
//     and the hook cited "Phase 10.6" where Art. IV says 10.7.
//
// AC-007 is the guard against over-deletion: everything else buildIndex emits
// has to survive untouched.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport, readFileSync, existsSync } from './helpers/memory-fixtures.mjs';

const HOOK_LIB = '.claude/hooks/lib/memory_session_start.mjs';
const CONSTITUTION = 'CLAUDE.md';
const CONSTITUTION_MIRROR = 'src/CLAUDE.template.md';

const NAG_PATTERN = /\/memory-(flush|sync)\b/;

function projectWithPending({ candidates = 3, activeWorkflow = false, pendingUnreadable = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'nag-'));
  const memDir = join(root, '.claude/memory');
  mkdirSync(memDir, { recursive: true });
  mkdirSync(join(root, '.claude/state'), { recursive: true });
  writeFileSync(join(root, '.claude/project.json'), JSON.stringify({ configured: true }));

  // `## CANDIDATE` headings, not bullets: buildIndex derives pendingCount from
  // /^##\s+CANDIDATE\b/gm (memory_session_start.mjs:311). A bullet-shaped fixture
  // yields count 0, the nag never fires, and every assertion below passes for the
  // wrong reason and stays green forever.
  const body = Array.from({ length: candidates }, (_, i) => `## CANDIDATE ${i}\n\nbody ${i}`).join('\n\n');
  if (pendingUnreadable) {
    mkdirSync(join(memDir, '_pending.md'));
  } else {
    writeFileSync(join(memDir, '_pending.md'), `${body}\n`);
  }

  if (activeWorkflow) {
    writeFileSync(join(root, '.claude/state/workflow.json'), JSON.stringify({ slug: 's', track_id: 'power', completed: [] }));
  }
  return { root, memDir };
}

async function buildIndexFor({ root, memDir }) {
  const mod = await tryImport(HOOK_LIB);
  assert.ok(mod, `${HOOK_LIB} must be importable`);
  assert.equal(typeof mod.buildIndex, 'function', 'expected named export `buildIndex`');
  return mod.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' });
}

function readGoverningText(rel) {
  const path = join(REPO_ROOT, rel);
  assert.ok(existsSync(path), `${rel} must exist`);
  return readFileSync(path, 'utf8');
}

// The constitution is a 40,000-char document and buildIndex emits a long report.
// assert.match/doesNotMatch would print the whole of either into the failure, so
// every claim below goes through these two, which print only the claim.
function carries(text, pattern, message) {
  assert.ok(pattern.test(text), message);
}

function lacks(text, pattern, message) {
  const hit = text.match(pattern);
  assert.ok(!hit, `${message}${hit ? ` — found: ${JSON.stringify(hit[0])}` : ''}`);
}

describe('session-start pending nag removal', () => {
  // AC-006 — both branches, because the hook had two framings and deleted means both.
  for (const activeWorkflow of [false, true]) {
    const branch = activeWorkflow ? 'active-workflow' : 'no-workflow';
    it(`test_when_pending_candidates_exist_then_session_start_index_has_no_flush_prompt [${branch}]`, async () => {
      const project = projectWithPending({ candidates: 3, activeWorkflow });
      try {
        const out = await buildIndexFor(project);
        lacks(out, NAG_PATTERN, `the ${branch} branch must emit no flush prompt; the nag was deleted, not re-worded`);
      } finally {
        rmSync(project.root, { recursive: true, force: true });
      }
    });
  }

  // AC-007 — over-deletion guard.
  it('test_when_session_start_builds_index_then_counts_stale_map_and_resume_are_unchanged', async () => {
    const project = projectWithPending({ candidates: 2 });
    try {
      const out = await buildIndexFor(project);
      carries(out, /Project memory|index/i, 'the memory index header must survive');
      carries(out, /\bFile\b[\s\S]*\bEntries\b/, 'the per-file entry-count table must survive');
      lacks(out, NAG_PATTERN, 'and it still carries no nag');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  // AC-006, AC-007 — failure mode.
  it('test_when_pending_file_unreadable_then_index_emits_without_nag_and_does_not_throw', async () => {
    const project = projectWithPending({ pendingUnreadable: true });
    try {
      const out = await buildIndexFor(project);
      assert.equal(typeof out, 'string', 'an unreadable _pending.md must not throw — the index still emits');
      lacks(out, NAG_PATTERN, 'and still no nag');
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  // AC-008 — the constitution and its byte mirror.
  for (const rel of [CONSTITUTION, CONSTITUTION_MIRROR]) {
    it(`test_when_constitution_read_then_art_iii_4_has_no_nag_claim_and_cites_phase_10_7 [${rel}]`, () => {
      const text = readGoverningText(rel);
      const articleIII = text.slice(text.indexOf('## Article III'), text.indexOf('## Article IV'));
      assert.ok(articleIII.length > 0, 'Article III must be locatable');

      lacks(
        articleIII,
        /debt-mode nag|nag fires|SHALL run `\/memory-(flush|sync)` when/i,
        'Art. III.4 must stop describing a nag the hook no longer emits — the text and the code drifted apart, and T3 closes it from both ends',
      );
      lacks(
        text,
        /Phase 10\.6 \(`\/memory-(flush|sync)`\)/,
        'the flush phase is 10.7 per Art. IV; the 10.6 citation was a second drift',
      );
    });
  }
});
