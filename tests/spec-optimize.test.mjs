// T5b — the spec optimization pass (AC-015, AC-016).
//
// D-5 (spec): the helper GATHERS and REPORTS; main context applies the fixes.
// AC-016 is the test that keeps that boundary honest — a helper that edits the
// spec would move a written decision out of main context (Article II), and the
// only way to prove it does not is to hash the file either side of the call.
//
// The slug guard is REJECT, never repair (CWE-22). canonicalSlug in common.mjs
// is a NORMALIZER, not a validator; using it here would silently write to a
// different path instead of refusing, which is why the traversal case asserts a
// refusal rather than a rewritten slug.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { tryImport, readFileSync } from './helpers/memory-fixtures.mjs';
import { runCli, assertPresent } from './helpers/cli-runner.mjs';

const OPTIMIZE = '.claude/skills/spec/optimize.mjs';

const FIXTURE_SPEC = [
  '# Fixture',
  '',
  '**Write set**: `.claude/skills/alpha/*.mjs`, `.claude/skills/beta/*.mjs`',
  '',
  '## System delta',
  '',
  '| Verb | Element | Anchor | Concept | Kind |',
  '|---|---|---|---|---|',
  '| change | alpha-helper | `.claude/skills/alpha/*.mjs` | concept-one | c4_component |',
  '| change | ghost-element | `.claude/skills/ghost/*.mjs` | concept-one | c4_component |',
  '',
].join('\n');

function corpusProject() {
  const root = mkdtempSync(join(tmpdir(), 'optimize-'));
  const elements = join(root, 'docs/system/elements');
  mkdirSync(elements, { recursive: true });
  mkdirSync(join(root, 'docs/system/concepts'), { recursive: true });
  mkdirSync(join(root, 'docs/specs'), { recursive: true });
  mkdirSync(join(root, '.claude/skills/alpha'), { recursive: true });
  mkdirSync(join(root, '.claude/skills/beta'), { recursive: true });

  writeFileSync(join(root, '.claude/skills/alpha/a.mjs'), 'export const a = 1;\n');
  writeFileSync(join(root, '.claude/skills/beta/b.mjs'), 'export const b = 1;\n');

  const element = (id, anchor) => `---\nid: ${id}\nkind: component\ntitle: ${id}\nanchor: ${anchor}\n---\n`;
  writeFileSync(join(elements, 'alpha-helper.md'), element('alpha-helper', '.claude/skills/alpha/*.mjs'));
  writeFileSync(join(elements, 'beta-helper.md'), element('beta-helper', '.claude/skills/beta/*.mjs'));
  writeFileSync(join(root, 'docs/system/concepts/concept-one.md'), '# concept-one\n\n- alpha-helper\n- beta-helper\n');

  writeFileSync(join(root, '.claude/project.json'), JSON.stringify({
    configured: true,
    memory: {
      architecture_map: {
        enabled: true,
        governed_surface: { roots: ['.claude/skills/'], codeExtensions: ['.mjs'], excludedSegments: [], excludedTrees: [] },
      },
    },
  }));

  const specPath = join(root, 'docs/specs/fixture.md');
  writeFileSync(specPath, FIXTURE_SPEC);
  return { root, specPath };
}

function sha(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function analyze(root, specPath) {
  const mod = await tryImport(OPTIMIZE);
  assert.ok(mod, `${OPTIMIZE} must exist and be importable`);
  assert.equal(typeof mod.analyzeSpec, 'function', 'expected named export `analyzeSpec`');
  return mod.analyzeSpec({ specPath, rootDir: root });
}

describe('spec optimization pass', () => {
  // AC-015
  it('test_when_optimize_runs_on_drafted_spec_then_undeclared_reuse_and_corrections_returned', async () => {
    const { root, specPath } = corpusProject();
    try {
      const report = await analyze(root, specPath);

      for (const key of ['undeclared', 'reuse', 'corrections']) {
        assert.ok(Array.isArray(report?.[key]), `report.${key} must be an array; got ${JSON.stringify(report?.[key])}`);
      }

      const undeclaredIds = report.undeclared.map((r) => r.elementId ?? r.element ?? r.id);
      assert.ok(
        undeclaredIds.includes('beta-helper'),
        `beta-helper is anchored inside the write_set but has no System delta row — that is the coverage gap the pass exists to find; got ${JSON.stringify(undeclaredIds)}`,
      );

      const reuseIds = report.reuse.map((r) => r.elementId ?? r.element ?? r.id);
      assert.ok(
        reuseIds.includes('alpha-helper'),
        `alpha-helper already exists and its anchor overlaps the write_set — the pass must surface it as reuse so the spec does not rebuild it; got ${JSON.stringify(reuseIds)}`,
      );

      const correctionIds = report.corrections.map((r) => r.elementId ?? r.element ?? r.id);
      assert.ok(
        correctionIds.includes('ghost-element'),
        `ghost-element is declared in a delta row but does not resolve under docs/system/elements/ — that is a correction; got ${JSON.stringify(correctionIds)}`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // AC-016 — Article II boundary.
  it('test_when_optimize_runs_then_the_spec_bytes_are_unchanged', async () => {
    const { root, specPath } = corpusProject();
    try {
      const before = sha(specPath);
      await analyze(root, specPath);
      assert.equal(
        sha(specPath),
        before,
        'the pass must not write a single byte of the spec — it reports, main context edits (Article II, spec D-5)',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // AC-015 — CWE-22 boundary.
  it('test_when_optimize_given_traversal_slug_then_it_is_rejected_before_any_path_is_built', () => {
    const res = runCli('spec', ['optimize', '--slug', '../etc/passwd']);
    assertPresent(assert, res);
    assert.notEqual(res.status, 0, 'a traversal slug must be REFUSED, never normalized into a different valid path');
    assert.match(
      `${res.stdout}${res.stderr}`,
      /slug/i,
      'the refusal must name the slug as the problem so the caller does not hunt for a filesystem fault',
    );
  });

  // AC-015 — failure mode.
  it('test_when_optimize_runs_without_docs_system_then_named_error_and_exit_one', () => {
    const root = mkdtempSync(join(tmpdir(), 'optimize-nocorpus-'));
    mkdirSync(join(root, 'docs/specs'), { recursive: true });
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(join(root, '.claude/project.json'), JSON.stringify({ configured: true }));
    writeFileSync(join(root, 'docs/specs/fixture.md'), FIXTURE_SPEC);
    try {
      const res = runCli('spec', ['optimize', '--slug', 'fixture', '--root', root]);
      assertPresent(assert, res);
      assert.equal(res.status, 1, 'a missing corpus is exit 1, not a crash and not a silent empty report');
      assert.match(
        `${res.stdout}${res.stderr}`,
        /docs\/system|corpus/i,
        'the error must name the missing corpus so /spec can continue without the pass',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
