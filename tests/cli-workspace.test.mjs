// Skill-helper CLI dispatchers — the nine workspace subcommands (AC-001..AC-010).
//
// These read the LIVE docs/system/ corpus rather than a tmpdir clone. The rule
// that matters is "never MUTATE the live corpus", not "never read it" (scenario
// MEMORY.md), and every subcommand here is read-only. Cloning 114 elements per
// assertion would buy nothing and hide the fact that these are the numbers a
// maintainer actually sees.
//
// The two flag/absence cases are the exception: they need a root where the
// architecture map is off, which the live repo is not.
//
// On "rejected before any filesystem read" without an fs spy: the assertion is
// the ENOENT-vs-unsafe distinction. Validation that precedes I/O names the
// unsafe input; an implementation that builds the path first surfaces ENOENT
// instead. That difference IS the test.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeProject, tryImport, REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { runCli, runCliJson, assertPresent } from './helpers/cli-runner.mjs';

const SPEC_DIR = 'docs/system';

// A file-anchored element with known, small edge sets — chosen because its
// neighbours are stable and asserted by name below rather than by count.
const FILE_ANCHORED = 'scoped-memory';
// A glob-anchored element: 53 of 114 live here and derive zero edges by design.
const GLOB_ANCHORED = 'workspace-corpus';
const CONCEPT = 'consent-gates';

describe('workspace dispatcher — element queries', () => {
  // AC-001
  //
  // The shard kind is read off disk rather than written as a literal. An earlier
  // draft asserted /c4_component/ here on the assumption that every element
  // carries that kind; scoped-memory's shard actually declares `class`, so the
  // test encoded a fact nobody had checked. Cross-checking against readShard
  // makes that class of error unrepresentable.
  it('test_when_describe_given_valid_element_then_prints_record_shard_concepts_digest', async () => {
    const res = runCli('workspace', ['describe', FILE_ANCHORED]);
    assertPresent(assert, res);
    assert.equal(res.status, 0, `describe ${FILE_ANCHORED} must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);

    const shards = await tryImport('.claude/skills/workspace/shards.mjs');
    const store = await tryImport('.claude/skills/workspace/store.mjs');
    assert.ok(shards && store, 'shards.mjs and store.mjs must be importable for the cross-check');
    const specDir = join(REPO_ROOT, SPEC_DIR);
    const element = store.readRecords(specDir, 'elements').find((r) => r.id === FILE_ANCHORED);
    const shard = shards.readShard(specDir, FILE_ANCHORED);
    assert.ok(element?.anchor && shard?.kind, 'fixture precondition: the element must have an anchor and a shard kind');

    assert.ok(res.stdout.includes(element.anchor), 'must print the anchor the record declares');
    assert.ok(res.stdout.includes(shard.kind), `must print the shard's declared kind (\`${shard.kind}\`)`);
    assert.match(res.stdout, /memory-model/, 'must print the owning concept');
    assert.match(res.stdout, /digest/i, 'must report the digest state');
  });

  // AC-002
  it('test_when_blast_radius_on_file_anchored_element_then_prints_derived_edges', async () => {
    const res = runCli('workspace', ['blast-radius', FILE_ANCHORED]);
    assertPresent(assert, res);
    assert.equal(res.status, 0);

    const edges = await tryImport('.claude/skills/workspace/edges.mjs');
    const store = await tryImport('.claude/skills/workspace/store.mjs');
    assert.ok(edges && store, 'edges.mjs and store.mjs must be importable for the cross-check');
    const derived = edges.deriveEdges(REPO_ROOT, store.readRecords(join(REPO_ROOT, SPEC_DIR), 'elements'));
    const dependsOn = derived.filter((e) => e.from === FILE_ANCHORED).map((e) => e.to);
    const dependents = derived.filter((e) => e.to === FILE_ANCHORED).map((e) => e.from);
    assert.ok(dependsOn.length > 0, 'fixture precondition: the chosen element must have outbound edges');

    for (const id of [...dependsOn, ...dependents]) {
      assert.ok(res.stdout.includes(id), `blast-radius output must name the derived neighbour \`${id}\``);
    }
  });

  // AC-002
  it('test_when_blast_radius_hops_out_of_range_then_clamped_or_rejected', () => {
    const zero = runCli('workspace', ['blast-radius', FILE_ANCHORED, '--hops', '0']);
    assertPresent(assert, zero);
    assert.equal(zero.status, 0, '--hops 0 clamps to 1 rather than erroring');

    const huge = runCli('workspace', ['blast-radius', FILE_ANCHORED, '--hops', '99']);
    assert.equal(huge.status, 1, '--hops 99 exceeds the documented max of 5 and must exit 1');
    assert.match(huge.out, /hops/i, 'the rejection must name the offending flag');
  });

  // AC-003
  it('test_when_blast_radius_on_glob_anchored_element_then_zero_edges_with_stated_reason', () => {
    const res = runCli('workspace', ['blast-radius', GLOB_ANCHORED]);
    assertPresent(assert, res);
    assert.equal(res.status, 0, 'a glob-anchored element is a valid query, not an error');
    assert.match(
      res.stdout,
      /glob/i,
      'a bare empty result is the defect this AC exists to prevent — 53 of 114 elements land here, so the output must state that glob anchors are excluded from derivation',
    );
  });
});

describe('workspace dispatcher — input rejection', () => {
  // AC-004
  it('test_when_element_id_contains_traversal_then_rejected_before_any_read', () => {
    for (const evil of ['../../etc/passwd', 'a/../../b']) {
      const res = runCli('workspace', ['describe', evil]);
      assertPresent(assert, res);
      assert.equal(res.status, 1, `\`${evil}\` must exit 1`);
      assert.doesNotMatch(
        res.out,
        /ENOENT/,
        'ENOENT proves the path was built before validation ran — rejection must precede all I/O',
      );
      assert.match(res.out, /unsafe|invalid|reject/i, 'the rejection must name why the input was refused');
    }
  });

  // AC-004
  it('test_when_spec_dir_escapes_repo_then_rejected', () => {
    const res = runCli('workspace', ['describe', FILE_ANCHORED, '--spec-dir', '../../../etc']);
    assertPresent(assert, res);
    assert.equal(res.status, 1, 'a --spec-dir that escapes the tree must exit 1');
    assert.doesNotMatch(res.out, /ENOENT/, 'traversal must be refused, never attempted');
  });
});

describe('workspace dispatcher — graph contract', () => {
  // AC-006
  it('test_when_graph_json_then_every_edge_carries_provenance_and_authored_is_empty', () => {
    const res = runCliJson('workspace', ['graph', '--json']);
    assertPresent(assert, res);
    assert.equal(res.status, 0, `graph --json must exit 0; got ${res.status}: ${res.out.slice(0, 300)}`);
    assert.ok(res.json, `graph --json must emit parseable JSON; got: ${res.stdout.slice(0, 300)}`);

    const doc = res.json;
    assert.ok(Array.isArray(doc.nodes) && doc.nodes.length > 0, 'nodes must be a non-empty array');
    assert.ok(Array.isArray(doc.edges) && doc.edges.length > 0, 'edges must be a non-empty array');
    for (const edge of doc.edges) {
      assert.ok(edge.provenance, `every edge must carry provenance (spec D1); offender: ${JSON.stringify(edge)}`);
    }
    const authored = doc.edges.filter((e) => e.provenance !== 'derived');
    assert.deepEqual(authored, [], 'the authored layer ships empty in v1 (spec D1) — every edge is derived');
    assert.ok(Array.isArray(doc.orphans), 'orphans must be present so the GUI need not compute it');
    assert.ok(Array.isArray(doc.stale), 'stale must be present so the GUI need not compute it');
  });

  // AC-006
  it('test_when_graph_run_twice_on_unchanged_tree_then_output_is_byte_identical', () => {
    const first = runCli('workspace', ['graph', '--json']);
    assertPresent(assert, first);
    const second = runCli('workspace', ['graph', '--json']);
    assert.equal(first.status, 0);
    assert.equal(
      first.stdout,
      second.stdout,
      'ordering must be total and stable, or the GUI diffs noise on every refresh',
    );
  });

  // AC-007
  it('test_when_architecture_map_disabled_then_empty_document_and_no_corpus_read', () => {
    const { root, specDir } = makeProject();
    const res = runCliJson('workspace', ['graph', '--json', '--root', root, '--spec-dir', specDir]);
    assertPresent(assert, res);
    assert.equal(res.status, 0, 'an opted-out project gets an answer, not an error');
    assert.ok(res.json, `must emit parseable JSON even when inert; got: ${res.stdout.slice(0, 200)}`);
    assert.deepEqual(res.json.nodes, [], 'inert project reports no nodes');
    assert.deepEqual(res.json.edges, [], 'inert project reports no edges');
    assert.doesNotMatch(res.out, /ENOENT/, 'the flag gate must precede corpus I/O — ENOENT proves it read first');
  });

  // AC-007
  it('test_when_corpus_directory_absent_then_empty_document_exit_0', () => {
    const { root, specDir } = makeProject();
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(
      join(root, '.claude/project.json'),
      JSON.stringify({ memory: { architecture_map: { enabled: true } } }, null, 2) + '\n',
      'utf8',
    );
    const res = runCliJson('workspace', ['graph', '--json', '--root', root, '--spec-dir', specDir]);
    assertPresent(assert, res);
    assert.equal(res.status, 0, 'flag on but no corpus is a well-formed empty answer, not a crash');
    assert.ok(res.json, `must emit parseable JSON; got: ${res.stdout.slice(0, 200)}`);
    assert.deepEqual(res.json.nodes, []);
  });
});

describe('graph document conforms to its pinned schema', () => {
  const SCHEMA_REL = '.claude/schemas/graph-document.v1.json';

  function readSchema() {
    const path = join(REPO_ROOT, SCHEMA_REL);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  // Walks the schema's OWN declarations rather than restating them. A test that
  // hard-codes the required keys proves only that the test can list keys; when
  // the schema gains a field, this assertion picks it up with no edit, and when
  // the emitter drops one it goes red. That is what makes the schema the single
  // source rather than a second one.
  function checkAgainst(defs, node, label, failures) {
    for (const key of defs.required ?? []) {
      if (node[key] === undefined) failures.push(`${label}: missing required key \`${key}\``);
    }
    for (const [key, rule] of Object.entries(defs.properties ?? {})) {
      const value = node[key];
      if (value === undefined) continue;
      if (rule.enum && !rule.enum.includes(value)) {
        failures.push(`${label}.${key}: \`${value}\` is not one of ${rule.enum.join(' | ')}`);
      }
      if (rule.pattern && !new RegExp(rule.pattern).test(String(value))) {
        failures.push(`${label}.${key}: \`${value}\` does not match ${rule.pattern}`);
      }
      if (rule.const !== undefined && value !== rule.const) {
        failures.push(`${label}.${key}: expected ${rule.const}, got ${value}`);
      }
    }
  }

  // AC-016
  it('test_when_graph_json_checked_against_schema_then_every_declared_constraint_holds', () => {
    const schema = readSchema();
    assert.ok(schema, `${SCHEMA_REL} must exist — it is the contract the operator GUI reads (spec D7)`);

    const res = runCliJson('workspace', ['graph', '--json']);
    assertPresent(assert, res);
    assert.ok(res.json, `graph --json must emit parseable JSON; got: ${res.stdout.slice(0, 200)}`);

    const failures = [];
    checkAgainst(schema, res.json, 'document', failures);
    for (const [i, node] of res.json.nodes.entries()) {
      checkAgainst(schema.$defs.node, node, `nodes[${i}]`, failures);
    }
    for (const [i, edge] of res.json.edges.entries()) {
      checkAgainst(schema.$defs.edge, edge, `edges[${i}]`, failures);
    }
    assert.deepEqual(failures.slice(0, 10), [], 'the emitter must satisfy every constraint the schema declares');
  });

  // AC-017
  it('test_when_edge_targets_a_config_key_then_targetKind_says_so_and_it_resolves_to_no_node', () => {
    const res = runCliJson('workspace', ['graph', '--json']);
    assertPresent(assert, res);
    assert.ok(res.json, 'graph --json must emit parseable JSON');

    const ids = new Set(res.json.nodes.map((n) => n.id));
    const configEdges = res.json.edges.filter((e) => e.kind === 'config');
    assert.ok(
      configEdges.length > 0,
      'fixture precondition: the live corpus derives config edges, so a zero count means the scanner regressed',
    );

    for (const edge of configEdges) {
      assert.equal(
        edge.targetKind,
        'config-key',
        `a config edge targets a project.json key, not an element; offender: ${JSON.stringify(edge)}`,
      );
      assert.ok(
        !ids.has(edge.to),
        `\`${edge.to}\` must NOT appear as a node — nothing anchors project.json, and inventing an element for it would put a file in the model no maintainer would open`,
      );
    }
  });

  // AC-017
  it('test_when_edge_targets_an_element_then_both_endpoints_resolve_to_nodes', () => {
    const res = runCliJson('workspace', ['graph', '--json']);
    assertPresent(assert, res);
    assert.ok(res.json, 'graph --json must emit parseable JSON');

    const ids = new Set(res.json.nodes.map((n) => n.id));
    const dangling = res.json.edges
      .filter((e) => e.targetKind === 'element')
      .filter((e) => !ids.has(e.from) || !ids.has(e.to))
      .map((e) => `${e.from} -> ${e.to}`);
    assert.deepEqual(
      dangling.slice(0, 10),
      [],
      'an element-targeted edge whose endpoint is not a node renders as a dangling line in any consumer',
    );
  });
});

describe('workspace dispatcher — view and constraints', () => {
  // AC-008
  it('test_when_view_given_concept_then_matches_composeView_byte_for_byte', async () => {
    const res = runCli('workspace', ['view', CONCEPT]);
    assertPresent(assert, res);
    assert.equal(res.status, 0, `view ${CONCEPT} must exit 0; got: ${res.out.slice(0, 300)}`);

    const render = await tryImport('.claude/skills/workspace/render.mjs');
    const concepts = await tryImport('.claude/skills/workspace/concepts.mjs');
    assert.ok(render && concepts, 'render.mjs and concepts.mjs must be importable for the cross-check');
    const specDir = join(REPO_ROOT, SPEC_DIR);
    const record = concepts.readConcepts(specDir).find((c) => c.id === CONCEPT);
    assert.ok(record, `fixture precondition: concept \`${CONCEPT}\` must exist in the live corpus`);
    const expected = render.composeView(specDir, { elements: record.members, title: record.title });
    assert.equal(res.stdout, expected, 'view is a front door to composeView — it must not reshape the output');
  });

  // AC-009
  it('test_when_view_render_and_jar_absent_then_exit_2_and_no_network_call', () => {
    const res = runCli('workspace', ['view', CONCEPT, '--render', '--jar', join(REPO_ROOT, 'no-such-plantuml.jar')]);
    assertPresent(assert, res);
    assert.equal(res.status, 2, 'an unresolvable jar is a not-found condition, exit 2');
    assert.match(res.out, /jar/i, 'the error must name the missing jar');
    assert.doesNotMatch(
      res.out,
      /plantuml\.com|http/i,
      'the remote server is deliberately NOT a fallback — it cannot resolve local !includesub paths and would render a silently emptier diagram',
    );
  });

  // AC-010
  it('test_when_constraints_for_path_then_matching_governs_entries_and_source_named', () => {
    const res = runCli('workspace', ['constraints-for', '.claude/skills/workspace/edges.mjs']);
    assertPresent(assert, res);
    assert.equal(res.status, 0, `constraints-for must exit 0; got: ${res.out.slice(0, 300)}`);
    assert.match(
      res.stdout,
      /zero-runtime-dependencies/,
      'the constraint whose governs globs cover .claude/skills/** must be reported',
    );
    assert.match(res.stdout, /governs|rests_on/, 'the output must name WHICH source answered, since the two differ in coverage');
  });
});
