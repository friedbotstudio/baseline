// Ticket C — shard storage and on-demand view generation (AC-009..AC-012, AC-023).
//
// Views are OUTPUT, never storage (epic decision D3). The composition half is
// asserted on the wrapper text so it runs in the default suite; only the actual
// JVM render is opt-in, per the recipe's skip_conditions.jvm_render. The
// jar-absent test is deliberately NOT gated — it is the only default-suite guard
// against silently falling back to the remote PlantUML server.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, join, readdirSync, makeProject, tryImport } from './helpers/memory-fixtures.mjs';
import { makeDiagrams, makeWorkspace, writeWorkspaceConcept, writeWorkspaceElement, writeWorkspaceShard } from './helpers/workspace-fixtures.mjs';

const SHARDS = '.claude/skills/workspace/shards.mjs';
const RENDER = '.claude/skills/workspace/render.mjs';
const JAR = join(process.cwd(), '.claude/bin/plantuml.jar');

// Same probe as .claude/hooks/plantuml_syntax_guard.mjs hasJava().
function hasJava() {
  const r = spawnSync('which', ['java'], { encoding: 'utf8' });
  return r.status === 0 && (r.stdout || '').trim() !== '';
}

// Layered per the recipe: the env gate is the repo convention (keeps the default
// suite hermetic); the hasJava arm turns an opted-in run on a JVM-less box into a
// NAMED skip rather than a spurious failure.
const JVM_SKIP = process.env.PLANTUML_TESTS
  ? (hasJava() ? false : 'PLANTUML_TESTS=1 set but no java on PATH')
  : 'set PLANTUML_TESTS=1 to run JVM-spawning PlantUML tests';

function seedTwoShards(specDir) {
  makeWorkspace(specDir);
  writeWorkspaceElement(specDir, 'alpha', { anchor: 'a/**', shard: 'diagrams/alpha.puml' });
  writeWorkspaceElement(specDir, 'beta', { anchor: 'b/**', shard: 'diagrams/beta.puml' });
  writeWorkspaceShard(specDir, 'alpha');
  writeWorkspaceShard(specDir, 'beta');
}

describe('C — shards and views', () => {
  it('test_when_shards_composed_then_wrapper_includes_each_section', async () => {
    const render = await tryImport(RENDER);
    assert.ok(render, `${RENDER} does not exist yet`);
    const { specDir } = makeProject();
    seedTwoShards(specDir);

    const wrapper = render.composeView(specDir, { elements: ['alpha', 'beta'] });
    assert.match(wrapper, /!includesub .*alpha\.puml!alpha/, 'the wrapper must pull alpha in by its section name');
    assert.match(wrapper, /!includesub .*beta\.puml!beta/, 'the wrapper must pull beta in by its section name');
    assert.match(wrapper, /@startuml[\s\S]*@enduml/, 'the composed document must be a complete diagram');
  });

  it('test_when_view_generated_then_no_view_file_written_and_views_empty', async () => {
    const render = await tryImport(RENDER);
    const store = await tryImport('.claude/skills/workspace/store.mjs');
    assert.ok(render && store, `${RENDER} does not exist yet`);
    const { specDir } = makeProject();
    seedTwoShards(specDir);
    const before = readdirSync(makeDiagrams(specDir)).sort();

    render.composeView(specDir, { elements: ['alpha', 'beta'] });

    assert.deepEqual(readdirSync(makeDiagrams(specDir)).sort(), before, 'composing a view must write NO file');
    assert.deepEqual(store.readAll(specDir).views, [], 'readAll().views stays empty — epic decision D3');
  });

  it('test_when_startsub_has_no_element_then_composition_refused_as_orphan', async () => {
    const render = await tryImport(RENDER);
    assert.ok(render, `${RENDER} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'alpha', { anchor: 'a/**', shard: 'diagrams/alpha.puml' });
    writeWorkspaceShard(specDir, 'alpha');
    // A shard whose section names an element that does not exist.
    writeWorkspaceShard(specDir, 'ghost', { section: 'deleted-element' });

    const report = render.composeView(specDir, { elements: ['alpha'], includeOrphanReport: true });
    const orphans = typeof report === 'string' ? render.findOrphanShards(specDir) : report.orphans;
    assert.ok(
      orphans.some((o) => String(o).includes('deleted-element')),
      'a !startsub naming no element must be REPORTED as an orphan, never silently included',
    );
  });

  it('test_when_element_has_no_shard_then_reported_unillustrated_not_error', async () => {
    const shards = await tryImport(SHARDS);
    assert.ok(shards, `${SHARDS} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);
    writeWorkspaceElement(specDir, 'lonely', { anchor: 'c/**' });

    assert.equal(shards.readShard(specDir, 'lonely'), null, 'an element with no shard reads as null, never throws');
    const unillustrated = shards.findUnillustrated(specDir);
    assert.ok(unillustrated.includes('lonely'), 'an element with no shard is reported unillustrated (advisory)');
  });

  it('test_when_view_spans_mixed_weights_then_elements_ordered_descending', async () => {
    const render = await tryImport(RENDER);
    assert.ok(render, `${RENDER} does not exist yet`);
    const { specDir } = makeProject();
    makeWorkspace(specDir);
    for (const id of ['light', 'heavy', 'middle']) {
      writeWorkspaceElement(specDir, id, { anchor: `${id}/**`, shard: `diagrams/${id}.puml` });
      writeWorkspaceShard(specDir, id);
    }
    writeWorkspaceConcept(specDir, 'target', { members: ['light', 'heavy', 'middle'] });

    const wrapper = render.composeView(specDir, {
      elements: ['light', 'heavy', 'middle'],
      weights: { light: 1, heavy: 3, middle: 2 },
    });
    const at = (id) => {
      const i = wrapper.indexOf(`!includesub`) >= 0 ? wrapper.indexOf(`${id}.puml!${id}`) : -1;
      assert.notEqual(i, -1, `${id} must appear in the composed wrapper`);
      return i;
    };
    assert.ok(at('heavy') < at('middle') && at('middle') < at('light'),
      'elements must be composed in descending concept-edge weight order (heavy, middle, light)');
  });

  it('test_when_jar_absent_then_error_surfaced_without_remote_fallback', async () => {
    const render = await tryImport(RENDER);
    assert.ok(render, `${RENDER} does not exist yet`);
    const { specDir } = makeProject();
    seedTwoShards(specDir);

    let threw = null;
    try {
      render.generateView(specDir, { elements: ['alpha', 'beta'] }, { jarPath: join(specDir, 'no-such.jar') });
    } catch (e) {
      threw = e;
    }
    assert.ok(threw, 'an unresolvable jar must surface an error, never a silent success');
    assert.doesNotMatch(
      String(threw.message ?? threw),
      /plantuml\.com|https?:\/\//i,
      'the failure must NOT mention or fall back to the remote PlantUML server',
    );
  });

  // Security review 2026-08-05, MEDIUM: `title` was interpolated into the generated
  // document with no validation, so a newline injected arbitrary PlantUML directives
  // (`!include /etc/passwd` reproduced). Escalation to file disclosure failed on
  // plantuml@1.2026.2, but the severity rides on the jar's feature set — so the
  // boundary, not the interpreter, is where this is closed.
  it('test_when_title_carries_a_newline_then_composition_is_refused', async () => {
    const render = await tryImport(RENDER);
    assert.ok(render, `${RENDER} does not exist yet`);
    const { specDir } = makeProject();
    seedTwoShards(specDir);

    assert.throws(
      () => render.composeView(specDir, { elements: ['alpha'], title: 'x\n!include /etc/passwd' }),
      /unsafe field/i,
      'a newline in title must be REJECTED, never normalized — it forges directives',
    );
    assert.throws(
      () => render.composeView(specDir, { elements: ['alpha'], title: 'x\r!include /etc/passwd' }),
      /unsafe field/i,
      'a carriage return forges directives just as a newline does',
    );
    assert.doesNotThrow(
      () => render.composeView(specDir, { elements: ['alpha'], title: 'memory-model — surfacing' }),
      'an ordinary single-line title must still compose',
    );
  });

  it('test_when_composed_view_rendered_then_local_jar_returns_svg', { skip: JVM_SKIP }, async () => {
    const render = await tryImport(RENDER);
    assert.ok(render, `${RENDER} does not exist yet`);
    assert.ok(existsSync(JAR), `vendored jar missing at ${JAR}`);
    const { specDir } = makeProject();
    seedTwoShards(specDir);

    const svg = render.generateView(specDir, { elements: ['alpha', 'beta'] }, { jarPath: JAR });
    const text = Buffer.isBuffer(svg) ? svg.toString('utf8') : String(svg);
    assert.match(text, /<svg/i, 'the local jar must return rendered SVG for a composed view');
  });
});
