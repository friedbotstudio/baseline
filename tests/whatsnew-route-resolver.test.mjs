// whatsnew generator — route-resolver.mjs (AC-002, AC-006).
//
// The optional project.json → whatsnew.route_workflow knob names a per-project
// routing workflow that consumes the fragment. Absent/null resolves to null
// (read-time default) so the generator still succeeds with no routing target.
//
// RED until .claude/skills/whatsnew/route-resolver.mjs exists and exports
// resolveRouteWorkflow(project).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loadResolver = () => import(join(REPO_ROOT, '.claude/skills/whatsnew/route-resolver.mjs'));

describe('whatsnew route-resolver', () => {
  it('test_when_route_workflow_set_then_resolves', async () => {
    const { resolveRouteWorkflow } = await loadResolver();
    assert.equal(resolveRouteWorkflow({ whatsnew: { route_workflow: 'whatsnew-publish' } }), 'whatsnew-publish');
  });

  it('test_when_route_workflow_absent_then_null', async () => {
    const { resolveRouteWorkflow } = await loadResolver();
    assert.equal(resolveRouteWorkflow({}), null);
    assert.equal(resolveRouteWorkflow({ whatsnew: {} }), null);
    assert.equal(resolveRouteWorkflow({ whatsnew: { route_workflow: null } }), null);
  });

  it('test_when_route_workflow_malformed_then_error', async () => {
    const { resolveRouteWorkflow } = await loadResolver();
    assert.throws(
      () => resolveRouteWorkflow({ whatsnew: { route_workflow: 42 } }),
      /whatsnew\.route_workflow/,
    );
  });
});
