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
import { makeWorkspace, writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';

const README_GATE = '.claude/skills/workspace/readme-gate.mjs';

function writeReadme(memDir, documentedFields) {
  const rows = documentedFields.map((f) => `\`${f}\` records something about the element.`).join('\n');
  writeFileSync(join(memDir, 'README.md'),
    `# memory\n\n## Workspace corpus (architecture map)\n\nElements carry these fields.\n\n${rows}\n`, 'utf8');
}

describe('README field claims match disk', () => {
  it('test_when_readme_documents_absent_field_then_docs_gate_fails', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { memDir } = makeProject();
    makeWorkspace(memDir);
    writeWorkspaceElement(memDir, 'subject', { anchor: 'lib/a.mjs', anchor_digest: 'abc123def456' });
    writeReadme(memDir, ['anchor_digest', 'shard', 'granularity']);

    const result = gate.checkReadmeFields({ memDir });

    assert.equal(result.ok, false);
    assert.ok(result.undocumented === undefined || Array.isArray(result.undocumented));
    assert.ok(result.overclaimed.includes('shard'), 'the gate names the field, so the fix is obvious');
    assert.ok(result.overclaimed.includes('granularity'));
  });

  it('test_when_readme_matches_disk_then_docs_gate_passes', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { memDir } = makeProject();
    makeWorkspace(memDir);
    writeWorkspaceElement(memDir, 'subject', { anchor: 'lib/a.mjs', anchor_digest: 'abc123def456' });
    writeReadme(memDir, ['anchor_digest']);

    const result = gate.checkReadmeFields({ memDir });

    assert.equal(result.ok, true, 'documenting exactly what is persisted passes');
    assert.deepEqual(result.overclaimed, []);
  });

  it('test_when_live_readme_checked_then_it_matches_the_live_corpus', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);

    const result = gate.checkReadmeFields({ memDir: join(REPO_ROOT, '.claude', 'memory') });

    assert.equal(result.ok, true,
      `the shipped README overclaims: ${JSON.stringify(result.overclaimed)}`);
  });

  it('test_when_readme_absent_then_gate_is_inert', async () => {
    const gate = await tryImport(README_GATE);
    assert.ok(gate, `${README_GATE} does not exist yet`);
    const { memDir } = makeProject();
    makeWorkspace(memDir);

    const result = gate.checkReadmeFields({ memDir });

    assert.equal(result.ok, true, 'fail-open on an absent README, matching every other memory consumer');
  });
});
