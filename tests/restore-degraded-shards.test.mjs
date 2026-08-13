// Ticket diagram-shard-rewrite-loses-fields — D2, D4 (AC-005, AC-006, AC-009, AC-010).
//
// The repair restores each degraded shard from the last blob in git history that
// carried four arguments. Git is the primary source and is tried first for every
// candidate: element records hold id/kind/title/anchor and no techn, and 51 shards
// declare `subsystem` there while their record reads `kind: component`. Only when
// history holds nothing does the record supply label and description, leaving techn
// as the kind — additive, because a shard that was never rich has no techn to lose.
//
// Every fixture is a real temp git repo. The live corpus is never a fixture here:
// the repair mutates it, so a test anchored to its state passes once and then fails
// forever.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { tryImport } from './helpers/memory-fixtures.mjs';

const REPAIR = '.claude/skills/workspace/restore-degraded-shards.mjs';
const DIAGRAMS = 'docs/system/diagrams';
const ELEMENTS = 'docs/system/elements';

const RICH_ARGS = '"src/example/*.mjs", "subsystem", "Example subsystem"';
const DEGRADED_ARGS = '"example-element", "c4_component"';

async function loadRepair() {
  const mod = await tryImport(REPAIR);
  assert.ok(mod, `${REPAIR} must export restoreDegradedShards({rootDir, dryRun})`);
  assert.equal(typeof mod.restoreDegradedShards, 'function', 'expected named export `restoreDegradedShards`');
  return mod.restoreDegradedShards;
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function shardBlock(section, args) {
  return ['!startsub ' + section, "' @kind c4_component", `Component(${section}, ${args})`, '!endsub', ''].join('\n');
}

function writeShard(root, elementId, args) {
  const section = elementId.replace(/-/g, '_');
  const path = join(root, DIAGRAMS, `${elementId}.puml`);
  mkdirSync(join(root, DIAGRAMS), { recursive: true });
  writeFileSync(path, shardBlock(section, args), 'utf8');
  return path;
}

function writeElementRecord(root, elementId, { anchor, title }) {
  mkdirSync(join(root, ELEMENTS), { recursive: true });
  writeFileSync(
    join(root, ELEMENTS, `${elementId}.md`),
    ['---', `id: ${elementId}`, 'kind: component', `title: ${title}`, `anchor: ${anchor}`, '---', ''].join('\n'),
    'utf8',
  );
}

function commitAll(root, message) {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', message);
}

// Seeds one shard and commits it. A test that needs a second state (rich, then
// degraded) writes and commits that itself — keeping the builder to a single
// commit is what lets the history-walk test control the shape of that history.
function seedRepo(elementId, args) {
  const root = mkdtempSync(join(tmpdir(), 'shardrepair-'));
  const shard = writeShard(root, elementId, args);
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'fixture');
  commitAll(root, 'seed');
  return { root, shard };
}

describe('D2 — git history is the primary source (AC-005)', () => {
  it('test_when_a_degraded_shard_has_a_rich_blob_in_history_then_it_is_restored_byte_identical', async () => {
    const restoreDegradedShards = await loadRepair();
    const { root, shard } = seedRepo('example-element', RICH_ARGS);
    const rich = readFileSync(shard, 'utf8');
    writeShard(root, 'example-element', DEGRADED_ARGS);
    commitAll(root, 'degrade it');

    const report = await restoreDegradedShards({ rootDir: root });

    assert.equal(report.restored.length, 1, `the shard is degraded on disk and history holds a rich blob, so it must be restored. Report: ${JSON.stringify(report)}`);
    assert.equal(report.restored[0].content, rich, 'the restored bytes must equal the historical blob exactly');
    assert.match(readFileSync(shard, 'utf8'), /"subsystem"/, 'recovering the techn is the whole point — it exists in no other source');
  });

  it('test_when_the_repair_runs_twice_then_the_second_run_changes_nothing', async () => {
    const restoreDegradedShards = await loadRepair();
    const { root, shard } = seedRepo('example-element', RICH_ARGS);
    writeShard(root, 'example-element', DEGRADED_ARGS);
    commitAll(root, 'degrade it');

    await restoreDegradedShards({ rootDir: root });
    const after = statSync(shard).mtimeMs;
    const second = await restoreDegradedShards({ rootDir: root });

    assert.equal(second.restored.length, 0, 'a restored shard is no longer a candidate');
    assert.equal(statSync(shard).mtimeMs, after, 'an idempotent repair rewrites nothing on the second run');
  });
});

describe('D2 — the element record is the fallback, never the primary (AC-006, AC-009)', () => {
  it('test_when_history_is_empty_but_a_record_exists_then_the_shard_is_restored_from_the_record', async () => {
    const restoreDegradedShards = await loadRepair();
    const { root, shard } = seedRepo('example-element', DEGRADED_ARGS);
    writeElementRecord(root, 'example-element', { anchor: 'src/example/*.mjs', title: 'Example subsystem' });
    commitAll(root, 'add the record');

    const report = await restoreDegradedShards({ rootDir: root });
    const text = readFileSync(shard, 'utf8');

    assert.equal(report.restored.length, 0, 'nothing came from history, so the git-restored list stays empty');
    assert.deepEqual(
      report.recordRestored.map((r) => r.path),
      [`${DIAGRAMS}/example-element.puml`],
      'a record-sourced restore is reported separately from a git-sourced one — a reader must be able to tell which shards were recovered losslessly',
    );
    assert.match(text, /"src\/example\/\*\.mjs"/, 'label takes the record anchor');
    assert.match(text, /"Example subsystem"/, 'description takes the record title');
    assert.match(text, /"c4_component"/, 'techn is left as the kind — the record has none to give, and this shard never had one to lose');
  });

  it('test_when_neither_history_nor_a_record_exists_then_the_shard_is_reported_unrestorable', async () => {
    const restoreDegradedShards = await loadRepair();
    const { root, shard } = seedRepo('example-element', DEGRADED_ARGS);
    const before = readFileSync(shard, 'utf8');

    const report = await restoreDegradedShards({ rootDir: root });

    assert.deepEqual(report.unrestorable, [`${DIAGRAMS}/example-element.puml`], 'with no blob and no record the shard must be named, not guessed at');
    assert.equal(report.restored.length + report.recordRestored.length, 0, 'nothing is restored when nothing is recoverable');
    assert.equal(readFileSync(shard, 'utf8'), before, 'the file is left byte-identical — the repair never invents content');
  });
});

// Security review 2026-08-12, MEDIUM. The section is the one Component argument
// that does not pass through quotedArgument, and rebuiltFromRecord used to read it
// back out of the very file it was repairing. `Component([^,]+, ...)` admits quotes
// and parens, so a corrupt shard propagated its corruption into a file the repair
// then reported as successfully restored — plantuml -checkonly exits 200 on the
// result. The id, not the file, is the authority for the section.
describe('the section is derived, never copied from the file under repair', () => {
  it('test_when_the_degraded_shard_carries_a_malformed_section_then_the_section_is_derived_from_the_id', async () => {
    const restoreDegradedShards = await loadRepair();
    const { root, shard } = seedRepo('example-element', DEGRADED_ARGS);
    writeFileSync(
      shard,
      ['!startsub example_element', "' @kind c4_component", `Component(x") junk(, ${DEGRADED_ARGS})`, '!endsub', ''].join('\n'),
      'utf8',
    );
    writeElementRecord(root, 'example-element', { anchor: 'src/example/*.mjs', title: 'Example subsystem' });
    commitAll(root, 'malformed section plus a record');

    const report = await restoreDegradedShards({ rootDir: root });
    const text = readFileSync(shard, 'utf8');

    assert.equal(report.recordRestored.length, 1, 'the shard still matches the degraded fingerprint, so it is still a candidate');
    assert.match(text, /^Component\(example_element, /m, 'the section must come from the element id, which is the canonical join');
    assert.ok(!text.includes('junk('), 'the malformed section must not survive into a file the repair calls restored');
  });
});

describe('a repair never writes through a link and never dies on a stray entry', () => {
  it('test_when_a_diagram_entry_is_a_directory_then_it_is_skipped_without_throwing', async () => {
    const restoreDegradedShards = await loadRepair();
    const { root } = seedRepo('example-element', DEGRADED_ARGS);
    writeElementRecord(root, 'example-element', { anchor: 'src/example/*.mjs', title: 'Example subsystem' });
    mkdirSync(join(root, DIAGRAMS, 'not-a-file.puml'), { recursive: true });
    commitAll(root, 'a directory wearing a shard name');

    const report = await restoreDegradedShards({ rootDir: root });

    assert.equal(report.recordRestored.length, 1, 'the real shard is still repaired — one bad entry must not abort the sweep');
    assert.ok(
      !report.unrestorable.includes(`${DIAGRAMS}/not-a-file.puml`),
      'a directory is not a damaged shard, so it belongs in no report bucket',
    );
  });

  it('test_when_a_shard_is_a_symlink_then_it_is_reported_unrestorable_and_the_target_is_untouched', async () => {
    const restoreDegradedShards = await loadRepair();
    const { root } = seedRepo('example-element', DEGRADED_ARGS);
    const target = join(root, 'outside.puml');
    writeFileSync(target, shardBlock('example_element', DEGRADED_ARGS), 'utf8');
    const before = readFileSync(target, 'utf8');
    symlinkSync(target, join(root, DIAGRAMS, 'linked-element.puml'));
    writeElementRecord(root, 'linked-element', { anchor: 'src/linked/*.mjs', title: 'Linked' });

    const report = await restoreDegradedShards({ rootDir: root });

    assert.ok(
      report.unrestorable.includes(`${DIAGRAMS}/linked-element.puml`),
      'a symlinked shard is named rather than followed — writing through it would land content outside the corpus',
    );
    assert.equal(readFileSync(target, 'utf8'), before, 'the link target must be byte-identical');
  });
});

describe('D4 — a candidate is matched by fingerprint, not argument count (AC-010)', () => {
  it('test_when_a_three_argument_shard_carries_a_real_label_then_it_is_not_a_candidate', async () => {
    const restoreDegradedShards = await loadRepair();
    const { root, shard } = seedRepo('example-element', '"Pinned spec resolver", "c4_component"');
    const before = readFileSync(shard, 'utf8');

    const report = await restoreDegradedShards({ rootDir: root });

    assert.equal(
      report.restored.length + report.recordRestored.length + report.unrestorable.length,
      0,
      'a shard whose label is a real string was never degraded — three arguments alone is what a new shard with no description looks like, and reporting it as damage makes the report untrustworthy',
    );
    assert.equal(readFileSync(shard, 'utf8'), before, 'a healthy shard is untouched');
  });
});
