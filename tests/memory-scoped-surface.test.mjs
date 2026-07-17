// Scenario for decision-point surfacing — AC-003, the -7f3a fix. Covers
// §Behavior #3: fact files tagged `scope: spec` are surfaced verbatim when a
// spec artifact is about to be written. Fails RED until scoped-memory.mjs lands.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const SCOPED = pathToFileURL(join(REPO_ROOT, '.claude/hooks/lib/scoped-memory.mjs')).href;

const OUTCOME_AC_VERBATIM = 'an outcome-AC with no diff line wedges drift_check';

function seedScopedStore() {
  const root = mkdtempSync(join(tmpdir(), 'mem-scope-'));
  const lm = join(root, '.claude/memory/landmines');
  mkdirSync(lm, { recursive: true });
  writeFileSync(join(lm, 'outcome-ac.md'), `---
key: outcome-ac
category: landmines
scope: [spec]
source: incident
verified-at: abc1234
last-touched: 2026-07-17
---

> verbatim (incident, 2026-07-10):
> ${OUTCOME_AC_VERBATIM}

Classify every AC as behavioural or process/outcome before writing the AC table.
`);
  writeFileSync(join(lm, 'unrelated.md'), `---
key: unrelated
category: landmines
scope: [security]
source: incident
verified-at: abc1234
last-touched: 2026-07-17
---

> verbatim (incident, 2026-06-01):
> something about bash

irrelevant to spec authoring
`);
  return root;
}

describe('scoped-memory — surface at the decision point (AC-003)', () => {
  it('test_when_write_to_spec_artifact_then_scoped_landmine_surfaced', async () => {
    const root = seedScopedStore();
    try {
      const { surfaceScopedMemory } = await import(SCOPED);
      const hits = surfaceScopedMemory('spec', { rootDir: root });
      assert.ok(Array.isArray(hits), 'returns an array');
      const keys = hits.map((h) => h.key);
      assert.ok(keys.includes('outcome-ac'), 'the scope:[spec] landmine surfaces at spec time');
      assert.ok(!keys.includes('unrelated'), 'a scope:[security] entry does NOT surface at spec time');
      const hit = hits.find((h) => h.key === 'outcome-ac');
      assert.match(hit.verbatim, new RegExp(OUTCOME_AC_VERBATIM), 'the verbatim (not just an interpretation) is surfaced');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_no_scoped_facts_then_empty_never_throws', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mem-scope-empty-'));
    try {
      mkdirSync(join(root, '.claude/memory/landmines'), { recursive: true });
      const { surfaceScopedMemory } = await import(SCOPED);
      assert.deepEqual(surfaceScopedMemory('spec', { rootDir: root }), [], 'no scoped facts -> [] (never throws)');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
