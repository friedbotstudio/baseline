// central-system-spec slice A2 — the corpus relocation (AC-005, AC-006, AC-007, AC-008, AC-009).
//
// The corpus moves from .claude/memory/workspace/ to docs/system/ and stops being
// memory. The load-bearing test here is the manifest one: obj/template/docs ships
// only init/, so the relocation is what stops baseline's own 239-file model from
// installing into other people's repositories.
//
// These read the DEV REPO, not tmp fixtures, so they are RED until the tree
// actually moves — which makes them integration verification for the live state.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_DIR = resolve(REPO_ROOT, 'docs/system');
const OLD_DIR = resolve(REPO_ROOT, '.claude/memory/workspace');

const countIn = (dir, ext) =>
  existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(ext)).length : 0;

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

async function tryImport(rel) {
  try {
    return await import(resolve(REPO_ROOT, rel));
  } catch {
    return null;
  }
}

function makeCorpusFixture() {
  const root = mkdtempSync(join(tmpdir(), 'central-spec-'));
  mkdirSync(join(root, 'elements'), { recursive: true });
  writeFileSync(
    join(root, 'elements', 'sample.md'),
    '---\nid: sample\nkind: component\ntitle: Sample\nanchor: lib/sample.mjs\nanchor_digest: abc123def456\n---\n\nbody\n',
    'utf8',
  );
  return root;
}

describe('A2 — the corpus is relocated to docs/system/', () => {
  it('test_when_corpus_relocated_then_docs_system_holds_every_record', () => {
    const concepts = countIn(join(SPEC_DIR, 'concepts'), '.md');
    const elements = countIn(join(SPEC_DIR, 'elements'), '.md');
    const diagrams = countIn(join(SPEC_DIR, 'diagrams'), '.puml');

    assert.equal(concepts, 15, 'docs/system/concepts must hold every concept');
    assert.equal(elements, 112, 'docs/system/elements must hold every element record');
    assert.equal(diagrams, 112, 'docs/system/diagrams must hold one shard per element');
    assert.equal(elements, diagrams, 'every element must keep exactly one shard');

    assert.ok(!existsSync(OLD_DIR),
      '.claude/memory/workspace/ must not survive the relocation — a second copy is a second source of truth');
  });

  it('test_when_template_built_then_manifest_carries_no_corpus_path', () => {
    const manifestPath = resolve(REPO_ROOT, 'obj/template/.claude/manifest.json');
    assert.ok(existsSync(manifestPath), 'build the template before running this test');
    const files = Object.keys(JSON.parse(readFileSync(manifestPath, 'utf8')).files ?? {});

    const stowaways = files.filter(
      (rel) => rel.startsWith('.claude/memory/workspace/') || rel.startsWith('docs/system/'),
    );
    assert.deepEqual(stowaways, [],
      `the shipped template must carry none of baseline's own corpus; found ${stowaways.length} ` +
      'entries that would install a model of THIS repo into a consumer project');
  });

  it('test_when_readers_repointed_then_readall_resolves_at_new_path', async () => {
    const store = await tryImport('.claude/skills/workspace/store.mjs');
    assert.ok(store, 'store.mjs must be importable');
    const { elements } = store.readAll(SPEC_DIR);
    assert.equal(elements.length, 112, 'readAll must resolve the corpus at its new root');

    const holders = [...walkFiles(resolve(REPO_ROOT, '.claude/hooks')),
      ...walkFiles(resolve(REPO_ROOT, '.claude/skills'))]
      .filter((f) => /\.(mjs|js|md)$/.test(f))
      .filter((f) => readFileSync(f, 'utf8').includes('memory/workspace'))
      .map((f) => f.slice(REPO_ROOT.length + 1));

    assert.deepEqual(holders, [],
      `these still carry a memory/workspace path literal after the relocation:\n  ${holders.join('\n  ')}`);
  });

  it('test_when_readme_documents_a_field_no_element_carries_then_gate_exits_one', async () => {
    const gate = await tryImport('.claude/skills/workspace/readme-gate.mjs');
    assert.ok(gate, 'readme-gate.mjs must be importable');

    // The gate only inspects anchor_digest / shard / granularity. `shard` is derived
    // at read time and never persisted, so documenting it is the honest overclaim.
    const overclaiming = makeCorpusFixture();
    writeFileSync(join(overclaiming, 'README.md'),
      'Each element stores `anchor_digest` and `shard`.\n', 'utf8');
    const bad = gate.checkReadmeFields({ specDir: overclaiming });
    assert.equal(bad.ok, false, 'documenting a field no element carries must fail the gate');
    assert.ok(bad.overclaimed.includes('shard'), 'the gate must name the overclaimed field');

    const honest = makeCorpusFixture();
    writeFileSync(join(honest, 'README.md'),
      'Beyond its identity and anchor, an element stores exactly one field: `anchor_digest`.\n', 'utf8');
    assert.deepEqual(gate.checkReadmeFields({ specDir: honest }), { ok: true, overclaimed: [] });

    // And the relocated README must itself satisfy the gate.
    assert.equal(gate.checkReadmeFields({ specDir: SPEC_DIR }).ok, true,
      'docs/system/README.md must not document a field the corpus does not carry');
  });

  it('test_when_anchor_absolute_or_drive_prefixed_then_rejected_like_dotdot', async () => {
    const tree = await tryImport('.claude/skills/workspace/tree.mjs');
    assert.ok(tree, 'tree.mjs must be importable');
    const { assertNoTraversal } = tree;

    for (const rejected of ['../etc/passwd', '/etc/passwd', 'C:\\Windows\\x', '\\\\server\\share', '/']) {
      assert.throws(() => assertNoTraversal(rejected), /REJECT, never normalize/,
        `${JSON.stringify(rejected)} must be refused in the same register as a ".." segment`);
    }

    for (const accepted of ['.claude/skills/workspace/store.mjs', '.claude/skills/**', 'lib/a.mjs']) {
      assert.equal(assertNoTraversal(accepted), accepted,
        `${JSON.stringify(accepted)} is a legitimate repo-relative anchor`);
    }
  });
});
