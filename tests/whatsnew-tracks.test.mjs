// whatsnew cutover — the changelog node is removed from every selectable track
// and both materializer mirrors drop the changelog label (AC-004).
//
// RED until .claude/workflows.jsonl + src/.claude/workflows.template.jsonl drop
// the changelog node (commit depends directly on grant-commit) and the
// materializer mirrors drop the 'Running changelog' label.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const r = (p) => join(REPO_ROOT, p);

const TRACK_FILES = ['.claude/workflows.jsonl', 'src/.claude/workflows.template.jsonl'];
const MATERIALIZERS = ['.claude/skills/triage/track-tasklist-materializer.js', 'src/cli/track-tasklist-materializer.js'];

function selectableTracks(file) {
  return readFileSync(r(file), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
    .filter((t) => t.selectable !== false);
}

describe('whatsnew track cutover', () => {
  for (const file of TRACK_FILES) {
    it(`test_when_tracks_loaded_then_no_changelog_node — ${file}`, () => {
      for (const track of selectableTracks(file)) {
        const ids = (track.nodes || []).map((n) => n.id);
        assert.equal(ids.includes('changelog'), false, `${file} track ${track.track_id} must have no changelog node`);
        const commit = (track.nodes || []).find((n) => n.id === 'commit');
        if (commit) {
          assert.deepEqual(commit.depends_on, ['grant-commit'], `${file} ${track.track_id}: commit must depend on grant-commit`);
        }
      }
    });
  }

  for (const file of MATERIALIZERS) {
    it(`test_when_materializer_mirrors_then_no_changelog_label — ${file}`, () => {
      const src = readFileSync(r(file), 'utf8');
      assert.equal(src.includes("'Running changelog'"), false, `${file} must not emit a changelog activeForm label`);
    });
  }
});
