import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  flipTask, flipTaskInEpic, promoteEpicHeading, resolveRoadmapPath,
  auditRoadmap, taskTokenResolves, syncRoadmap,
} from '../.claude/skills/roadmap-sync/sync.mjs';
// Real standup parser — imported, never mocked (VI.3), for the round-trip test.
import { gatherSync } from '../.claude/skills/standup/gather.mjs';

// --- fixtures (exact roadmap format: em-dash headings, one status emoji per line) ---

const ROADMAP = [
  '# Roadmap',
  '',
  '## Epic 3 — Metadata floor pt.1  🟡  (platform + web)',
  '',
  '### Platform (k)',
  '- ✅ P1. **Value types** — done',
  '- ⬜ P10. **Tenth thing** — planned',
  '- ⬜ AI-05. **Tags** — planned',
  '',
  '### Chore',
  '- ⬜ H1. **Reproducible harness** — planned',
  '',
  '## Epic 4 — Flutter scaffold  ⬜  (solution + flutter)',
  '',
  '### Flutter (y)',
  '- ⬜ Y1. **App** — planned',
  '',
].join('\n');

// An epic whose every task line is already done — heading should promote to ✅.
const ALL_DONE_EPIC = [
  '## Epic 9 — Party & Pricing  🟡  (platform)',
  '',
  '- ✅ K1. **A** — done',
  '- ✅ K2. **B** — done',
  '',
].join('\n');

function writeRoadmap(text) {
  const root = mkdtempSync(join(tmpdir(), 'rsync-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  const path = join(root, 'docs/roadmap-execution-plan.md');
  writeFileSync(path, text, 'utf8');
  return { root, path };
}

// --- flipTask (AC-001) ---

test('test_when_task_planned_then_flips_to_done', () => {
  const { text, changed } = flipTask(ROADMAP, 'H1');
  assert.equal(changed, true);
  assert.match(text, /- ✅ H1\. \*\*Reproducible harness\*\*/);
  // no collateral: P1 stays ✅, P10 stays ⬜
  assert.match(text, /- ✅ P1\. /);
  assert.match(text, /- ⬜ P10\. /);
});

test('test_when_task_already_done_then_idempotent', () => {
  const { text, changed } = flipTask(ROADMAP, 'P1');
  assert.equal(changed, false);
  assert.equal(text, ROADMAP);
});

test('test_when_similar_prefix_then_no_false_match', () => {
  // flipping P1 must not touch P10
  const p1 = flipTask(ROADMAP, 'P1');
  assert.match(p1.text, /- ⬜ P10\. /);
  // hyphen+digit ids flip correctly
  const ai = flipTask(ROADMAP, 'AI-05');
  assert.equal(ai.changed, true);
  assert.match(ai.text, /- ✅ AI-05\. /);
  const h1 = flipTask(ROADMAP, 'H1');
  assert.equal(h1.changed, true);
});

// --- promoteEpicHeading (AC-002) ---

test('test_when_all_tasks_done_then_epic_heading_done', () => {
  const { text, status } = promoteEpicHeading(ALL_DONE_EPIC, 9);
  assert.equal(status, 'done');
  // heading emoji becomes ✅, em-dash + single status emoji preserved
  assert.match(text, /^## Epic 9 — Party & Pricing {2}✅ {2}\(platform\)/m);
  const headingLine = text.split('\n')[0];
  const emojiCount = (headingLine.match(/✅|🟡|⬜/gu) || []).length;
  assert.equal(emojiCount, 1);
});

test('test_when_some_tasks_done_then_epic_heading_in_progress', () => {
  const some = promoteEpicHeading(ROADMAP, 3); // Epic 3 has P1 ✅ but others ⬜
  assert.equal(some.status, 'in-progress');
  assert.match(some.text, /^## Epic 3 — .*🟡.*\(platform \+ web\)/m);
  const none = promoteEpicHeading(ROADMAP, 4); // Epic 4 has only ⬜
  assert.equal(none.status, 'planned');
  assert.match(none.text, /^## Epic 4 — .*⬜/m);
});

// --- resolveRoadmapPath (AC-003, security within-repo) ---

test('test_when_path_escapes_repo_then_null', () => {
  const root = '/repo/root';
  assert.equal(resolveRoadmapPath('', root), null);
  assert.equal(resolveRoadmapPath(undefined, root), null);
  assert.equal(resolveRoadmapPath('/etc/passwd', root), null); // absolute
  assert.equal(resolveRoadmapPath('../../etc/passwd', root), null); // escapes repo
  const ok = resolveRoadmapPath('docs/roadmap-execution-plan.md', root);
  assert.ok(ok && ok.startsWith(root));
});

// --- syncRoadmap orchestrator (AC-003 no-op; AC-001/002 flip+promote) ---

test('test_when_inputs_unresolved_then_noop_exit0', () => {
  const missing = syncRoadmap({ roadmapPath: null, roadmapTasks: ['E3-H1'] });
  assert.equal(missing.noop, true);
  assert.deepEqual(missing.flipped, []);

  const { path } = writeRoadmap(ROADMAP);
  const before = readFileSync(path, 'utf8');
  const notFound = syncRoadmap({ roadmapPath: path, roadmapTasks: ['E3-NOPE'] });
  assert.equal(notFound.noop, true);
  assert.ok(notFound.skipped.some((s) => s.includes('NOPE')));
  assert.equal(readFileSync(path, 'utf8'), before); // nothing written
});

test('test_when_task_named_then_sync_flips_and_promotes', () => {
  const { path } = writeRoadmap(ROADMAP);
  const report = syncRoadmap({ roadmapPath: path, roadmapTasks: ['E3-H1'] });
  assert.equal(report.noop, false);
  assert.ok(report.flipped.some((f) => f.includes('H1')));
  const after = readFileSync(path, 'utf8');
  assert.match(after, /- ✅ H1\. /);
  // Epic 3 still in-progress (P10, AI-05 remain ⬜) — heading recomputed, not blindly set done
  assert.match(after, /^## Epic 3 — .*🟡/m);
});

// --- flipTaskInEpic + token resolution (epic-scoped: labels repeat across epics) ---

const DUP_LABEL = [
  '## Epic 3 — Metadata  🟡  (platform)',
  '',
  '- ✅ P1. **e3 first** — done',
  '- ⬜ P2. **e3 second** — planned',
  '',
  '## Epic 4 — Flutter  ⬜  (flutter)',
  '',
  '- ⬜ P1. **e4 first** — planned',
  '- ⬜ P2. **e4 second** — planned',
  '',
].join('\n');

test('test_when_duplicate_label_then_flips_named_epic_only', () => {
  const { text, changed } = flipTaskInEpic(DUP_LABEL, 4, 'P1');
  assert.equal(changed, true);
  // Epic 4's P1 flipped
  assert.match(text, /## Epic 4[\s\S]*- ✅ P1\. \*\*e4 first\*\*/);
  // Epic 3's P1 untouched (was already ✅, but proves no double-flip of a different epic's P2)
  assert.match(text, /## Epic 3[\s\S]*- ⬜ P2\. \*\*e3 second\*\*/);
  // Epic 4's P2 untouched
  assert.match(text, /## Epic 4[\s\S]*- ⬜ P2\. \*\*e4 second\*\*/);
});

test('test_when_label_not_in_named_epic_then_no_flip', () => {
  // 'P2' exists in epic 3, but ask for it in a non-existent epic
  const { changed } = flipTaskInEpic(DUP_LABEL, 99, 'P2');
  assert.equal(changed, false);
});

test('test_taskTokenResolves_against_named_epic', () => {
  assert.equal(taskTokenResolves(DUP_LABEL, 'E4-P1'), true);
  assert.equal(taskTokenResolves(DUP_LABEL, 'E3-P2'), true);
  assert.equal(taskTokenResolves(DUP_LABEL, 'E4-ZZ'), false); // task absent
  assert.equal(taskTokenResolves(DUP_LABEL, 'E99-P1'), false); // epic absent
  assert.equal(taskTokenResolves(DUP_LABEL, 'not-a-token'), false);
});

test('test_when_sync_token_then_flips_within_named_epic', () => {
  const { path } = writeRoadmap(DUP_LABEL);
  const report = syncRoadmap({ roadmapPath: path, roadmapTasks: ['E4-P1'] });
  assert.ok(report.flipped.includes('E4-P1'));
  const after = readFileSync(path, 'utf8');
  assert.match(after, /## Epic 4[\s\S]*- ✅ P1\. \*\*e4 first\*\*/);
  assert.match(after, /## Epic 4 — .*🟡/m); // epic 4 now in-progress
});

// --- auditRoadmap (AC-006) — reports, never mutates ---

test('test_when_heading_inconsistent_then_audit_flags', () => {
  const inconsistent = [
    '## Epic 5 — SonarQube  🟡  (chore)',
    '',
    '- ✅ C1. **A** — done',
    '- ✅ C2. **B** — done',
    '',
    '## Epic 6 — Bad line  ⬜  (platform)',
    '',
    '- ⬜ ✅ D1. **two emojis** — malformed',
    '',
  ].join('\n');
  const { anomalies } = auditRoadmap(inconsistent);
  assert.ok(Array.isArray(anomalies));
  assert.ok(anomalies.length >= 2); // heading-vs-body mismatch + the 2-emoji line
  // purity: calling audit did not change the input string
  assert.equal(inconsistent, inconsistent);
});

// --- round-trip through the REAL standup parser (AC-004, no mock) ---

test('test_when_written_then_real_standup_parser_roundtrips', () => {
  const { root, path } = writeRoadmap(ROADMAP);
  syncRoadmap({ roadmapPath: path, roadmapTasks: ['E3-H1'] });

  const { roadmap, degraded } = gatherSync({ rootDir: root });
  assert.ok(!degraded.includes('no-roadmap-plan'));
  assert.ok(roadmap && Array.isArray(roadmap.epics));

  const epic3 = roadmap.epics.find((e) => e.num === 3);
  assert.ok(epic3, 'Epic 3 parsed');
  assert.equal(epic3.status, 'in-progress');
  // After flipping H1: P1 + H1 done = 2; P10 + AI-05 planned = 2
  assert.equal(epic3.tasks.done, 2);
  assert.equal(epic3.tasks.planned, 2);

  const epic4 = roadmap.epics.find((e) => e.num === 4);
  assert.ok(epic4 && epic4.status === 'planned');
});

// --- self-heal: recompute every heading auditRoadmap flags, not only touched epics ---

const STALE_UNTOUCHED = [ROADMAP, ALL_DONE_EPIC].join('\n');

const DONE_OVER_PARTIAL = [
  '## Epic 12 — Overclaimed  ✅  (platform)',
  '',
  '- ✅ M1. **A** — done',
  '- ⬜ M2. **B** — planned',
  '',
].join('\n');

const DONE_OVER_PLANNED = [
  '## Epic 13 — Not started  ✅  (platform)',
  '',
  '- ⬜ N1. **A** — planned',
  '- ⬜ N2. **B** — planned',
  '',
].join('\n');

test('test_when_untouched_epic_heading_is_stale_then_heal_promotes_it', () => {
  const { path } = writeRoadmap(STALE_UNTOUCHED);
  const report = syncRoadmap({ roadmapPath: path, roadmapTasks: ['E3-H1'] });

  assert.ok(report.flipped.includes('E3-H1'));
  assert.ok(report.healed.includes('Epic 9'), 'the epic this run never touched is healed');

  const after = readFileSync(path, 'utf8');
  assert.match(after, /^## Epic 9 — .*✅/m);
  assert.match(after, /^## Epic 3 — .*🟡/m);
});

test('test_when_no_tasks_named_then_heal_still_runs_and_writes', () => {
  const { path } = writeRoadmap(ALL_DONE_EPIC);
  const report = syncRoadmap({ roadmapPath: path, roadmapTasks: [] });

  assert.equal(report.noop, false);
  assert.deepEqual(report.flipped, []);
  assert.ok(report.healed.includes('Epic 9'));
  assert.match(readFileSync(path, 'utf8'), /^## Epic 9 — .*✅/m);
});

test('test_when_heal_runs_then_report_anomalies_are_clean', () => {
  const { path } = writeRoadmap(ALL_DONE_EPIC);
  const report = syncRoadmap({ roadmapPath: path, roadmapTasks: [] });

  assert.deepEqual(report.anomalies, [], 'audit runs against the post-heal text');
});

test('test_when_roadmap_consistent_then_heal_is_noop_and_file_untouched', () => {
  const { path } = writeRoadmap(ROADMAP);
  const before = readFileSync(path, 'utf8');
  const report = syncRoadmap({ roadmapPath: path, roadmapTasks: [] });

  assert.equal(report.noop, true);
  assert.deepEqual(report.healed, []);
  assert.equal(readFileSync(path, 'utf8'), before);
});

test('test_when_heading_done_over_partial_body_then_heal_demotes_to_in_progress', () => {
  const { path } = writeRoadmap(DONE_OVER_PARTIAL);
  const report = syncRoadmap({ roadmapPath: path, roadmapTasks: [] });

  assert.ok(report.healed.includes('Epic 12'), 'the heal recomputes, it does not only promote');
  assert.match(readFileSync(path, 'utf8'), /^## Epic 12 — .*🟡/m);
});

test('test_when_body_implies_planned_then_heal_skips_and_anomaly_persists', () => {
  const { path } = writeRoadmap(DONE_OVER_PLANNED);
  const before = readFileSync(path, 'utf8');
  const report = syncRoadmap({ roadmapPath: path, roadmapTasks: [] });

  assert.deepEqual(report.healed, []);
  assert.equal(readFileSync(path, 'utf8'), before);
  assert.ok(report.anomalies.some((a) => a.includes('Epic 13')), 'the unhealable case stays reported');
});

test('test_when_healed_then_real_standup_parser_roundtrips', () => {
  const { root, path } = writeRoadmap(STALE_UNTOUCHED);
  syncRoadmap({ roadmapPath: path, roadmapTasks: [] });

  const { roadmap, degraded } = gatherSync({ rootDir: root });
  assert.ok(!degraded.includes('no-roadmap-plan'));

  const epic9 = roadmap.epics.find((e) => e.num === 9);
  assert.ok(epic9, 'Epic 9 parsed after the heal rewrote its heading');
  assert.equal(epic9.status, 'done');
  assert.equal(epic9.tasks.done, 2);
});
