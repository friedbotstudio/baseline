// T6 — spec_design_calls_guard has never fired. The shipped template mandates
// the BOLDED write-set form (`**Write set**: ...`), and the guard's regex
// (/write[_\s]set\s*:/) cannot match it: the `**` sits between "set" and ":".
//
// The one line that DOES match in a real spec is `+write_set: string[]` inside
// the PlantUML class diagram, which extracts zero paths — so the guard reached
// its SKIP branch and looked correct. That is why this went unnoticed.
//
// The corrected pattern already exists at write-set-profile.mjs:58; T6
// propagates it to the guard and to spec-lint.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = path.join(REPO_ROOT, '.claude/hooks/spec_design_calls_guard.mjs');
const LINT = path.join(REPO_ROOT, '.claude/skills/spec-lint/lint.mjs');

const DESIGN_ROWS_OK = `
## Design calls

| Slug | Intent | Target files | Write set | Register | Reference target | Quality criteria |
|---|---|---|---|---|---|---|
| hero | make the hero argue | site-src/index.njk | site-src/** | brand | DESIGN.md#marketing-surfaces .hero | contrast >= AA; renders at 360/768/1280 |
`;

const DESIGN_ROWS_INCOMPLETE = `
## Design calls

| Slug | Intent | Target files | Write set | Register | Reference target | Quality criteria |
|---|---|---|---|---|---|---|
| hero | make the hero argue | site-src/index.njk | site-src/** | brand | DESIGN.md#marketing-surfaces .hero |  |
`;

// The class-diagram field that the broken regex was matching instead.
const CLASS_DIAGRAM = [
  '```plantuml',
  '@startuml',
  'class Task {',
  '  +write_set: string[]',
  '}',
  '@enduml',
  '```',
].join('\n');

const specWith = (writeSetLine, rows = DESIGN_ROWS_OK) =>
  ['# Spec', '', '## Context', '', writeSetLine, '', '## Goal', '', 'g', '', '## Design', '', CLASS_DIAGRAM, rows, '', '## Acceptance criteria', '', '## Test plan', ''].join('\n');

function runGuard(specBody) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'dcg-'));
  try {
    mkdirSync(path.join(tmp, '.claude'), { recursive: true });
    writeFileSync(
      path.join(tmp, '.claude/project.json'),
      JSON.stringify({ tdd: { ui_globs: ['site-src/**', '**/*.njk'] } }),
    );
    const payload = {
      tool_name: 'Write',
      tool_input: { file_path: path.join(tmp, 'docs/specs/x.md'), content: specBody },
    };
    const r = spawnSync('node', [GUARD], {
      cwd: tmp,
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
      input: JSON.stringify(payload),
      encoding: 'utf8',
    });
    return {
      out: `${r.stdout || ''}${r.stderr || ''}`,
      decision: decisionOf(r.stdout),
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// PreToolUse guards signal their verdict in stdout JSON and ALWAYS exit 0
// (hooks/lib/common.mjs emitBlock/emitAllow), so the exit code carries no
// verdict. An absent or unparseable payload is an allow.
function decisionOf(stdout) {
  if (!stdout || !stdout.trim()) return 'allow';
  try {
    return JSON.parse(stdout)?.hookSpecificOutput?.permissionDecision ?? 'allow';
  } catch {
    return 'allow';
  }
}

const guardSource = () => readFileSync(GUARD, 'utf8');
const lintSource = () => readFileSync(LINT, 'utf8');

// The corrected pattern must tolerate `**`, and accept `:` or ` is `.
const CORRECTED_REGEX_SHAPE = /write\[_\\s\]set\\\*\{0,2\}/;

describe('T6 — design-calls guard extracts the template write-set form', () => {
  it('test_when_writeset_bolded_form_then_paths_extracted', () => { // AC-015
    // Complete rows, so the correct verdict is allow — but it must be an allow
    // reached by EXTRACTING the paths, which the regex assertion below pins.
    const r = runGuard(specWith('**Write set**: `site-src/index.njk`, `docs/x.md`'));
    assert.equal(r.decision, 'allow', 'a bolded write_set with complete rows must be allowed');
    assert.match(
      guardSource(),
      CORRECTED_REGEX_SHAPE,
      'spec_design_calls_guard.mjs must adopt the corrected write-set regex from write-set-profile.mjs:58',
    );
  });

  it('test_when_writeset_plain_and_prose_forms_then_same_paths', () => { // AC-015
    const forms = [
      '**Write set**: `site-src/index.njk`',
      'Write set: `site-src/index.njk`',
      'The write_set is `site-src/index.njk`',
    ];
    const verdicts = forms.map((f) => runGuard(specWith(f, DESIGN_ROWS_INCOMPLETE)).decision);
    assert.equal(
      new Set(verdicts).size,
      1,
      `all three write-set forms must reach the same verdict; got ${JSON.stringify(verdicts)}`,
    );
    // Agreement alone is satisfied by the broken regex skipping all three.
    // Pin the shared verdict to deny so this cannot pass vacuously.
    assert.equal(
      verdicts[0],
      'deny',
      'all three forms declare a UI write_set with an incomplete row, so the shared verdict must be deny',
    );
  });

  it('test_when_ui_row_missing_quality_criteria_then_guard_denies', () => { // AC-015
    const r = runGuard(specWith('**Write set**: `site-src/index.njk`', DESIGN_ROWS_INCOMPLETE));
    assert.equal(r.decision, 'deny', 'a UI write_set with an incomplete Design calls row must be denied');
    assert.match(r.out, /hero/, 'the denial must name the offending row slug');
    assert.match(r.out, /Quality criteria/i, 'the denial must name the missing cell');
  });

  it('test_when_class_diagram_writeset_field_then_contributes_no_paths', () => { // AC-015
    // The regression that hid the bug: `+write_set: string[]` matched, yielded
    // zero paths, and the guard SKIPped looking healthy.
    const specNoWriteSetLine = [
      '# Spec', '', '## Context', '', '## Goal', '', 'g', '',
      '## Design', '', CLASS_DIAGRAM, DESIGN_ROWS_INCOMPLETE, '',
      '## Acceptance criteria', '', '## Test plan', '',
    ].join('\n');
    const r = runGuard(specNoWriteSetLine);
    assert.equal(
      r.decision,
      'allow',
      'a class-diagram write_set field is not a write-set declaration and must never drive a deny',
    );
  });

  it('test_when_no_ui_paths_then_guard_skips', () => { // AC-015
    const r = runGuard(specWith('**Write set**: `docs/init/seed.md`, `CLAUDE.md`', DESIGN_ROWS_INCOMPLETE));
    assert.equal(r.decision, 'allow', 'a spec with no ui_globs path must still be allowed via SKIP');
  });

  it('test_when_spec_lint_checked_then_shares_the_corrected_regex', () => { // AC-015
    assert.match(
      lintSource(),
      CORRECTED_REGEX_SHAPE,
      'spec-lint/lint.mjs must adopt the same corrected regex so lint and guard agree',
    );
  });
});
