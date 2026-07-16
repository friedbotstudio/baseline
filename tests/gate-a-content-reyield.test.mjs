// gate-A content re-yield — structural contracts over the shipped SOP surfaces.
//
// T1 of harden-power-track-debt. `project.json → test.kind` is "structural", so
// asserting on shipped SOP prose is the repo convention. RED until /implement
// edits approve-spec.md (writes the content-hash token line) and harness/SKILL.md
// (resume recomputes + re-yields on mismatch).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const read = (rel) => readFileSync(path.join(REPO_ROOT, rel), 'utf8');

describe('approve-direction command writes a content-hash token line', () => {
  // AC-001 (gate-collapse D3/CO-E: /approve-spec renamed to /approve-direction)
  it('test_when_approve_direction_command_read_then_it_writes_a_content_hash_line', () => {
    const cmd = read('.claude/commands/approve-direction.md');
    assert.match(cmd, /computeSpecContentHash|content[- ]hash|content_sha256/i,
      'approve-direction must document computing the artifact content hash');
    assert.match(cmd, /spec-content-hash\.mjs/,
      'approve-direction must name the helper module');
  });
});

describe('harness resume recomputes and re-yields on a post-approval amendment', () => {
  const harness = () => read('.claude/skills/harness/SKILL.md');

  // AC-002
  it('test_when_harness_skill_read_then_resume_documents_hash_recompare', () => {
    const text = harness();
    assert.match(text, /content[- ]hash|computeSpecContentHash|compareSpecHash/i,
      'resume must document recomputing the spec content hash');
  });

  // AC-002
  it('test_when_harness_skill_read_then_a_mismatch_re_yields_at_gate_a', () => {
    const text = harness();
    assert.match(text, /re-?yield/i, 'resume must re-yield on mismatch');
    assert.match(text, /mismatch|amend|differ/i, 'resume must name the amendment/mismatch trigger');
  });
});
