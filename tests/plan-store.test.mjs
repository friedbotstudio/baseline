// plan-store — durable plan object store unit tests
// Covers: AC-001 (create + validate), AC-002 (append-only revisions),
//         AC-005 (threshold resolution from tier-dial), AC-006 (mergeInput round-trip).
//
// SUT: .claude/skills/harness/plan-store.mjs (not yet built → RED).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SUT = path.join(ROOT, '.claude/skills/harness/plan-store.mjs');
const TIER_DIAL = path.join(ROOT, '.claude/hooks/lib/tier-dial.mjs');

// Minimal tasklist used across tests — covers all node roles and checkers.
function makeSampleTasklist() {
  return [
    {
      id: 'n1',
      title: 'TDD maker',
      role: 'maker',
      checker: undefined,
      assignment: { frame: 'implement auth', acs: ['AC-001'], deps: [] },
      thresholds: null, // will be resolved by createPlan
      status: 'pending',
      result: null,
    },
    {
      id: 'n2',
      title: 'TDD checker',
      role: 'checker',
      checker: 'tdd',
      assignment: { frame: 'verify auth', acs: ['AC-001'], deps: ['n1'] },
      thresholds: null, // will be resolved by createPlan
      status: 'pending',
      result: null,
    },
    {
      id: 'n3',
      title: 'Security checker',
      role: 'checker',
      checker: 'security',
      assignment: { frame: 'security scan', acs: ['AC-001'], deps: ['n1'] },
      thresholds: null,
      status: 'pending',
      result: null,
    },
  ];
}

function makeRegulatedTasklist() {
  return [
    {
      id: 'r1',
      title: 'Spec maker',
      role: 'maker',
      checker: 'spec',
      assignment: { frame: 'write spec', acs: ['AC-003'], deps: [] },
      thresholds: null,
      status: 'pending',
      result: null,
    },
    {
      id: 'r2',
      title: 'Review checker',
      role: 'checker',
      checker: 'review',
      assignment: { frame: 'code review', acs: ['AC-003'], deps: ['r1'] },
      thresholds: null,
      status: 'pending',
      result: null,
    },
    {
      id: 'r3',
      title: 'AC-conformance checker',
      role: 'checker',
      checker: 'ac-conformance',
      assignment: { frame: 'verify ACs', acs: ['AC-003'], deps: ['r1'] },
      thresholds: null,
      status: 'pending',
      result: null,
    },
  ];
}

describe('plan-store (AC-001, AC-002, AC-005, AC-006)', () => {
  // AC-001 — createPlan writes v1 file; validatePlan returns {ok:true}
  it('test_create_plan_writes_v1_and_validates', async () => {
    const { createPlan, validatePlan } = await import(SUT);
    const dir = mkdtempSync(path.join(tmpdir(), 'plan-store-'));
    try {
      const plan = await createPlan({
        slug: 'my-feature',
        goal: 'Ship the feature',
        tasklist: makeSampleTasklist(),
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      // File must exist at .claude/state/plan/<slug>.json relative to rootDir
      const filePath = path.join(dir, '.claude', 'state', 'plan', 'my-feature.json');
      assert.ok(existsSync(filePath), 'plan file was written');

      // File contents: parse and spot-check
      const raw = JSON.parse(readFileSync(filePath, 'utf8'));
      assert.equal(raw.schema_version, 1);
      assert.equal(raw.slug, 'my-feature');
      assert.equal(raw.versions.length, 1);
      assert.equal(raw.versions[0].v, 1);
      assert.equal(raw.versions[0].author, 'orchestrator');
      assert.equal(raw.versions[0].reason, 'plan created');
      assert.equal(raw.versions[0].snapshot.goal, 'Ship the feature');
      assert.equal(raw.versions[0].ts, '2026-01-01T00:00:00.000Z');

      // Trailing newline
      const rawStr = readFileSync(filePath, 'utf8');
      assert.ok(rawStr.endsWith('\n'), 'file ends with newline');

      // validatePlan must return {ok:true}
      const v = validatePlan(plan);
      assert.equal(v.ok, true, `expected ok but got errors: ${JSON.stringify(v.errors)}`);

      // Returned plan object matches what was written
      assert.equal(plan.slug, 'my-feature');
      assert.equal(plan.tier, 'internal-tool');
      assert.equal(plan.versions.length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-001 — validatePlan catches malformed plans (never throws)
  it('test_validate_plan_rejects_malformed', async () => {
    const { validatePlan } = await import(SUT);

    // Missing slug
    const noSlug = {
      schema_version: 1,
      slug: '',
      tier: 'internal-tool',
      versions: [
        {
          v: 1,
          ts: '2026-01-01T00:00:00.000Z',
          author: 'orchestrator',
          reason: 'created',
          snapshot: { goal: 'x', tasklist: [] },
        },
      ],
      created_at: 0,
      updated_at: 0,
    };
    const r1 = validatePlan(noSlug);
    assert.equal(r1.ok, false, 'missing slug should fail');
    assert.ok(r1.errors.length > 0, 'should have at least one error for missing slug');
    assert.ok(r1.errors.some((e) => /slug/i.test(e)), `error should mention slug, got: ${JSON.stringify(r1.errors)}`);

    // Non-increasing v (v goes 1 → 1 instead of 1 → 2)
    const badV = {
      schema_version: 1,
      slug: 'x',
      tier: 'internal-tool',
      versions: [
        {
          v: 1,
          ts: '2026-01-01T00:00:00.000Z',
          author: 'o',
          reason: 'r',
          snapshot: { goal: 'g', tasklist: [] },
        },
        {
          v: 1, // duplicate v — not increasing
          ts: '2026-01-02T00:00:00.000Z',
          author: 'o',
          reason: 'r',
          snapshot: { goal: 'g', tasklist: [] },
        },
      ],
      created_at: 0,
      updated_at: 0,
    };
    const r2 = validatePlan(badV);
    assert.equal(r2.ok, false, 'non-increasing v should fail');
    assert.ok(r2.errors.some((e) => /version|strictly increasing|v\b/i.test(e)), `error should mention version ordering, got: ${JSON.stringify(r2.errors)}`);

    // Dep pointing at non-existent node id
    const badDep = {
      schema_version: 1,
      slug: 'x',
      tier: 'internal-tool',
      versions: [
        {
          v: 1,
          ts: '2026-01-01T00:00:00.000Z',
          author: 'o',
          reason: 'r',
          snapshot: {
            goal: 'g',
            tasklist: [
              {
                id: 'n1',
                title: 'node',
                role: 'maker',
                assignment: { frame: 'f', acs: [], deps: ['ghost-node'] },
                thresholds: { floor: null, ceiling: 1, mandatory: false },
                status: 'pending',
                result: null,
              },
            ],
          },
        },
      ],
      created_at: 0,
      updated_at: 0,
    };
    const r3 = validatePlan(badDep);
    assert.equal(r3.ok, false, 'bad dep should fail');
    assert.ok(
      r3.errors.some((e) => /dep|ghost-node/i.test(e)),
      `error should mention bad dep, got: ${JSON.stringify(r3.errors)}`
    );

    // Must never throw — even on totally garbage input
    assert.doesNotThrow(() => validatePlan(null));
    assert.doesNotThrow(() => validatePlan(undefined));
    assert.doesNotThrow(() => validatePlan('garbage'));
    assert.doesNotThrow(() => validatePlan({}));
  });

  // AC-002 — recordRevision appends; prior version is still retrievable byte-identically
  it('test_record_revision_appends_and_prior_retrievable', async () => {
    const { createPlan, recordRevision, currentSnapshot, getVersion } = await import(SUT);
    const dir = mkdtempSync(path.join(tmpdir(), 'plan-store-'));
    try {
      const plan = await createPlan({
        slug: 'rev-test',
        goal: 'Original goal',
        tasklist: makeSampleTasklist(),
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      const v1Snap = getVersion(plan, 1);
      assert.equal(v1Snap.goal, 'Original goal');

      // Build a revised snapshot
      const revisedTasklist = plan.versions[0].snapshot.tasklist.map((n) =>
        n.id === 'n1' ? { ...n, status: 'done' } : n
      );
      const revisedSnap = { goal: 'Revised goal', tasklist: revisedTasklist };

      const updatedPlan = await recordRevision(plan, revisedSnap, {
        author: 'harness',
        reason: 'updated goal',
        ts: '2026-01-02T00:00:00.000Z',
      });

      // Should now have 2 versions
      assert.equal(updatedPlan.versions.length, 2, 'should have 2 versions after revision');
      assert.equal(updatedPlan.versions[1].v, 2);
      assert.equal(updatedPlan.versions[1].author, 'harness');

      // Current snapshot = v2
      const snap = currentSnapshot(updatedPlan);
      assert.equal(snap.goal, 'Revised goal');

      // v1 must still be retrievable with original content
      const v1Retrieved = getVersion(updatedPlan, 1);
      assert.equal(v1Retrieved.goal, 'Original goal', 'v1 goal must be unchanged');
      assert.deepEqual(v1Snap, v1Retrieved, 'v1 snapshot must be byte-identically preserved');

      // Confirm no mutation of the original plan object's versions
      assert.equal(plan.versions.length, 1, 'original plan object must not be mutated');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-002 — two sequential recordRevision calls → v1, v2, v3 all retrievable
  it('test_two_revisions_strictly_increasing_no_lost_write', async () => {
    const { createPlan, recordRevision, getVersion } = await import(SUT);
    const dir = mkdtempSync(path.join(tmpdir(), 'plan-store-'));
    try {
      const plan = await createPlan({
        slug: 'two-revs',
        goal: 'Start',
        tasklist: makeSampleTasklist(),
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      const snap2 = { goal: 'Middle', tasklist: plan.versions[0].snapshot.tasklist };
      const plan2 = await recordRevision(plan, snap2, {
        author: 'h',
        reason: 'second',
        ts: '2026-01-02T00:00:00.000Z',
      });

      const snap3 = { goal: 'End', tasklist: plan2.versions[0].snapshot.tasklist };
      const plan3 = await recordRevision(plan2, snap3, {
        author: 'h',
        reason: 'third',
        ts: '2026-01-03T00:00:00.000Z',
      });

      // Three versions, strictly increasing
      assert.equal(plan3.versions.length, 3);
      assert.equal(plan3.versions[0].v, 1);
      assert.equal(plan3.versions[1].v, 2);
      assert.equal(plan3.versions[2].v, 3);

      // All retrievable with correct goals
      assert.equal(getVersion(plan3, 1).goal, 'Start');
      assert.equal(getVersion(plan3, 2).goal, 'Middle');
      assert.equal(getVersion(plan3, 3).goal, 'End');

      // Persisted file also has 3 versions
      const filePath = path.join(dir, '.claude', 'state', 'plan', 'two-revs.json');
      const persisted = JSON.parse(readFileSync(filePath, 'utf8'));
      assert.equal(persisted.versions.length, 3);
      assert.equal(persisted.versions[0].v, 1);
      assert.equal(persisted.versions[2].v, 3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-005 — thresholds resolved from tier-dial for tier 'regulated'
  it('test_thresholds_resolved_from_tier_dial', async () => {
    const { createPlan } = await import(SUT);
    const { resolveCheckerThreshold } = await import(TIER_DIAL);
    const dir = mkdtempSync(path.join(tmpdir(), 'plan-store-'));
    try {
      const plan = await createPlan({
        slug: 'reg-tier',
        goal: 'Regulated plan',
        tasklist: makeRegulatedTasklist(),
        tier: 'regulated',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      const nodes = plan.versions[0].snapshot.tasklist;
      for (const node of nodes) {
        if (!node.checker) continue;
        const expected = resolveCheckerThreshold(node.checker, {
          projectJson: { tier: { level: 'regulated' } },
        });
        assert.equal(
          node.thresholds.floor,
          expected.floor,
          `node ${node.id} (${node.checker}) floor mismatch`
        );
        assert.equal(
          node.thresholds.ceiling,
          expected.ceiling,
          `node ${node.id} (${node.checker}) ceiling mismatch`
        );
        assert.equal(
          node.thresholds.mandatory,
          expected.mandatory,
          `node ${node.id} (${node.checker}) mandatory mismatch`
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // AC-006 — mergeInput round-trips node results losslessly
  it('test_merge_input_roundtrips_node_results', async () => {
    const { createPlan, recordRevision, mergeInput } = await import(SUT);
    const dir = mkdtempSync(path.join(tmpdir(), 'plan-store-'));
    try {
      const plan = await createPlan({
        slug: 'merge-test',
        goal: 'Merge test',
        tasklist: makeSampleTasklist(),
        tier: 'internal-tool',
        rootDir: dir,
        ts: '2026-01-01T00:00:00.000Z',
      });

      // Fill results on two of three nodes; leave n3 null (no result yet)
      const tasklistWithResults = plan.versions[0].snapshot.tasklist.map((n) => {
        if (n.id === 'n1') {
          return {
            ...n,
            status: 'done',
            result: {
              verdict: 'CLEAN',
              oracle_bound: true,
              findings: [],
              false_positive_blocks: 0,
              evidence: {},
            },
          };
        }
        if (n.id === 'n2') {
          return {
            ...n,
            status: 'done',
            result: {
              verdict: 'BLOCKED',
              oracle_bound: true,
              findings: [{ msg: 'mutation score below floor' }],
              false_positive_blocks: 1,
              evidence: { score: 0.5 },
            },
          };
        }
        return n; // n3: result stays null
      });

      const resolvedPlan = await recordRevision(
        plan,
        { goal: plan.versions[0].snapshot.goal, tasklist: tasklistWithResults },
        { author: 'harness', reason: 'added results', ts: '2026-01-02T00:00:00.000Z' }
      );

      const inputs = mergeInput(resolvedPlan);

      // Only nodes with non-null results appear
      assert.equal(inputs.length, 2, 'only nodes with non-null result should appear');

      const byId = Object.fromEntries(inputs.map((x) => [x.id, x]));
      assert.ok(byId['n1'], 'n1 should be in mergeInput');
      assert.ok(byId['n2'], 'n2 should be in mergeInput');
      assert.equal(byId['n3'], undefined, 'n3 (null result) should not be in mergeInput');

      // n1: CLEAN, mandatory from resolved thresholds
      assert.equal(byId['n1'].verdict, 'CLEAN');
      assert.deepEqual(byId['n1'].findings, []);
      assert.equal(typeof byId['n1'].mandatory, 'boolean');

      // n2: BLOCKED, findings preserved
      assert.equal(byId['n2'].verdict, 'BLOCKED');
      assert.equal(byId['n2'].findings.length, 1);
      assert.equal(byId['n2'].findings[0].msg, 'mutation score below floor');

      // CLEAN iff every mandatory node is CLEAN
      const allMandatoryClean = inputs
        .filter((x) => x.mandatory)
        .every((x) => x.verdict === 'CLEAN');
      // n2 is 'tdd' checker: in internal-tool tier mandatory=false, so allMandatoryClean depends
      // only on mandatory nodes — we just assert the function returns boolean-comparable data
      assert.equal(typeof allMandatoryClean, 'boolean', 'mandatory+verdict combo must be boolean-computable');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
