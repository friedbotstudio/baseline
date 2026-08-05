// Ticket A — the concept layer (AC-001, AC-002, AC-003).
//
// The concept layer is the ONE authored level: granularity for elements is derived
// from anchor shape (spec D1), but a concept has no anchor at all. Every test here
// defends a property that derivation cannot supply — membership resolves, an
// element may belong to more than one concept, and a concept never fakes an anchor.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, join, readdirSync, tryImport } from './helpers/memory-fixtures.mjs';
import { makeConcepts, makeWorkspace, writeWorkspaceConcept, writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';
import { makeProject } from './helpers/memory-fixtures.mjs';

const CONCEPTS = '.claude/skills/workspace/concepts.mjs';

describe('A — concept layer', () => {
  it('test_when_all_members_resolve_then_concept_written', async () => {
    const concepts = await tryImport(CONCEPTS);
    assert.ok(concepts, `${CONCEPTS} does not exist yet`);
    const { memDir } = makeProject();
    makeWorkspace(memDir);
    writeWorkspaceElement(memDir, 'git-commit-guard', { anchor: '.claude/hooks/git_commit_guard.mjs' });
    writeWorkspaceElement(memDir, 'consent-gate-grant', { anchor: '.claude/hooks/consent_gate_grant.mjs' });

    const result = concepts.writeConcept(memDir, 'consent-gates', {
      title: 'Consent gates',
      members: ['git-commit-guard', 'consent-gate-grant'],
    });
    assert.equal(result.written, true, 'a concept whose members all resolve must be written');

    const all = concepts.readConcepts(memDir);
    const found = all.find((c) => c.id === 'consent-gates');
    assert.ok(found, 'concept did not round-trip through readConcepts');
    assert.deepEqual(found.members, ['git-commit-guard', 'consent-gate-grant']);
  });

  it('test_when_member_unresolvable_then_write_refused_and_named', async () => {
    const concepts = await tryImport(CONCEPTS);
    assert.ok(concepts, `${CONCEPTS} does not exist yet`);
    const { memDir } = makeProject();
    makeWorkspace(memDir);
    writeWorkspaceElement(memDir, 'real-element', { anchor: 'a/**' });

    const result = concepts.writeConcept(memDir, 'half-real', {
      title: 'Half real',
      members: ['real-element', 'ghost-element'],
    });

    assert.equal(result.written, false, 'a concept naming an unresolvable member must be refused');
    assert.deepEqual(result.unresolved, ['ghost-element'], 'the refusal must NAME the unresolvable member');
    assert.equal(
      existsSync(join(memDir, 'workspace', 'concepts', 'half-real.md')),
      false,
      'a refused concept must leave no file behind',
    );
  });

  it('test_when_file_in_two_concepts_then_both_memberships_returned', async () => {
    const concepts = await tryImport(CONCEPTS);
    assert.ok(concepts, `${CONCEPTS} does not exist yet`);
    const { memDir } = makeProject();
    makeWorkspace(memDir);
    writeWorkspaceElement(memDir, 'git-commit-guard', { anchor: '.claude/hooks/git_commit_guard.mjs' });
    writeWorkspaceConcept(memDir, 'consent-gates', { members: ['git-commit-guard'] });
    writeWorkspaceConcept(memDir, 'git-policy', { members: ['git-commit-guard'] });

    const owning = concepts.conceptsFor(memDir, 'git-commit-guard');
    assert.deepEqual(
      owning.map((c) => c.id).sort(),
      ['consent-gates', 'git-policy'],
      'multi-membership is the point: neither concept may be dropped',
    );
  });

  it('test_when_concept_read_then_no_anchor_and_granularity_concept', async () => {
    const concepts = await tryImport(CONCEPTS);
    assert.ok(concepts, `${CONCEPTS} does not exist yet`);
    const { memDir } = makeProject();
    makeWorkspace(memDir);
    writeWorkspaceElement(memDir, 'only-member', { anchor: 'x/**' });
    concepts.writeConcept(memDir, 'a-concept', { title: 'A concept', members: ['only-member'] });

    const [node] = concepts.readConcepts(memDir);
    assert.equal(node.granularity, 'concept', 'a concept must report granularity concept');
    assert.ok(!('anchor' in node) || node.anchor === undefined || node.anchor === '',
      'a concept must NOT carry an anchor — it has no filesystem footprint of its own');
  });

  it('test_when_member_id_has_traversal_then_refused_before_read', async () => {
    const concepts = await tryImport(CONCEPTS);
    assert.ok(concepts, `${CONCEPTS} does not exist yet`);
    const { memDir } = makeProject();
    // Deliberately NO makeWorkspace/makeConcepts: nothing on disk to read. If
    // validation runs first the error names the unsafe id; if the implementation
    // touches the filesystem first it surfaces ENOENT instead, which is the bug.
    assert.throws(
      () => concepts.writeConcept(memDir, 'ok-id', { title: 'x', members: ['../escape'] }),
      /unsafe/i,
      'a traversal member id must be REJECTED, never normalized, and before any read',
    );
    assert.throws(
      () => concepts.writeConcept(memDir, '../escape', { title: 'x', members: [] }),
      /unsafe/i,
      'a traversal concept id must be rejected before any path is built',
    );
    assert.equal(existsSync(join(memDir, 'workspace')), false, 'a rejected write must not create the store');
  });

  it('test_when_concepts_dir_absent_then_read_returns_empty_not_throws', async () => {
    const concepts = await tryImport(CONCEPTS);
    assert.ok(concepts, `${CONCEPTS} does not exist yet`);
    const { memDir } = makeProject();
    assert.deepEqual(concepts.readConcepts(memDir), [], 'an absent concepts dir reads as empty, never throws');
    makeConcepts(memDir);
    assert.deepEqual(concepts.readConcepts(memDir), [], 'an empty concepts dir reads as empty');
    assert.equal(readdirSync(join(memDir, 'workspace', 'concepts')).length, 0);
  });
});
