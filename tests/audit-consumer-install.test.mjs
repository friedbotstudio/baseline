// Ticket consumer-install-defects — D2 + D5 (AC-002, AC-003, AC-010).
//
// No test in this repo has ever run the audit against a CONSUMER-shaped tree —
// src/ absent, .claude/manifest.json present. That blind spot is why
// checks/project-json.mjs shipped reading src/project.template.json
// unconditionally while its sibling checks/src-templates-a.mjs:11 gated on
// ctx.skipSrc, and why every fresh install failed Step 8's audit.
//
// AC-010 measures the whole consumer shape rather than one row, because the
// downstream report was a count: nine failures in two groups. Eight were the
// mixed memory store (D5), one was config parity (D2).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, makeProject, tryImport } from './helpers/memory-fixtures.mjs';

const PROJECT_JSON_CHECK = '.claude/skills/audit-baseline/checks/project-json.mjs';
const CONTEXT = '.claude/skills/audit-baseline/checks/context.mjs';
const AUDIT = '.claude/skills/audit-baseline/audit.mjs';
const PARITY_ROW = 'project.json <-> template: config parity';

const SHIPPED_TREE = join(REPO_ROOT, 'obj', 'template');
const shippedTreeReason = existsSync(join(SHIPPED_TREE, '.claude', 'manifest.json'))
  ? false
  : 'obj/template is build output (obj/ is gitignored) — run `npm run build` first';

function seedProjectJson(root) {
  const claudeDir = join(root, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  cpSync(join(REPO_ROOT, 'src', 'project.template.json'), join(claudeDir, 'project.json'));
}

function seedManifest(root) {
  writeFileSync(join(root, '.claude', 'manifest.json'), JSON.stringify({ manifest_version: 3, files: {}, owners: { skills: {} } }), 'utf8');
}

async function parityRowFor(root) {
  const contextMod = await tryImport(CONTEXT);
  const checkMod = await tryImport(PROJECT_JSON_CHECK);
  assert.ok(contextMod, `${CONTEXT} must be importable`);
  assert.ok(checkMod, `${PROJECT_JSON_CHECK} must be importable`);
  const ctx = contextMod.buildContext({ root, skipHashCheck: true });
  const row = checkMod.run(ctx).find(([name]) => name === PARITY_ROW);
  assert.ok(row, `the check must emit a "${PARITY_ROW}" row on every tree shape`);
  return row;
}

describe('D2 — config parity across both tree shapes (AC-002, AC-003)', () => {
  it('test_when_src_is_absent_and_manifest_present_then_config_parity_passes', async () => {
    const { root } = makeProject();
    seedProjectJson(root);
    seedManifest(root);

    const [, status, detail] = await parityRowFor(root);

    assert.equal(
      status,
      'PASS',
      `a consumer install has no src/ to compare against, so parity must PASS, not FAIL. Got: ${detail}`,
    );
    assert.match(
      detail,
      /consumer install/i,
      'the PASS must name the consumer-install reason so a skipped comparison is never mistaken for a verified one',
    );
  });

  it('test_when_manifest_present_and_consumer_has_its_own_src_then_config_parity_passes', async () => {
    const { root } = makeProject();
    seedProjectJson(root);
    seedManifest(root);
    mkdirSync(join(root, 'src'), { recursive: true });

    const [, status, detail] = await parityRowFor(root);

    assert.equal(
      status,
      'PASS',
      `manifest present means this is a consumer install; its own src/ (Rust, Python, Node, ...) is not ours to inspect and must not be searched for baseline templates. Got: ${detail}`,
    );
    assert.match(
      detail,
      /consumer install/i,
      'the PASS must name the consumer-install reason so a skipped comparison is never mistaken for a verified one',
    );
  });

  it('test_when_src_present_and_no_manifest_then_config_parity_fails', async () => {
    const { root } = makeProject();
    seedProjectJson(root);
    mkdirSync(join(root, 'src'), { recursive: true });

    const [, status, detail] = await parityRowFor(root);

    assert.equal(
      status,
      'FAIL',
      'no manifest means this is the baseline dev tree, so a missing project.template.json is a real defect and must stay a FAIL',
    );
    assert.match(detail, /src\/project\.template\.json/, 'the FAIL must name the file it could not read');
  });
});

describe('D2 + D5 — the whole consumer shape audits clean (AC-010)', () => {
  it('test_when_consumer_tree_is_audited_then_the_run_exits_zero', { skip: shippedTreeReason }, async () => {
    const auditMod = await tryImport(AUDIT);
    assert.ok(auditMod, `${AUDIT} must be importable`);

    const result = auditMod.runAudit({ rootDir: SHIPPED_TREE });
    const failures = result.failures.map(([name, , detail]) => `${name} — ${detail}`);

    assert.equal(
      result.verdict,
      'PASS',
      `the shipped tree IS the consumer shape (manifest present, src/ absent) and must audit clean.\n${failures.length} failing row(s):\n  ${failures.join('\n  ')}`,
    );
  });
});
