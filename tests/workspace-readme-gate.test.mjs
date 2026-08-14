// The README cannot outrun disk (AC-008).
//
// `.claude/memory/README.md` currently states "Elements gained three fields"
// (anchor_digest, shard, granularity) — describing a migration that never ran, for
// a corpus where zero of 14 elements carried any of them. A docs claim that
// outruns disk is the same honesty hazard as a wrong diagram, one level up: a
// reader trusts it and stops checking.
//
// So the correction ships with a gate rather than as a one-off edit.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport, REPO_ROOT } from './helpers/memory-fixtures.mjs';
import {
  makeWorkspace,
  writeWorkspaceConcept,
  writeWorkspaceElement,
  writeWorkspaceShard,
} from './helpers/workspace-fixtures.mjs';

const README_GATE = '.claude/skills/workspace/readme-gate.mjs';

function writeReadme(specDir, documentedFields) {
  const rows = documentedFields.map((f) => `\`${f}\` records something about the element.`).join('\n');
  writeFileSync(join(specDir, 'README.md'),
    `# memory\n\n## Workspace corpus (architecture map)\n\nElements carry these fields.\n\n${rows}\n`, 'utf8');
}

describe('README field claims match disk', () => {
  it('test_when_readme_documents_absent_field_then_docs_gate_fails', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'subject', { anchor: 'lib/a.mjs', anchor_digest: 'abc123def456' });
    writeReadme(specDir, ['anchor_digest', 'shard', 'granularity']);

    const result = gate.checkReadmeFields({ specDir });

    assert.equal(result.ok, false);
    assert.ok(result.undocumented === undefined || Array.isArray(result.undocumented));
    assert.ok(result.overclaimed.includes('shard'), 'the gate names the field, so the fix is obvious');
    assert.ok(result.overclaimed.includes('granularity'));
  });

  it('test_when_readme_matches_disk_then_docs_gate_passes', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'subject', { anchor: 'lib/a.mjs', anchor_digest: 'abc123def456' });
    writeReadme(specDir, ['anchor_digest']);

    const result = gate.checkReadmeFields({ specDir });

    assert.equal(result.ok, true, 'documenting exactly what is persisted passes');
    assert.deepEqual(result.overclaimed, []);
  });

  it('test_when_live_readme_checked_then_it_matches_the_live_corpus', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);

    const result = gate.checkReadmeFields({ specDir: join(REPO_ROOT, 'docs', 'system') });

    assert.equal(result.ok, true,
      `the shipped README overclaims: ${JSON.stringify(result.overclaimed)}`);
  });

  it('test_when_readme_absent_then_gate_is_inert', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);

    const result = gate.checkReadmeFields({ specDir });

    assert.equal(result.ok, true, 'fail-open on an absent README, matching every other memory consumer');
  });
});

// The README cannot outrun disk — the COUNT dimension.
//
// The sibling block above guards the field NAMES the README documents. Nothing
// guarded the numbers beside them, and they drifted: the shipped table claimed 112
// elements and 112 diagram shards against a corpus holding 114 and 114. Same
// honesty hazard, one column over.
//
// Note the deliberate asymmetry with checkReadmeFields. That check is
// one-directional on purpose — documenting FEWER fields than are stored is
// terseness. A count has no terseness reading: 112 against a disk of 114 is false,
// and so is 116. So these scenarios pin BOTH directions as failures.

function writeCountReadme(specDir, rows) {
  const body = rows.map(([dir, count]) => `| \`${dir}/\` | what it holds | ${count} |`).join('\n');
  writeFileSync(join(specDir, 'README.md'),
    `# Central system spec\n\nProse the gate must ignore.\n\n`
    + `| Directory | Holds | Count |\n|---|---|---|\n${body}\n`, 'utf8');
}

function mismatchFor(result, directory) {
  return result.mismatched.find((row) => row.directory === directory);
}

describe('README count claims match disk', () => {
  it('test_when_readme_count_understates_disk_then_gate_fails', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { specDir } = makeProject();
    writeWorkspaceElement(specDir, 'alpha', { anchor: 'lib/a.mjs' });
    writeWorkspaceElement(specDir, 'beta', { anchor: 'lib/b.mjs' });
    writeCountReadme(specDir, [['elements', 1]]);

    const result = gate.checkReadmeCounts({ specDir });

    assert.equal(result.ok, false, 'claiming 1 over a corpus of 2 is a false claim about disk');
    assert.deepEqual(mismatchFor(result, 'elements'), { directory: 'elements', documented: 1, actual: 2 },
      'the gate names the directory and both numbers, so the fix is obvious');
  });

  it('test_when_readme_count_overstates_disk_then_gate_fails', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { specDir } = makeProject();
    writeWorkspaceElement(specDir, 'alpha', { anchor: 'lib/a.mjs' });
    writeWorkspaceElement(specDir, 'beta', { anchor: 'lib/b.mjs' });
    writeCountReadme(specDir, [['elements', 5]]);

    const result = gate.checkReadmeCounts({ specDir });

    assert.equal(result.ok, false,
      'the count check is BIDIRECTIONAL, unlike checkReadmeFields — do not "fix" this into symmetry');
    assert.deepEqual(mismatchFor(result, 'elements'), { directory: 'elements', documented: 5, actual: 2 });
  });

  it('test_when_readme_counts_match_disk_then_gate_passes', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { specDir } = makeProject();
    writeWorkspaceElement(specDir, 'alpha', { anchor: 'lib/a.mjs' });
    writeWorkspaceElement(specDir, 'beta', { anchor: 'lib/b.mjs' });
    writeWorkspaceConcept(specDir, 'cross-cutting');
    writeWorkspaceShard(specDir, 'alpha');
    writeWorkspaceShard(specDir, 'beta');
    writeCountReadme(specDir, [['elements', 2], ['concepts', 1], ['diagrams', 2]]);

    const result = gate.checkReadmeCounts({ specDir });

    assert.equal(result.ok, true, 'stating the exact count for every directory passes');
    assert.deepEqual(result.mismatched, []);
  });

  it('test_when_diagram_shards_counted_then_puml_extension_is_used', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { specDir } = makeProject();
    writeWorkspaceShard(specDir, 'alpha');
    writeWorkspaceShard(specDir, 'beta');
    writeCountReadme(specDir, [['diagrams', 2]]);

    const result = gate.checkReadmeCounts({ specDir });

    assert.equal(result.ok, true,
      'shards are .puml, not .md — a gate counting only .md reports 0 here and fails');
    assert.deepEqual(result.mismatched, []);
  });

  it('test_when_readme_absent_then_count_gate_is_inert', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);

    const result = gate.checkReadmeCounts({ specDir });

    assert.equal(result.ok, true, 'a project that ships no README has made no claim to contradict');
    assert.deepEqual(result.mismatched, []);
  });

  it('test_when_readme_has_no_count_table_then_gate_is_inert', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'alpha', { anchor: 'lib/a.mjs' });
    writeFileSync(join(specDir, 'README.md'),
      '# Central system spec\n\nProse only. No directory rows, so no count is claimed.\n', 'utf8');

    const result = gate.checkReadmeCounts({ specDir });

    assert.equal(result.ok, true, 'no parsed claim means no claim to contradict');
    assert.deepEqual(result.mismatched, []);
  });

  it('test_when_live_readme_checked_then_counts_match_the_live_corpus', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);

    const result = gate.checkReadmeCounts({ specDir: join(REPO_ROOT, 'docs', 'system') });

    assert.equal(result.ok, true,
      `the shipped README miscounts: ${JSON.stringify(result.mismatched)}`);
  });
});

// AC-004 — the delta fold writes the README count.
//
// `verifyAndApplyDelta` writes the element record and its shard for a confirmed
// `add` row and leaves the README Count column untouched, so the fold makes its
// own README false in the same call. `checkReadmeCounts` then enforces that
// column, which is why three tests went red on a tree where nothing was wrong
// except a number nobody wrote.
//
// This fires on EVERY workflow whose spec declares a confirmed `add` row, at
// /archive, after the suite was already green — which is why it kept being
// discovered by whoever ran next rather than by whoever caused it. The count is
// derivable from the same directory read the fold already performs; writing it
// is the same write. Do NOT relax the gate instead: the gate is what makes the
// census a fact rather than a claim.
describe('delta fold — the README count rides the same call (AC-004)', () => {
  const DELTA = '.claude/skills/workspace/delta.mjs';

  it('test_when_delta_fold_applies_add_row_then_readme_count_is_written', async () => {
    const delta = await tryImport(DELTA);
    const gate = await tryImport(README_GATE);
    assert.ok(delta?.applyReadmeCount, `${DELTA} must export applyReadmeCount`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'alpha', { anchor: 'lib/a.mjs' });
    writeWorkspaceElement(specDir, 'beta', { anchor: 'lib/b.mjs' });
    writeCountReadme(specDir, [['elements', 1]]);

    delta.applyReadmeCount({ specDir });

    assert.equal(gate.checkReadmeCounts({ specDir }).ok, true,
      'after the fold writes the count, the gate it owes must be satisfied immediately — ' +
      'not on the next workflow, and not by hand');
  });

  it('test_when_two_add_rows_applied_then_readme_count_reflects_both', async () => {
    const delta = await tryImport(DELTA);
    assert.ok(delta?.applyReadmeCount, `${DELTA} must export applyReadmeCount`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);
    for (const name of ['alpha', 'beta', 'gamma']) {
      writeWorkspaceElement(specDir, name, { anchor: `lib/${name}.mjs` });
    }
    writeCountReadme(specDir, [['elements', 1]]);

    delta.applyReadmeCount({ specDir });

    assert.match(readFileSync(join(specDir, 'README.md'), 'utf8'), /\|\s*3\s*\|/,
      'the count must be re-derived from the directory, not incremented once per row — ' +
      'an increment silently under-counts a two-row fold');
  });

  it('test_when_readme_absent_then_check_returns_ok', async () => {
    const delta = await tryImport(DELTA);
    const gate = await tryImport(README_GATE);
    assert.ok(delta?.applyReadmeCount, `${DELTA} must export applyReadmeCount`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'alpha', { anchor: 'lib/a.mjs' });

    delta.applyReadmeCount({ specDir });

    assert.equal(gate.checkReadmeCounts({ specDir }).ok, true,
      'no README means no claim to contradict; the fold must not invent one where the ' +
      'project never made a claim');
  });
});
