// Scenario suite — grouping open backlog entries into an epic, and the writes that follow.
// Foundation (fixture builders) at the top, Domain assertions below, one test per recipe row.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The helper /implement has not written yet. A guarded dynamic import turns a
// cryptic ERR_MODULE_NOT_FOUND into one named failure that says what is missing.
let retriageMod;
try {
  retriageMod = await import('../.claude/skills/triage/retriage.mjs');
} catch (cause) {
  throw new Error(
    'triage retriage helper is absent — /implement must create .claude/skills/triage/retriage.mjs',
    { cause },
  );
}
const { collectOpenBacklog, materializeRetriagedEpic } = retriageMod;

// --- Foundation: backlog shard fixtures (the live frontmatter shape) ---

function backlogShard({ key, status = 'open', governs = '', raisedIn = 'some-workflow', body = 'The defect.' }) {
  return [
    '---',
    `key: ${key}`,
    'category: backlog',
    'scope: []',
    `status: ${status}`,
    'source: assistant-deferral',
    'raised-on: 2026-08-09',
    `raised-in-context: ${raisedIn}`,
    'verified-at: dd0e5d2',
    'last-touched: 2026-08-09',
    `governs: ${governs}`,
    '---',
    '',
    `- **The defect.** ${body}`,
    '',
  ].join('\n');
}

function makeRepo({ shards = [], withWorkflow = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'retriage-'));
  mkdirSync(join(root, '.claude/memory/backlog'), { recursive: true });
  mkdirSync(join(root, '.claude/state/epic'), { recursive: true });
  for (const shard of shards) {
    writeFileSync(join(root, '.claude/memory/backlog', `${shard.key}.md`), backlogShard(shard), 'utf8');
  }
  if (withWorkflow) {
    writeFileSync(
      join(root, '.claude/state/workflow.json'),
      `${JSON.stringify({ slug: 'already-running', track_id: 'spec-entry' }, null, 2)}\n`,
      'utf8',
    );
  }
  return root;
}

function backlogDigest(root) {
  const dir = join(root, '.claude/memory/backlog');
  return readdirSync(dir).sort().map((name) => {
    const bytes = readFileSync(join(dir, name));
    return `${name}:${createHash('sha256').update(bytes).digest('hex')}`;
  }).join('\n');
}

const MIXED_SHARDS = [
  { key: 'open-one', status: 'open', governs: '.claude/skills/roadmap-sync/sync.mjs', body: 'First open thing.' },
  { key: 'open-two', status: 'open', governs: '.claude/skills/standup/gather.mjs', body: 'Second open thing.' },
  { key: 'taken-one', status: 'picked-up', body: 'Already claimed.' },
  { key: 'gone-one', status: 'dropped', body: 'Abandoned.' },
];

const PROPOSAL = {
  epicSlug: 'roadmap-debt',
  title: 'Roadmap debt',
  slices: [
    { id: 'A', title: 'Fix the sync helper', acs: ['AC-001'], backlogKeys: ['open-one'] },
    { id: 'B', title: 'Fix the recap', acs: ['AC-001'], backlogKeys: ['open-two'] },
  ],
};

// --- collectOpenBacklog (AC-006) ---

test('test_when_backlog_has_mixed_statuses_then_only_open_entries_collected', () => {
  const root = makeRepo({ shards: MIXED_SHARDS });
  const before = backlogDigest(root);

  const entries = collectOpenBacklog({ memoryDir: join(root, '.claude/memory') });

  assert.deepEqual(entries.map((e) => e.key).sort(), ['open-one', 'open-two']);
  for (const entry of entries) {
    assert.ok(entry.path, 'every entry names its shard path');
    assert.ok(entry.summary, 'every entry carries a summary');
    assert.ok(Array.isArray(entry.governs), 'governs is an array');
  }
  assert.equal(
    entries.find((e) => e.key === 'open-one').raisedIn,
    'some-workflow',
    'raised-in-context is surfaced as raisedIn',
  );
  assert.equal(backlogDigest(root), before, 'collectOpenBacklog writes nothing');
});

test('test_when_backlog_directory_is_absent_then_collect_returns_empty', () => {
  const root = mkdtempSync(join(tmpdir(), 'retriage-bare-'));
  assert.deepEqual(collectOpenBacklog({ memoryDir: join(root, '.claude/memory') }), []);
});

// --- materializeRetriagedEpic (AC-007) ---

test('test_when_grouping_confirmed_then_workflow_and_epic_state_written', () => {
  const root = makeRepo({ shards: MIXED_SHARDS });

  const { workflowPath, epicStatePath } = materializeRetriagedEpic({ rootDir: root, proposal: PROPOSAL });

  const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
  assert.equal(workflow.track_id, 'epic');
  assert.equal(workflow.slug, 'roadmap-debt');
  assert.deepEqual(workflow.source_backlog_keys.slice().sort(), ['open-one', 'open-two']);

  const state = JSON.parse(readFileSync(epicStatePath, 'utf8'));
  assert.equal(state.epic, 'roadmap-debt');
  assert.equal(state.approved, false);
  assert.deepEqual(state.slices.map((s) => s.id), ['A', 'B']);
  assert.deepEqual(state.slices[0].acs, ['AC-001']);
});

test('test_when_slices_share_a_backlog_key_then_source_keys_are_deduped', () => {
  const root = makeRepo({ shards: MIXED_SHARDS });
  const proposal = {
    ...PROPOSAL,
    slices: [
      { id: 'A', title: 'One', acs: ['AC-001'], backlogKeys: ['open-one'] },
      { id: 'B', title: 'Two', acs: ['AC-001'], backlogKeys: ['open-one', 'open-two'] },
    ],
  };

  const { workflowPath } = materializeRetriagedEpic({ rootDir: root, proposal });
  const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));

  assert.deepEqual(workflow.source_backlog_keys.slice().sort(), ['open-one', 'open-two']);
});

// --- the proposal writes nothing until it is materialized (AC-008) ---

test('test_when_proposal_rejected_then_backlog_bytes_unchanged_and_no_state_written', () => {
  const root = makeRepo({ shards: MIXED_SHARDS });
  const before = backlogDigest(root);

  collectOpenBacklog({ memoryDir: join(root, '.claude/memory') });

  assert.equal(backlogDigest(root), before, 'every backlog shard is byte-identical');
  assert.equal(existsSync(join(root, '.claude/state/workflow.json')), false);
  assert.deepEqual(readdirSync(join(root, '.claude/state/epic')), []);
});

test('test_when_epic_materialized_then_absorbed_backlog_shards_are_still_untouched', () => {
  const root = makeRepo({ shards: MIXED_SHARDS });
  const before = backlogDigest(root);

  materializeRetriagedEpic({ rootDir: root, proposal: PROPOSAL });

  assert.equal(
    backlogDigest(root),
    before,
    'closure happens at the epic commit via sweep --mode stamp-closure, never at materialization',
  );
});

// --- contract violations (AC-007) ---

test('test_when_retriage_slug_escapes_then_throws_before_path_construction', () => {
  const root = makeRepo({ shards: MIXED_SHARDS });
  for (const epicSlug of ['../escape', '/abs/path', 'Has Spaces', '']) {
    assert.throws(
      () => materializeRetriagedEpic({ rootDir: root, proposal: { ...PROPOSAL, epicSlug } }),
      /slug/i,
      `slug ${JSON.stringify(epicSlug)} must be rejected, never normalized`,
    );
  }
  assert.deepEqual(readdirSync(join(root, '.claude/state/epic')), [], 'no epic state file was created');
  assert.equal(existsSync(join(root, '.claude/state/workflow.json')), false);
});

test('test_when_workflow_json_already_exists_then_retriage_refuses_to_overwrite', () => {
  const root = makeRepo({ shards: MIXED_SHARDS, withWorkflow: true });
  const before = readFileSync(join(root, '.claude/state/workflow.json'), 'utf8');

  assert.throws(
    () => materializeRetriagedEpic({ rootDir: root, proposal: PROPOSAL }),
    /workflow/i,
  );
  assert.equal(readFileSync(join(root, '.claude/state/workflow.json'), 'utf8'), before);
});

test('test_when_proposal_has_no_slices_then_throws_before_any_write', () => {
  const root = makeRepo({ shards: MIXED_SHARDS });

  assert.throws(
    () => materializeRetriagedEpic({ rootDir: root, proposal: { ...PROPOSAL, slices: [] } }),
    /slice/i,
  );
  assert.equal(existsSync(join(root, '.claude/state/workflow.json')), false);
  assert.deepEqual(readdirSync(join(root, '.claude/state/epic')), []);
});

// --- the retriage mode is documented where an operator will look for it ---

test('test_when_triage_skill_read_then_it_documents_the_retriage_mode', () => {
  const skill = readFileSync(
    new URL('../.claude/skills/triage/SKILL.md', import.meta.url),
    'utf8',
  );
  assert.match(skill, /retriage/i);
  assert.match(skill, /source_backlog_keys/);
});
