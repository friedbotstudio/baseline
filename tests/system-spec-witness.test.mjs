// central-system-spec slice C — the diagram-kind witness registry (AC-013, AC-014, AC-015, AC-016).
//
// Supersedes architecture-map D2. The durable-diagram rule stops being a kind
// WHITELIST (structure only; sequence/activity/BPMN excluded) and becomes a WITNESS
// rule: every durable diagram declares what falsifies it. D2's own rationale was
// falsifiability — the whitelist was a proxy for it, forced by anchor_digest having
// no sequence surface to hash. Tests supply that surface, so the property can be
// enforced directly.
//
// The `none` tier is the point of the whole ticket: a project whose domain is a
// business process can put its real shape in the central spec, marked as a claim
// nothing checks, rather than being unable to model itself at all.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Distinguishes "module absent" from "module present but throws on load" — a
// SyntaxError otherwise reports as a missing file and sends you hunting the wrong bug.
async function loadModule(rel) {
  const { existsSync } = await import('node:fs');
  const abs = resolve(REPO_ROOT, rel);
  if (!existsSync(abs)) return { module: null, reason: `${rel} does not exist yet` };
  try {
    return { module: await import(abs), reason: null };
  } catch (err) {
    return { module: null, reason: `${rel} exists but failed to load: ${err.message}` };
  }
}

const WITNESSES = {
  c4_component: { witness: 'anchor-digest' },
  class: { witness: 'anchor-digest' },
  dependency_graph: { witness: 'anchor-digest' },
  sequence: { witness: 'test' },
  bpmn: { witness: 'none' },
};

const SURFACE = {
  roots: ['lib/'],
  codeExtensions: ['.mjs'],
  alwaysIncluded: [],
  excludedSegments: [],
  excludedTrees: [],
};

function makeProject({ witnesses = WITNESSES } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'witness-'));
  const config = {
    memory: { architecture_map: { enabled: true, governed_surface: SURFACE, witnesses } },
  };
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude', 'project.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  mkdirSync(join(root, 'lib'), { recursive: true });
  const specDir = join(root, 'docs', 'system');
  mkdirSync(join(specDir, 'elements'), { recursive: true });
  mkdirSync(join(specDir, 'diagrams'), { recursive: true });
  return { root, specDir };
}

function writeSource(root, rel, body) {
  writeFileSync(join(root, rel), body, 'utf8');
}

function writeElement(specDir, id, fields) {
  const preamble = ['id: ' + id, 'kind: component', `title: ${id}`, ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`)];
  writeFileSync(join(specDir, 'elements', `${id}.md`), `---\n${preamble.join('\n')}\n---\n\nbody\n`, 'utf8');
}

// A shard declares its kind the way dependency graphs already declare theirs — a
// PlantUML comment — so the corpus gains no second annotation syntax.
function writeShard(specDir, id, { kind, witnessTest } = {}) {
  const lines = [`!startsub ${id.replace(/-/g, '_')}`];
  if (kind) lines.push(`' @kind ${kind}`);
  if (witnessTest) lines.push(`' @witness ${witnessTest}`);
  lines.push(`Component(${id}, "${id}", "Node ESM", "fixture")`, '!endsub');
  writeFileSync(join(specDir, 'diagrams', `${id}.puml`), `${lines.join('\n')}\n`, 'utf8');
}

describe('C — a durable diagram declares what falsifies it', () => {
  it('test_when_shard_declares_kind_then_witness_binding_resolves', async () => {
    const { module: witness, reason } = await loadModule('.claude/skills/workspace/witness.mjs');
    assert.ok(witness, reason);
    const { root } = makeProject();

    assert.deepEqual(witness.bindingFor('sequence', { rootDir: root }).witness, 'test');
    assert.deepEqual(witness.bindingFor('c4_component', { rootDir: root }).witness, 'anchor-digest');
    assert.deepEqual(witness.bindingFor('bpmn', { rootDir: root }).witness, 'none');

    assert.equal(witness.bindingFor('timing', { rootDir: root }).witness, 'none',
      'an unregistered kind binds no witness rather than throwing — a project may draw anything');
  });

  it('test_when_named_test_unresolvable_or_failing_then_element_stale', async () => {
    const { module: reconcile, reason } = await loadModule('.claude/skills/workspace/reconcile.mjs');
    assert.ok(reconcile, reason);
    const { root, specDir } = makeProject();

    writeSource(root, 'lib/flow.mjs', 'export const flow = 1;\n');
    writeElement(specDir, 'flow', { anchor: 'lib/flow.mjs' });
    writeShard(specDir, 'flow', { kind: 'sequence', witnessTest: 'tests/no-such-flow.test.mjs' });

    const verdicts = reconcile.classify(specDir, { rootDir: root });
    const flow = verdicts.find((v) => v.element_id === 'flow');
    assert.ok(flow, 'the element must appear in the classification');
    assert.equal(flow.state, 'stale',
      'a sequence whose named test does not resolve is a claim nothing checks');
    assert.match(String(flow.detail), /no-such-flow\.test\.mjs/,
      'the report must NAME the unresolvable test, not just say stale');
  });

  it('test_when_witness_none_then_permitted_marked_and_never_an_error', async () => {
    const { module: reconcile, reason } = await loadModule('.claude/skills/workspace/reconcile.mjs');
    assert.ok(reconcile, reason);
    const { root, specDir } = makeProject();

    writeSource(root, 'lib/process.mjs', 'export const process1 = 1;\n');
    writeElement(specDir, 'process', { anchor: 'lib/process.mjs' });
    writeShard(specDir, 'process', { kind: 'bpmn' });

    const verdicts = reconcile.classify(specDir, { rootDir: root });
    const proc = verdicts.find((v) => v.element_id === 'process');
    assert.ok(proc, 'an unwitnessed element must still be classified, not dropped');

    assert.notEqual(proc.state, 'stale', 'unwitnessed is not stale — nothing claimed it was fresh');
    assert.notEqual(proc.state, 'dangling', 'unwitnessed is not dangling — the anchor resolves');
    assert.equal(proc.witness, 'none', 'the verdict must carry the witness type');
    assert.equal(proc.citable, false,
      'a diagram nothing falsifies may route but must never be cited as evidence (amended D8)');
  });

  it('test_when_anchor_interface_changes_then_digest_reports_stale', async () => {
    const { module: reconcile, reason } = await loadModule('.claude/skills/workspace/reconcile.mjs');
    const { module: digest, reason: dReason } = await loadModule('.claude/skills/workspace/digest.mjs');
    assert.ok(reconcile, reason);
    assert.ok(digest, dReason);
    const { root, specDir } = makeProject();

    writeSource(root, 'lib/iface.mjs', 'export const original = 1;\n');
    writeElement(specDir, 'iface', { anchor: 'lib/iface.mjs' });
    writeShard(specDir, 'iface', { kind: 'c4_component' });
    digest.stampElement(specDir, 'iface', { rootDir: root });

    writeSource(root, 'lib/iface.mjs', '// a comment that changes no interface\nexport const original = 1;\n');
    let verdict = reconcile.classify(specDir, { rootDir: root }).find((v) => v.element_id === 'iface');
    assert.notEqual(verdict.state, 'stale',
      'a comment-only edit must leave a digest-witnessed diagram fresh — that is why the digest is structural');

    writeSource(root, 'lib/iface.mjs', 'export const renamed = 1;\n');
    verdict = reconcile.classify(specDir, { rootDir: root }).find((v) => v.element_id === 'iface');
    assert.equal(verdict.state, 'stale', 'a renamed export changes the interface and must mark the diagram stale');
    assert.equal(verdict.witness, 'anchor-digest', 'the verdict must name which witness decided it');
  });
});
