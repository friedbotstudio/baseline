// Workflow-extension-via-workflows-json — cli-copy-review dogfood retrofit
//
// SP-009: this repo's .claude/workflows.jsonl declares a cli-copy-review node
// in the intake-full and tdd-quickfix tracks (between memory-flush and
// grant-commit). The hardcoded conditional in triage SKILL.md is removed in
// the same commit. Two assertions:
//   1. grep -rn "cli-copy-review" .claude/skills/*/SKILL.md returns zero
//      lines (no baseline-owned skill body references the per-project skill).
//   2. workflows.jsonl contains the node in both target tracks at the
//      declared dependency position.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

// Foundation: walk every .claude/skills/<slug>/SKILL.md and search for a
// literal string match. Returns array of `<rel>:<line>: <body>` matches.
async function grepInBaselineOwnedSkills(needle) {
  const skillsDir = path.join(REPO_ROOT, '.claude/skills');
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
    try {
      const content = await fs.readFile(skillPath, 'utf8');
      const fmEnd = content.match(/^---\n[\s\S]*?\n---\n/);
      const owner = fmEnd ? fmEnd[0].match(/^owner:\s*baseline\s*$/m) : null;
      if (!owner) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(needle)) {
          matches.push(`${entry.name}/SKILL.md:${i + 1}: ${lines[i]}`);
        }
      }
    } catch {
      continue;
    }
  }
  return matches;
}

// Foundation: parse .claude/workflows.jsonl into Track[] (raw line parse;
// avoids dependency on the validator module which may not exist yet).
async function readLiveWorkflowsJsonl() {
  const livePath = path.join(REPO_ROOT, '.claude/workflows.jsonl');
  const text = await fs.readFile(livePath, 'utf8');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, idx) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`workflows.jsonl line ${idx + 1}: ${err.message}`);
      }
    });
}

describe('cli-copy-review retrofit (SP-009 / SP-010)', () => {
  it('test_when_grep_cli_copy_review_in_baseline_owned_skills_then_zero_matches', async () => {
    const matches = await grepInBaselineOwnedSkills('cli-copy-review');
    assert.equal(
      matches.length,
      0,
      `Expected zero matches of "cli-copy-review" in baseline-owned SKILL.md bodies; found:\n${matches.join('\n')}`
    );
  });

  it('test_when_workflows_jsonl_contains_cli_copy_review_node_in_intake_full_and_tdd_quickfix_then_node_position_matches_spec', async () => {
    const tracks = await readLiveWorkflowsJsonl();
    for (const expectedTrack of ['intake-full', 'tdd-quickfix']) {
      const track = tracks.find((t) => t.track_id === expectedTrack);
      assert.ok(track, `${expectedTrack}: track must be present in workflows.jsonl`);
      const node = track.nodes.find((n) => n.skill === 'cli-copy-review');
      assert.ok(node, `${expectedTrack}: cli-copy-review node must be declared`);
      assert.ok(
        Array.isArray(node.depends_on) && node.depends_on.includes('memory-flush'),
        `${expectedTrack}: cli-copy-review.depends_on must include 'memory-flush'`
      );
      const grantCommit = track.nodes.find((n) => n.id === 'grant-commit');
      assert.ok(grantCommit, `${expectedTrack}: grant-commit node must be present`);
      assert.ok(
        Array.isArray(grantCommit.depends_on) && grantCommit.depends_on.includes(node.id),
        `${expectedTrack}: grant-commit.depends_on must include the cli-copy-review node id (${node.id})`
      );
    }
  });
});
