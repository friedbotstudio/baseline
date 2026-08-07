// system-spec-delta slice A — a spec declares its delta against docs/system/.
//
// Covers AC-001 (the section becomes required), AC-002 (the *(none)* literal is the
// sole legal empty body) and AC-003 (spec-lint validates each row, rejecting an
// unsafe element id before a path is built).
//
// Two levels deliberately:
//   - parseDelta and checkSystemDelta are exercised directly, so the default suite
//     covers the logic without spawning anything.
//   - The full lint CLI is exercised behind PLANTUML_TESTS, matching
//     spec-lint-design-calls.test.mjs: `plantuml` on PATH makes checkSyntax spawn a
//     JVM per fence, which is too slow to run by default.
//
// Slice A builds parseDelta ONLY. verifyDelta / applyDelta / verifyAndApplyDelta and
// every archive behavior are slice C; writeDiagramShard is slice B.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const LINT_MJS = join(ROOT, '.claude/skills/spec-lint/lint.mjs');
const GUARD_MJS = join(ROOT, '.claude/hooks/artifact_template_guard.mjs');
const DELTA_MJS = join(ROOT, '.claude/skills/workspace/delta.mjs');
const SPEC_LINT_SKILL = join(ROOT, '.claude/skills/spec-lint/SKILL.md');

const PLANTUML_SKIP = process.env.PLANTUML_TESTS
  ? false
  : 'set PLANTUML_TESTS=1 to run JVM-spawning PlantUML tests';

// A governed-surface file and a corpus element that both exist in the live tree.
// The add-row check resolves anchors against coverage.governedFiles, so a real path
// is the fixture; inventing one would test the fixture rather than the surface.
const GOVERNED_ANCHOR = '.claude/hooks/track_guard.mjs';
const UNGOVERNED_ANCHOR = 'docs/notes/scratch.md';
const LIVE_ELEMENT_ID = 'approval-anchor';
const MISSING_ELEMENT_ID = 'no-such-element-xyz';

// The modules under test do not exist until `implement` runs. Importing them at
// module scope would make the whole file uncollectable with a cryptic ERR_MODULE
// error, so each import is resolved once here and its failure reported per test.
async function loadModule(path) {
  try {
    return { mod: await import(path), error: null };
  } catch (e) {
    return { mod: null, error: e };
  }
}

const delta = await loadModule(DELTA_MJS);
const lint = await loadModule(LINT_MJS);

function requireExport(loaded, name, modulePath) {
  if (loaded.error) {
    assert.fail(`${modulePath} failed to import: ${loaded.error.message}`);
  }
  const fn = loaded.mod[name];
  assert.equal(typeof fn, 'function', `${modulePath} must export ${name}`);
  return fn;
}

const DELTA_HEADER = '| Verb | Element | Anchor | Concept | Kind |\n|---|---|---|---|---|';

function deltaSection(body) {
  return `## System delta\n\n${body}\n`;
}

function deltaTable(rows) {
  const body = rows
    .map((r) => `| ${r.verb} | ${r.elementId} | ${r.anchor} | ${r.concept} | ${r.kind} |`)
    .join('\n');
  return `${DELTA_HEADER}\n${body}`;
}

// A spec body carrying only what the checks under test read. The lint CLI tests use
// fullSpecBody instead, which additionally satisfies the diagram checks.
function specWithDelta(body) {
  return `# Spec — delta fixture\n\n## Goal\n\nFixture.\n\n${deltaSection(body)}\n## Acceptance criteria\n\n| ID | Criterion | Upstream AC | Sequence |\n|---|---|---|---|\n| AC-001 | given x when y then z | intake AC 1 | §Behavior #1 |\n`;
}

function liveProjectJson() {
  return JSON.parse(readFileSync(join(ROOT, '.claude/project.json'), 'utf8'));
}

function projectWithoutArchitectureMap() {
  const pj = liveProjectJson();
  delete pj.memory;
  return pj;
}

describe('AC-001 — the System delta section is required', () => {
  it('test_when_required_sections_includes_system_delta_then_config_declares_it', () => {
    const required = liveProjectJson().artifacts?.required_sections?.spec;
    assert.ok(Array.isArray(required), 'artifacts.required_sections.spec must be an array');
    assert.ok(
      required.includes('System delta'),
      `required_sections.spec must include "System delta"; got ${JSON.stringify(required)}`,
    );
    assert.ok(
      required.indexOf('System delta') > required.indexOf('Design calls'),
      'System delta must sit after Design calls',
    );
    assert.ok(
      required.indexOf('System delta') < required.indexOf('Acceptance criteria'),
      'System delta must sit before Acceptance criteria',
    );
  });

  it('test_when_spec_write_lacks_system_delta_heading_then_guard_denies_naming_it', () => {
    const root = mkdtempSync(join(tmpdir(), 'delta-guard-'));
    try {
      mkdirSync(join(root, '.claude'), { recursive: true });
      mkdirSync(join(root, 'docs/specs'), { recursive: true });
      const pj = liveProjectJson();
      writeFileSync(join(root, '.claude/project.json'), `${JSON.stringify(pj, null, 2)}\n`);

      const required = pj.artifacts.required_sections.spec;
      const content = required
        .filter((section) => section !== 'System delta')
        .map((section) => `## ${section}\n\nfixture body.\n`)
        .join('\n');

      const payload = {
        tool_name: 'Write',
        tool_input: { file_path: join(root, 'docs/specs/example.md'), content },
      };
      const result = spawnSync('node', [GUARD_MJS], {
        cwd: root,
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: root,
          CLAUDE_PROJECT_ROOT: root,
          HOOK_PAYLOAD: JSON.stringify(payload),
        },
        input: JSON.stringify(payload),
        encoding: 'utf8',
      });

      assert.match(
        result.stdout || '',
        /"permissionDecision"\s*:\s*"deny"/,
        `expected deny\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assert.match(
        result.stdout || '',
        /System delta/i,
        'the deny reason must name the missing System delta section',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('AC-002 — the *(none)* literal is a legal empty body', () => {
  it('test_when_delta_body_is_none_literal_then_parse_reports_empty_true', () => {
    const parseDelta = requireExport(delta, 'parseDelta', DELTA_MJS);
    const parsed = parseDelta(specWithDelta('*(none)*'));
    assert.deepEqual(parsed.rows, [], 'the none literal declares no rows');
    assert.deepEqual(parsed.errors, [], 'the none literal is not an error');
    assert.equal(parsed.empty, true, 'the none literal sets empty: true');
  });

  it('test_when_delta_body_is_none_literal_then_lint_system_delta_passes', () => {
    const checkSystemDelta = requireExport(lint, 'checkSystemDelta', LINT_MJS);
    const [status] = checkSystemDelta(specWithDelta('*(none)*'), liveProjectJson(), ROOT);
    assert.equal(status, 'PASS', 'an empty declared delta passes the check');
  });
});

describe('AC-003 — spec-lint validates each delta row', () => {
  it('test_when_delta_has_valid_add_and_change_rows_then_system_delta_passes', () => {
    const checkSystemDelta = requireExport(lint, 'checkSystemDelta', LINT_MJS);
    const spec = specWithDelta(deltaTable([
      { verb: 'add', elementId: 'new-element', anchor: GOVERNED_ANCHOR, concept: 'guard-substrate', kind: 'c4_component' },
      { verb: 'change', elementId: LIVE_ELEMENT_ID, anchor: GOVERNED_ANCHOR, concept: 'consent-gates', kind: 'class' },
    ]));
    const [status, detail] = checkSystemDelta(spec, liveProjectJson(), ROOT);
    assert.equal(status, 'PASS', `expected PASS; got ${status} — ${detail}`);
  });

  it('test_when_add_row_anchor_falls_outside_governed_surface_then_lint_fails_naming_the_row', () => {
    const checkSystemDelta = requireExport(lint, 'checkSystemDelta', LINT_MJS);
    const spec = specWithDelta(deltaTable([
      { verb: 'add', elementId: 'stray-element', anchor: UNGOVERNED_ANCHOR, concept: 'docs-pipeline', kind: 'c4_component' },
    ]));
    const [status, detail] = checkSystemDelta(spec, liveProjectJson(), ROOT);
    assert.equal(status, 'FAIL', 'an out-of-surface anchor fails the check');
    assert.match(detail, /stray-element|docs\/notes\/scratch\.md/, 'the failure names the offending row');
  });

  it('test_when_change_row_element_id_does_not_resolve_then_lint_fails_naming_the_row', () => {
    const checkSystemDelta = requireExport(lint, 'checkSystemDelta', LINT_MJS);
    for (const verb of ['change', 'remove']) {
      const spec = specWithDelta(deltaTable([
        { verb, elementId: MISSING_ELEMENT_ID, anchor: GOVERNED_ANCHOR, concept: 'memory-model', kind: 'class' },
      ]));
      const [status, detail] = checkSystemDelta(spec, liveProjectJson(), ROOT);
      assert.equal(status, 'FAIL', `a ${verb} row naming an unresolvable element must FAIL`);
      assert.match(detail, new RegExp(MISSING_ELEMENT_ID), `the ${verb} failure names the offending element id`);
    }
  });

  it('test_when_multiple_rows_offend_then_failure_names_every_offending_row', () => {
    const checkSystemDelta = requireExport(lint, 'checkSystemDelta', LINT_MJS);
    const spec = specWithDelta(deltaTable([
      { verb: 'add', elementId: 'stray-element', anchor: UNGOVERNED_ANCHOR, concept: 'docs-pipeline', kind: 'c4_component' },
      { verb: 'change', elementId: MISSING_ELEMENT_ID, anchor: GOVERNED_ANCHOR, concept: 'memory-model', kind: 'class' },
    ]));
    const [status, detail] = checkSystemDelta(spec, liveProjectJson(), ROOT);
    assert.equal(status, 'FAIL', 'two bad rows still fail');
    assert.match(detail, /stray-element|docs\/notes\/scratch\.md/, 'the first offender is named');
    assert.match(detail, new RegExp(MISSING_ELEMENT_ID), 'the second offender is named too');
  });

  it('test_when_element_id_is_unsafe_then_assert_safe_slug_throws_before_any_path_is_built', async () => {
    const { assertSafeSlug } = await import(join(ROOT, '.claude/hooks/lib/slug.mjs'));
    for (const unsafe of ['../../etc/passwd', 'a/../b']) {
      assert.throws(
        () => assertSafeSlug(unsafe, 'delta element id'),
        /refusing to build a path/,
        `assertSafeSlug must reject ${unsafe}`,
      );
    }

    // The check surfaces the rejection as a FAIL rather than letting it crash the CLI.
    const checkSystemDelta = requireExport(lint, 'checkSystemDelta', LINT_MJS);
    const spec = specWithDelta(deltaTable([
      { verb: 'change', elementId: '../../etc/passwd', anchor: GOVERNED_ANCHOR, concept: 'memory-model', kind: 'class' },
    ]));
    let result;
    assert.doesNotThrow(() => { result = checkSystemDelta(spec, liveProjectJson(), ROOT); },
      'the check must not propagate the traversal rejection');
    assert.equal(result[0], 'FAIL', 'an unsafe element id fails the check');
  });

  it('test_when_delta_table_row_is_malformed_then_error_recorded_and_parse_does_not_throw', () => {
    const parseDelta = requireExport(delta, 'parseDelta', DELTA_MJS);
    const spec = specWithDelta(
      `${DELTA_HEADER}\n| add | short-row | ${GOVERNED_ANCHOR} |\n| rename | bad-verb | ${GOVERNED_ANCHOR} | guard-substrate | class |`,
    );
    let parsed;
    assert.doesNotThrow(() => { parsed = parseDelta(spec); }, 'parseDelta never throws on malformed input');
    assert.equal(parsed.empty, false, 'a populated-but-malformed table is not empty');
    assert.ok(parsed.errors.length >= 2, `expected an error per malformed row; got ${JSON.stringify(parsed.errors)}`);
    assert.ok(
      parsed.errors.some((e) => /rename/.test(e)),
      'the unknown verb is reported by name',
    );
  });
});

describe('shipped-consumer safety and doc currency', () => {
  it('test_when_architecture_map_flag_is_absent_then_system_delta_check_skips', () => {
    const checkSystemDelta = requireExport(lint, 'checkSystemDelta', LINT_MJS);
    const spec = specWithDelta(deltaTable([
      { verb: 'add', elementId: 'stray-element', anchor: UNGOVERNED_ANCHOR, concept: 'docs-pipeline', kind: 'c4_component' },
    ]));
    const [status] = checkSystemDelta(spec, projectWithoutArchitectureMap(), ROOT);
    assert.equal(status, 'SKIP', 'with the flag absent the check must SKIP, never FAIL');
  });

  it('test_when_spec_lint_skill_md_states_a_check_count_then_it_matches_lint_mjs', () => {
    const skillText = readFileSync(SPEC_LINT_SKILL, 'utf8');
    const lintText = readFileSync(LINT_MJS, 'utf8');

    const wired = [...lintText.matchAll(/\[\s*'([a-z_]+)'\s*,\s*\.\.\.check/g)].map((m) => m[1]);
    assert.ok(wired.length >= 5, `expected at least 5 unconditional checks wired; got ${JSON.stringify(wired)}`);
    assert.ok(wired.includes('system_delta'), 'system_delta must be wired into the results array');

    for (const name of wired) {
      assert.match(
        skillText,
        new RegExp(name.replace(/_/g, '[_ ]')),
        `spec-lint/SKILL.md must document the ${name} check`,
      );
    }
    assert.doesNotMatch(
      skillText,
      /\bthree checks\b/i,
      'the stale "three checks" claim must be corrected — lint.mjs wires more than three',
    );
  });
});

describe('spec-lint CLI end to end', { skip: PLANTUML_SKIP }, () => {
  it('test_when_cli_runs_on_spec_with_valid_delta_then_system_delta_row_passes', () => {
    const root = mkdtempSync(join(tmpdir(), 'delta-cli-'));
    try {
      mkdirSync(join(root, '.claude'), { recursive: true });
      mkdirSync(join(root, 'docs/specs'), { recursive: true });
      writeFileSync(join(root, '.claude/project.json'), `${JSON.stringify(liveProjectJson(), null, 2)}\n`);
      writeFileSync(join(root, 'docs/specs/delta-ok.md'), specWithDelta('*(none)*'));

      const result = spawnSync('node', [LINT_MJS, 'delta-ok'], {
        cwd: root,
        env: { ...process.env, CLAUDE_PROJECT_DIR: root },
        encoding: 'utf8',
      });
      assert.match(result.stdout, /system_delta\s+(PASS|SKIP)/i, `system_delta row missing\n${result.stdout}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
