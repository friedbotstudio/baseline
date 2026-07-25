// -a8d2 — timing.mjs path builders lack the assertSafeSlug guard applied in
// sibling modules. RED until timingPath/approvalTokenPath validate before
// building a path.
//
// Covers: AC-004 (a traversing workflow slug writes nothing outside
// .claude/state/timing/, and stampFromWorkflow still honours its documented
// "Idempotent; never throws" contract).
//
// Severity is LOW by design — wf.slug comes from an in-repo, Claude-authored
// file, not network input. This is a consistency gap with guarded siblings
// (plan-store calls assertSafeSlug inside planPath), not an exploitable hole.
// The rule when fixing: REJECT, never normalize.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TIMING_MODULE = join(REPO_ROOT, '.claude/hooks/lib/timing.mjs');

const TRAVERSING_SLUG = '../../escape';

function workflowRoot(slug, completed = ['spec']) {
  const root = mkdtempSync(join(tmpdir(), 'timing-guard-'));
  mkdirSync(join(root, '.claude', 'state'), { recursive: true });
  writeFileSync(
    join(root, '.claude/state/workflow.json'),
    JSON.stringify({ slug, track_id: 'spec-entry', completed, created_at: 1_700_000_000 }),
  );
  return root;
}

function filesUnder(dir) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.push(relative(dir, full));
    }
  };
  if (existsSync(dir)) walk(dir);
  return found;
}

describe('AC-004 timing path builders reject a traversing slug', () => {
  it('test_when_workflow_slug_traverses_then_timing_writes_nothing_and_does_not_throw', async () => {
    const { stampFromWorkflow } = await import(TIMING_MODULE);
    const root = workflowRoot(TRAVERSING_SLUG);

    assert.doesNotThrow(
      () => stampFromWorkflow({ rootDir: root }),
      'stampFromWorkflow must keep its documented never-throws contract',
    );

    const written = filesUnder(root).filter((p) => p !== '.claude/state/workflow.json');
    const escaped = written.filter((p) => !p.startsWith(join('.claude', 'state', 'timing')));
    assert.deepEqual(escaped, [], `no file may be written outside state/timing, got ${JSON.stringify(escaped)}`);
  });

  it('test_when_workflow_slug_traverses_then_no_jsonl_lands_outside_the_root', async () => {
    const { stampFromWorkflow } = await import(TIMING_MODULE);
    const parent = mkdtempSync(join(tmpdir(), 'timing-parent-'));
    const root = join(parent, 'nested', 'repo');
    mkdirSync(join(root, '.claude', 'state'), { recursive: true });
    writeFileSync(
      join(root, '.claude/state/workflow.json'),
      JSON.stringify({ slug: TRAVERSING_SLUG, track_id: 'spec-entry', completed: ['spec'], created_at: 1_700_000_000 }),
    );

    stampFromWorkflow({ rootDir: root });

    // A traversal from <root>/.claude/state/timing/ lands back in <parent>/nested.
    const strays = filesUnder(parent).filter((p) => p.endsWith('.jsonl') && !p.includes(join('.claude', 'state', 'timing')));
    assert.deepEqual(strays, [], `traversal escaped the timing dir: ${JSON.stringify(strays)}`);
  });

  it('test_when_workflow_slug_is_safe_then_stamp_still_lands_in_timing_dir', async () => {
    const { stampFromWorkflow } = await import(TIMING_MODULE);
    const root = workflowRoot('a-real-workflow');

    stampFromWorkflow({ rootDir: root });

    const timingFile = join(root, '.claude/state/timing/a-real-workflow.jsonl');
    assert.ok(existsSync(timingFile), 'a safe slug must still be stamped');
    assert.ok(statSync(timingFile).size > 0, 'the stamp must carry content');
  });

  it('test_when_path_builders_are_called_directly_then_hostile_slug_throws', async () => {
    const mod = await import(TIMING_MODULE);
    // The builders are module-private today; the hoist must export them so the
    // guard is directly testable rather than only observable through side effects.
    assert.equal(typeof mod.timingPath, 'function', 'timing.mjs must export timingPath');
    assert.equal(typeof mod.approvalTokenPath, 'function', 'timing.mjs must export approvalTokenPath');
    for (const build of [mod.timingPath, mod.approvalTokenPath]) {
      assert.throws(() => build('/tmp/x', TRAVERSING_SLUG), Error, 'path builders must reject a traversing slug');
    }
  });
});
