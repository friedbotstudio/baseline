// committing-tracks-declare-archive — mechanizes the seed.md archive rule.
//
// seed.md states in three places that archive always runs on a committing track:
//   §14  "one stripped-down chore track (skips TDD; runs archive mandatorily ...)"
//   §285 "`archive` and `/grant-commit` + `/commit` always run."
//   §373 "`archive / /grant-commit / /commit` always run"
// CLAUDE.md Art. IV and chore/SKILL.md agree. Nothing enforced it, so the chore
// DAG shipped without an archive node and `deriveExceptions` auto-excepted the
// phase on every chore workflow — silently, in both the live file and the
// consumer template.
//
// The assertion runs against BOTH workflows.jsonl files. That is the point: a
// single-file check would not have caught this, because live and template
// drifted together.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

const WORKFLOW_FILES = [
  { label: 'live', rel: '.claude/workflows.jsonl' },
  { label: 'template', rel: 'src/.claude/workflows.template.jsonl' },
];

// Tracks that declare grant-commit but legitimately omit archive. Each entry
// carries its reason: a bare allowlist would invite a future reader to "fix"
// one of these and break the behavior it protects.
const ARCHIVE_EXEMPT = new Map([
  [
    'freeform',
    'CLAUDE.md Art. IV lists archive among freeform\'s deliberate blanket exceptions; '
      + 'its DAG carries only roadmap-sync -> memory-sync -> grant-commit -> commit.',
  ],
  [
    'epic',
    'An epic is discovery-only and its spec must stay live at docs/specs/<epic>.md so '
      + 'epic-child workflows can pin it (track_guard enforces the pin). Archiving at '
      + 'epic-commit time would move the file the children depend on; epic_close.mjs '
      + 'archives the bundle when the last child commits (commit/SKILL.md Step 2.8).',
  ],
]);

const hasPhase = (track, phase) =>
  track.nodes.some((node) => node.metadata && node.metadata.phase === phase);

let validator;
try {
  validator = await import(path.join(REPO_ROOT, 'src/cli/workflows-validator.js'));
} catch (err) {
  throw new Error(`cannot load workflows-validator: ${err.message}`);
}

async function loadTracks(rel) {
  const result = await validator.validateWorkflowsJsonl(path.join(REPO_ROOT, rel));
  assert.equal(result.ok, true, `${rel} failed validation: ${JSON.stringify(result.errors)}`);
  return result.tracks;
}

describe('every committing track declares an archive phase', () => {
  for (const { label, rel } of WORKFLOW_FILES) {
    it(`test_when_a_committing_track_declares_grant_commit_then_it_also_declares_archive__${label}`, async () => {
      const tracks = await loadTracks(rel);
      const committing = tracks.filter((t) => hasPhase(t, 'grant-commit'));
      assert.ok(committing.length > 0, `${rel} declares no committing tracks at all`);

      const offenders = committing
        .filter((t) => !ARCHIVE_EXEMPT.has(t.track_id))
        .filter((t) => !hasPhase(t, 'archive'))
        .map((t) => t.track_id);

      assert.deepEqual(
        offenders,
        [],
        `${rel}: these tracks commit but never archive, contradicting seed.md §14/§285/§373: ${offenders.join(', ')}`,
      );
    });
  }

  it('test_when_a_track_is_archive_exempt_then_it_is_still_a_committing_track', async () => {
    // Guards the exemption list itself: an entry that no longer commits (or no
    // longer exists) is stale and would silently widen the exemption.
    const tracks = await loadTracks(WORKFLOW_FILES[0].rel);
    const byId = new Map(tracks.map((t) => [t.track_id, t]));
    for (const [trackId, reason] of ARCHIVE_EXEMPT) {
      const track = byId.get(trackId);
      assert.ok(track, `exempt track '${trackId}' no longer exists; drop it from ARCHIVE_EXEMPT`);
      assert.ok(
        hasPhase(track, 'grant-commit'),
        `exempt track '${trackId}' no longer commits, so the exemption is moot; drop it. Reason on file: ${reason}`,
      );
    }
  });
});
