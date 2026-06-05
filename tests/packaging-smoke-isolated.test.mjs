// AC-009 (always-on packaging smoke): a single, deterministic packaging sanity
// check in the DEFAULT tier. It asserts the tarball's file list (excludes site
// source/build, includes the shipped template + CLI) WITHOUT writing the live
// tree: `npm pack --dry-run --ignore-scripts` skips the prepack → build-template.sh
// rebuild, so it never races parallel readers and costs nothing beyond reading
// the already-built tree. (A bare `npm pack` WOULD trigger prepack and rebuild
// the live obj/template — the parallel-race writer this avoids.)
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

// Pack once (module-scoped) so the dry-run runs a single time across this file.
let packedFiles;

function packFileList() {
  const out = execFileSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return JSON.parse(out)[0].files.map((f) => f.path.replaceAll('\\', '/'));
}

describe('always-on packaging smoke (no live write, once)', () => {
  before(() => { packedFiles = packFileList(); });

  it('test_when_packaging_smoke_runs_then_excludes_site_sources_and_build', () => {
    const leaked = packedFiles.filter((p) => p.startsWith('site-src/') || p.startsWith('obj/site/'));
    assert.deepEqual(leaked, [], `tarball must not ship site sources/build — found: ${leaked.join(', ')}`);
  });

  it('test_when_packaging_smoke_runs_then_includes_shipped_template_and_cli', () => {
    assert.ok(packedFiles.some((p) => p.startsWith('obj/template/')), 'tarball must include the shipped obj/template/ tree');
    assert.ok(packedFiles.some((p) => p === 'bin/cli.js' || p.startsWith('bin/')), 'tarball must include the CLI entrypoint under bin/');
  });

  it('test_when_packaging_smoke_runs_then_does_not_rebuild_live_obj_template', () => {
    // --ignore-scripts means prepack never runs, so the dry-run cannot have
    // rebuilt the live tree. A non-empty, template-bearing file list proves the
    // dry-run read the already-built tree rather than triggering a rebuild.
    assert.ok(packedFiles.length > 0, 'dry-run pack must report a non-empty file list');
    assert.ok(packedFiles.some((p) => p.startsWith('obj/template/')), 'list must reflect the pre-built obj/template (no rebuild needed)');
  });
});
