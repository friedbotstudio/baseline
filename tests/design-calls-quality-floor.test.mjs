import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

// Roadmap B1 — spec quality floor. A UI-touching spec's `## Design calls` rows
// must carry a populated Reference target AND Quality criteria, enforced
// identically by the guard hook and spec-lint through one shared lib.

const ROOT     = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const LIB_URL  = pathToFileURL(join(ROOT, '.claude/hooks/lib/design-calls.mjs')).href;
const HOOK_MJS = join(ROOT, '.claude/hooks/spec_design_calls_guard.mjs');
const LINT_MJS = join(ROOT, '.claude/skills/spec-lint/lint.mjs');
const TEMPLATE = join(ROOT, '.claude/skills/spec/template.md');

const UI_GLOBS       = ['app/**/*.{tsx,jsx}', '**/*.css'];
const UI_TARGET      = 'app/settings/page.tsx';
const BACKEND_TARGET = 'src/api/orders.ts';

// ── Foundation: Design calls table fixtures ──────────────────────────────────

const HEADER_8 =
  '| Slug | Intent | Target files | Write set | Register | Reference target | Quality criteria |\n' +
  '|---|---|---|---|---|---|---|';
const HEADER_LEGACY =
  '| Slug | Intent | Target files | Write set | Register | References |\n' +
  '|---|---|---|---|---|---|';

const rowBoth        = `| settings-page | build settings | ${UI_TARGET} | app/settings/** | inherit | https://ref.example/settings.png | contrast >= AA; layout matches ref +-5% |`;
const rowMissingRef  = `| settings-page | build settings | ${UI_TARGET} | app/settings/** | inherit | — | contrast >= AA |`;
const rowMissingQual = `| settings-page | build settings | ${UI_TARGET} | app/settings/** | inherit | https://ref.example/settings.png | — |`;
const rowLegacy      = `| settings-page | build settings | ${UI_TARGET} | app/settings/** | inherit | https://inspo.example |`;

const DC_BOTH         = `## Design calls\n\n${HEADER_8}\n${rowBoth}\n`;
const DC_MISSING_REF  = `## Design calls\n\n${HEADER_8}\n${rowMissingRef}\n`;
const DC_MISSING_QUAL = `## Design calls\n\n${HEADER_8}\n${rowMissingQual}\n`;
const DC_LEGACY       = `## Design calls\n\n${HEADER_LEGACY}\n${rowLegacy}\n`;
const DC_NONE         = `## Design calls\n\n- *(none)*\n`;

// ── Foundation: spec-body + project builders ─────────────────────────────────

// Minimal spec shape the guard + lint's design_calls check read: a write_set
// line, a `## Design calls` section, and the AC / Test-plan headings. No
// PlantUML fences — the guard ignores diagrams and lint's design_calls row
// prints regardless of the other checks, so no JVM is ever spawned here.
function specBody({ writeSetPath, designCalls }) {
  return `# Spec — fixture

## Goal
fixture

## Design
Prose only.

write_set: \`${writeSetPath}\`

${designCalls}
## Acceptance criteria

| ID | Criterion | Kind | Upstream AC | Sequence |
|---|---|---|---|---|
| AC-001 | given x when y then z | behavior | intake 1 | §Behavior #1 |

## Test plan

| Category | Scenario | Expected | Covers |
|---|---|---|---|
| Golden path | x | y | AC-001 |
`;
}

async function makeProject({ uiGlobs }) {
  const root = await mkdtemp(join(tmpdir(), 'design-quality-floor-'));
  const live = JSON.parse(await readFile(join(ROOT, '.claude/project.json'), 'utf8'));
  const project = JSON.parse(JSON.stringify(live));
  project.tdd.ui_globs = uiGlobs;
  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(join(root, '.claude/project.json'), JSON.stringify(project, null, 2) + '\n');
  await mkdir(join(root, 'docs/specs'), { recursive: true });
  return root;
}

function runHook(root, content) {
  const payload = {
    tool_name:  'Write',
    tool_input: { file_path: join(root, 'docs/specs/example.md'), content },
  };
  return spawnSync('node', [HOOK_MJS], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_PROJECT_ROOT: root, HOOK_PAYLOAD: JSON.stringify(payload) },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

function runLint(root, slug) {
  return spawnSync('node', [LINT_MJS, slug], {
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  });
}

async function writeSpec(root, slug, content) {
  await writeFile(join(root, `docs/specs/${slug}.md`), content);
}

function isDeny(result) {
  return /"permissionDecision"\s*:\s*"deny"/.test(result.stdout || '');
}

// ── Shared lib unit tests (AC-003, AC-004, AC-006, AC-007) ────────────────────

describe('design-calls.mjs shared lib', () => {
  it('test_when_isPopulatedCell_on_placeholders_then_false', async () => {
    const lib = await import(LIB_URL);
    for (const bad of ['', '  ', '—', '-', '(none)', 'none', 'tbd', 'TBD', 'n/a', 'N/A']) {
      assert.equal(lib.isPopulatedCell(bad), false, `expected ${JSON.stringify(bad)} → false`);
    }
    for (const good of ['contrast >= AA', 'https://ref.example/x.png', 'layout matches ref']) {
      assert.equal(lib.isPopulatedCell(good), true, `expected ${JSON.stringify(good)} → true`);
    }
  });

  it('test_when_parseDesignCalls_on_8col_table_then_locates_reference_and_quality_columns', async () => {
    const lib = await import(LIB_URL);
    const section = lib.parseDesignCalls(specBody({ writeSetPath: UI_TARGET, designCalls: DC_BOTH }));
    assert.equal(section.isNone, false);
    assert.ok(section.referenceCol >= 0, 'referenceCol must be found');
    assert.ok(section.qualityCol >= 0, 'qualityCol must be found');
    assert.equal(section.rows.length, 1);
    assert.equal(section.rows[0].referenceTarget.includes('ref.example'), true);
    assert.equal(section.rows[0].qualityCriteria.includes('contrast'), true);
    assert.deepEqual(lib.findRowDefects(section), []);
  });

  it('test_when_parseDesignCalls_on_none_body_then_isNone_true', async () => {
    const lib = await import(LIB_URL);
    const section = lib.parseDesignCalls(specBody({ writeSetPath: BACKEND_TARGET, designCalls: DC_NONE }));
    assert.equal(section.isNone, true);
    assert.deepEqual(section.rows, []);
  });

  it('test_when_legacy_table_missing_columns_then_findRowDefects_marks_every_row', async () => {
    const lib = await import(LIB_URL);
    const section = lib.parseDesignCalls(specBody({ writeSetPath: UI_TARGET, designCalls: DC_LEGACY }));
    assert.equal(section.referenceCol, -1);
    assert.equal(section.qualityCol, -1);
    const defects = lib.findRowDefects(section);
    assert.equal(defects.length, 1, 'every data row is defective when a column is absent');
    assert.ok(defects[0].missing.some((m) => /reference target/i.test(m)), 'names missing Reference target');
    assert.ok(defects[0].missing.some((m) => /quality/i.test(m)), 'names missing Quality criteria');
  });

  it('test_when_parseDesignCalls_never_throws_on_malformed', async () => {
    const lib = await import(LIB_URL);
    for (const junk of ['', 'no section here', '## Design calls\n\ngarbage without a table']) {
      assert.doesNotThrow(() => lib.parseDesignCalls(junk));
    }
  });
});

// ── Guard hook integration (AC-001, AC-002, AC-003, AC-004, AC-007) ──────────

describe('spec_design_calls_guard hook — quality floor', () => {
  it('test_when_ui_row_missing_reference_target_then_guard_denies', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const result = runHook(root, specBody({ writeSetPath: UI_TARGET, designCalls: DC_MISSING_REF }));
      assert.ok(isDeny(result), `expected deny\nstdout:\n${result.stdout}`);
      assert.match(result.stdout || '', /reference target/i, 'reason names Reference target');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('test_when_ui_row_missing_quality_criteria_then_guard_denies_naming_field', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const result = runHook(root, specBody({ writeSetPath: UI_TARGET, designCalls: DC_MISSING_QUAL }));
      assert.ok(isDeny(result), `expected deny\nstdout:\n${result.stdout}`);
      assert.match(result.stdout || '', /quality criteria/i, 'reason names Quality criteria specifically');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('test_when_ui_row_has_reference_and_quality_then_guard_allows', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const result = runHook(root, specBody({ writeSetPath: UI_TARGET, designCalls: DC_BOTH }));
      assert.equal(isDeny(result), false, `allow path must not deny\nstdout:\n${result.stdout}`);
      assert.equal(result.status, 0, 'hook exits 0 on allow');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('test_when_non_ui_spec_none_body_then_guard_allows', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const result = runHook(root, specBody({ writeSetPath: BACKEND_TARGET, designCalls: DC_NONE }));
      assert.equal(isDeny(result), false, `non-UI spec must not deny\nstdout:\n${result.stdout}`);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('test_when_legacy_table_written_as_ui_spec_then_guard_denies_naming_column', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const result = runHook(root, specBody({ writeSetPath: UI_TARGET, designCalls: DC_LEGACY }));
      assert.ok(isDeny(result), `expected deny for legacy table\nstdout:\n${result.stdout}`);
      assert.match(result.stdout || '', /reference target|quality criteria/i, 'names the missing column');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

// ── Guard ↔ lint parity (AC-005) ─────────────────────────────────────────────

describe('guard ↔ spec-lint parity via the shared lib', () => {
  it('test_when_lint_and_guard_on_same_content_then_same_verdict', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const content = specBody({ writeSetPath: UI_TARGET, designCalls: DC_MISSING_QUAL });
      await writeSpec(root, 'parity', content);
      const lint = runLint(root, 'parity');
      assert.match(lint.stdout || '', /design_calls\s+FAIL/i, `lint must FAIL design_calls\nstdout:\n${lint.stdout}`);
      const guard = runHook(root, content);
      assert.ok(isDeny(guard), 'guard must deny the same content');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('test_when_both_on_valid_content_then_both_pass', async () => {
    const root = await makeProject({ uiGlobs: UI_GLOBS });
    try {
      const content = specBody({ writeSetPath: UI_TARGET, designCalls: DC_BOTH });
      await writeSpec(root, 'parity-ok', content);
      const lint = runLint(root, 'parity-ok');
      assert.match(lint.stdout || '', /design_calls\s+PASS/i, `lint must PASS design_calls\nstdout:\n${lint.stdout}`);
      const guard = runHook(root, content);
      assert.equal(isDeny(guard), false, 'guard must allow the same content');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

// ── Template structural (AC-007 second clause) ───────────────────────────────

describe('spec/template.md Design calls contract', () => {
  it('test_when_template_read_then_design_calls_table_has_both_columns', async () => {
    const tmpl = await readFile(TEMPLATE, 'utf8');
    const dc = /^##\s+Design\s+calls\s*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/im.exec(tmpl);
    assert.ok(dc, '## Design calls section must exist');
    const header = dc[1].split('\n').find((l) => /^\|.*Slug/i.test(l)) || '';
    assert.match(header, /reference target/i, 'header must carry a Reference target column');
    assert.match(header, /quality criteria/i, 'header must carry a Quality criteria column');
  });
});
