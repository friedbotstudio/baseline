// Tests for the gate-A open-questions consolidator at
// .claude/skills/harness/consolidate-open-questions.mjs.
//
// At the /approve-spec (gate A) yield, the harness surfaces the open questions
// a reviewer must settle before approving. They are scattered across the
// intake, research, and spec artifacts (each under a `## Open questions`
// section) and often restate the same question as it travels downstream. This
// helper extracts them, dedupes across phases, and buckets by source so the
// reviewer sees one consolidated list.
//
// Pure functions are imported dynamically (the module may not exist yet when
// these first run RED); the CLI is exercised via spawnSync against a tempdir.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const HELPER_PATH = join(REPO_ROOT, '.claude/skills/harness/consolidate-open-questions.mjs');

let mod;
before(async () => {
  mod = await import(pathToFileURL(HELPER_PATH).href);
});

describe('extractOpenQuestions', () => {
  it('test_when_artifact_has_open_questions_section_then_extracts_bullets', () => {
    const md = [
      '# Intake',
      '',
      '## Open questions',
      '',
      '- First question about scope?',
      '- Second question about rollout?',
      '- Third question about owners?',
      '',
      '## Acceptance criteria',
      '',
      '- AC-001 not a question',
    ].join('\n');
    const got = mod.extractOpenQuestions(md);
    assert.deepEqual(got, [
      'First question about scope?',
      'Second question about rollout?',
      'Third question about owners?',
    ]);
  });

  it('test_when_section_is_none_placeholder_then_extracts_empty', () => {
    const md = [
      '## Open questions',
      '',
      '- *(none — all upstream open questions resolved)*',
      '',
    ].join('\n');
    assert.deepEqual(mod.extractOpenQuestions(md), []);
  });

  it('test_when_no_open_questions_heading_then_extracts_empty', () => {
    const md = ['# Spec', '', '## Design', '', '- a component', ''].join('\n');
    assert.deepEqual(mod.extractOpenQuestions(md), []);
  });

  it('test_when_heading_case_or_boundary_varies_then_still_parses', () => {
    const md = [
      '## Open Questions',
      '',
      '- Only this one belongs.',
      '',
      '## Risks',
      '',
      '- This risk must not leak in.',
    ].join('\n');
    assert.deepEqual(mod.extractOpenQuestions(md), ['Only this one belongs.']);
  });
});

describe('consolidateOpenQuestions', () => {
  it('test_when_same_question_across_phases_then_deduped_once_with_sources', () => {
    const intake = ['## Open questions', '', '- **Canonical domain.** What is the final hostname?'].join('\n');
    const research = ['## Open questions', '', '- **Canonical domain.** What is the final hostname'].join('\n');
    const out = mod.consolidateOpenQuestions({ intake, research, spec: null });
    assert.equal(out.total, 1, `expected dedup to 1 item, got ${out.total}`);
    assert.equal(out.items.length, 1);
    assert.deepEqual([...out.items[0].sources].sort(), ['intake', 'research']);
  });

  it('test_when_questions_across_phases_then_ordered_spec_research_intake', () => {
    const intake = ['## Open questions', '', '- Intake-only question?'].join('\n');
    const research = ['## Open questions', '', '- Research-only question?'].join('\n');
    const spec = ['## Open questions', '', '- Spec-level question?'].join('\n');
    const out = mod.consolidateOpenQuestions({ intake, research, spec });
    assert.equal(out.total, 3);
    assert.equal(out.items.length, 3);
    assert.ok(out.items[0].sources.includes('spec'), 'spec question should sort first');
    assert.ok(out.items[1].sources.includes('research') && !out.items[1].sources.includes('spec'), 'research-only second');
    assert.ok(out.items[2].sources.includes('intake') && out.items[2].sources.length === 1, 'intake-only last');
    assert.deepEqual(out.bySource.spec, ['Spec-level question?']);
  });
});

describe('consolidate-open-questions CLI', () => {
  function seedArtifacts({ slug, intake, research, spec }) {
    const root = mkdtempSync(join(tmpdir(), 'oq-gate-'));
    for (const [sub, body] of [['intake', intake], ['research', research], ['specs', spec]]) {
      if (body == null) continue;
      mkdirSync(join(root, 'docs', sub), { recursive: true });
      writeFileSync(join(root, 'docs', sub, `${slug}.md`), body);
    }
    return root;
  }

  it('test_when_cli_run_with_slug_then_prints_consolidated_surface', () => {
    const slug = 'demo-slug';
    const root = seedArtifacts({
      slug,
      intake: ['## Open questions', '', '- Intake question about scope?'].join('\n'),
      research: ['## Open questions', '', '- Research question about library?'].join('\n'),
      spec: ['## Open questions', '', '- *(none — resolved)*'].join('\n'),
    });
    try {
      const r = spawnSync('node', [HELPER_PATH, '--slug', slug, '--dir', root], { encoding: 'utf8' });
      assert.equal(r.status, 0, `CLI failed: ${r.stderr}`);
      assert.match(r.stdout, /Open questions to resolve before approving/);
      assert.match(r.stdout, /Intake question about scope\?/);
      assert.match(r.stdout, /Research question about library\?/);
      assert.match(r.stdout, /\[intake\]/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_slug_has_path_traversal_then_rejected', () => {
    // CWE-22 guard: a `../`-bearing slug must be refused before any file read,
    // so the helper cannot echo a `## Open questions` section from an arbitrary
    // .md file outside docs/{intake,research,specs}/.
    const root = mkdtempSync(join(tmpdir(), 'oq-gate-trav-'));
    writeFileSync(join(root, 'secret.md'), ['## Open questions', '', '- LEAKED'].join('\n'));
    try {
      const r = spawnSync('node', [HELPER_PATH, '--slug', '../../secret', '--dir', root], { encoding: 'utf8' });
      assert.notEqual(r.status, 0, 'traversal slug must be rejected with a non-zero exit');
      assert.doesNotMatch(r.stdout, /LEAKED/, 'no file content may be echoed for a rejected slug');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_cli_run_with_no_questions_then_prints_clear_empty_line', () => {
    const slug = 'empty-slug';
    const root = seedArtifacts({
      slug,
      intake: ['## Open questions', '', '- *(none)*'].join('\n'),
      research: null,
      spec: null,
    });
    try {
      const r = spawnSync('node', [HELPER_PATH, '--slug', slug, '--dir', root], { encoding: 'utf8' });
      assert.equal(r.status, 0, `CLI failed: ${r.stderr}`);
      assert.match(r.stdout, /No open questions found/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
