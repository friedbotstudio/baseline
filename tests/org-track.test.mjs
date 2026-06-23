import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// org-team-charter — the new `org` selectable track (AC-001). RED until /implement
// adds the org Track record to .claude/workflows.jsonl. Real file + the shipped
// invariant validator (no mocks, Art VI.3).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const tracks = () =>
  readFileSync(join(ROOT, '.claude/workflows.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));

test('test_when_org_track_added_then_it_is_a_selectable_track_with_hints', () => {
  const org = tracks().find((t) => t.track_id === 'org');
  assert.ok(org, 'an `org` Track record exists in workflows.jsonl');
  assert.equal(org.selectable, true, 'org is a selectable track (a Phase-6 execution option)');
  assert.ok(org.selector_hints && String(JSON.stringify(org.selector_hints)).length > 2, 'org carries selector_hints for triage classification');
  assert.ok(Array.isArray(org.nodes) && org.nodes.length > 0, 'org has a node DAG');
});

test('test_when_org_track_added_then_workflows_jsonl_validates_I1_through_I11', () => {
  // The shipped validator exits 0 only when every Track (org included) satisfies the
  // §18 invariants I1..I11, and reports its summary on stderr.
  const r = spawnSync('node', ['.claude/skills/triage/seed-tasklist.mjs', '--validate-only'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `validator exits 0 (all tracks valid); stderr: ${r.stderr}`);
  const out = `${r.stdout}${r.stderr}`;
  assert.match(out, /validated \d+ tracks/i, 'validator reports a successful validation across all tracks');
  const n = Number((out.match(/validated (\d+) tracks/i) || [])[1]);
  assert.ok(n >= 10, `track count grew to include org (got ${n})`);
});

test('test_when_org_track_materializes_then_dag_emits_without_error', () => {
  // The materializer renders the org DAG into a TaskList JSON; a malformed track would
  // throw. We assert it produces a non-empty task array for the org track.
  const out = execFileSync('node', ['.claude/skills/triage/seed-tasklist.mjs', 'org', 'sample-org-slug'], { cwd: ROOT, encoding: 'utf8' });
  const tasklist = JSON.parse(out);
  assert.ok(Array.isArray(tasklist) && tasklist.length > 0, 'org track materializes a non-empty TaskList');
});
