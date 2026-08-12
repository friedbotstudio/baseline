// Ticket consumer-install-defects — D4 (AC-005, AC-006) and D1 (AC-001).
//
// scan-shipped-skills.mjs walks ONE root: obj/template/.claude/skills. Shipped
// commands are never scanned, which is why D1 — .claude/commands/init-project.md
// telling a consumer install to read src/agents/swarm-worker.template.md —
// reached users unseen.
//
// Two distinct gaps are separated below on purpose:
//   * ROOT coverage — .claude/commands/ is not walked at all.
//   * PATTERN coverage — a bare dev-only path inside inline backticks matches
//     none of analyzer.mjs's four RUNTIME_INVOCATION_PATTERNS (they need
//     import/require, a node|bash|sh prefix, or a leading ./). D1's actual line
//     is exactly that bare form.
// Closing the root gap alone would leave D1 undetected, so the two are asserted
// apart rather than folded into one fixture.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';

const SCANNER = join(REPO_ROOT, '.claude', 'skills', 'spec-shippability-review', 'scan-shipped-skills.mjs');
const REPORT_REL = join('.claude', 'state', 'spec-shippability', 'shipped-skills.json');
const WORKER_TEMPLATE = join(REPO_ROOT, 'src', 'agents', 'swarm-worker.template.md');
const SHIPPED_WORKER = join(REPO_ROOT, '.claude', 'agents', 'swarm-worker.md');
const RENDER_SCRIPT = join(REPO_ROOT, 'scripts', 'render-swarm-worker.mjs');

const OFFENDING_SKILL = ['```bash', 'node scripts/build-template.sh', '```'].join('\n');

function shippedTree() {
  const root = mkdtempSync(join(tmpdir(), 'shipscan-'));
  mkdirSync(join(root, 'obj', 'template', '.claude'), { recursive: true });
  return root;
}

function writeSkill(root, slug, body, skillsRel = join('obj', 'template', '.claude', 'skills')) {
  const dir = join(root, skillsRel, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${slug}\nowner: baseline\n---\n\n${body}\n`, 'utf8');
  return dir;
}

function writeCommand(root, name, body) {
  const dir = join(root, 'obj', 'template', '.claude', 'commands');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.md`);
  writeFileSync(path, body, 'utf8');
  return path;
}

function runScanner(cwd, args = []) {
  try {
    const stdout = execFileSync('node', [SCANNER, ...args], { cwd, encoding: 'utf8' });
    return { stdout, status: 0 };
  } catch (err) {
    return { stdout: String(err.stdout ?? ''), status: err.status ?? 1 };
  }
}

function readReport(cwd) {
  return JSON.parse(readFileSync(join(cwd, REPORT_REL), 'utf8'));
}

function filesIn(report) {
  return (report.findings ?? []).map((f) => f.file);
}

describe('D4/D7 — every shipped surface is scanned (AC-005, AC-006, AC-013)', () => {
  it('test_when_a_shipped_command_reads_a_src_path_then_the_scanner_reports_it', () => {
    const root = shippedTree();
    writeSkill(root, 'clean-skill', 'Nothing dev-only here.');
    writeCommand(root, 'fake-init', [
      '# fake-init',
      '',
      '4. **Re-render the worker**:',
      '   - Read the template at `src/agents/swarm-worker.template.md`.',
      '',
    ].join('\n'));

    runScanner(root);
    const report = readReport(root);

    assert.ok(
      filesIn(report).some((f) => f.includes('commands/fake-init.md')),
      `a shipped command naming a src/ path must be reported. Findings: ${JSON.stringify(filesIn(report))}. This is D1's exact form — a bare dev-only path in inline backticks — and catching it needs BOTH the commands root and a pattern that matches an unprefixed dev path`,
    );
  });

  it('test_when_a_command_invokes_a_dev_script_then_the_scanner_reports_it', () => {
    const root = shippedTree();
    writeSkill(root, 'clean-skill', 'Nothing dev-only here.');
    writeCommand(root, 'runner', ['# runner', '', '```bash', 'node scripts/build-template.sh', '```', ''].join('\n'));

    runScanner(root);
    const report = readReport(root);

    assert.ok(
      filesIn(report).some((f) => f.includes('commands/runner.md')),
      'a command whose fence invokes a dev-only script must be reported — this isolates the ROOT gap from the PATTERN gap, since this form already matches an existing pattern',
    );
  });

  it('test_when_a_scan_root_is_missing_then_it_records_a_skip_and_keeps_other_findings', () => {
    const root = shippedTree();
    writeSkill(root, 'offender', OFFENDING_SKILL);

    const { stdout } = runScanner(root);
    const report = readReport(root);

    assert.match(
      stdout,
      /skipped\s+commands/i,
      'an absent descriptor root must announce itself — a silently unscanned surface is precisely the D4 failure mode',
    );
    assert.ok(
      filesIn(report).some((f) => f.includes('offender')),
      'a missing commands root must not suppress findings from the roots that do exist',
    );
  });

  it('test_when_root_flag_is_passed_then_it_overrides_only_the_skills_root', () => {
    const root = shippedTree();
    writeSkill(root, 'offender', OFFENDING_SKILL, join('custom', 'skills'));
    writeCommand(root, 'runner', ['# runner', '', '```bash', 'node scripts/build-template.sh', '```', ''].join('\n'));

    runScanner(root, ['--root', join(root, 'custom', 'skills')]);
    const report = readReport(root);
    const files = filesIn(report);

    assert.ok(files.some((f) => f.includes('offender')), '--root must redirect the skills root');
    assert.ok(
      files.some((f) => f.includes('commands/runner.md')),
      '--root must NOT move the commands root — the spec-shippability-review adapter passes --root today and must keep getting commands coverage',
    );
  });
});

describe('D7 — the strict form is scoped to commands (AC-014)', () => {
  const BARE_IN_SKILL = 'See `src/cli/install.js` for the reference implementation.';

  it('test_when_a_bare_dev_path_is_in_a_skill_md_then_no_new_finding_is_emitted', () => {
    const root = shippedTree();
    writeSkill(root, 'descriptive', BARE_IN_SKILL);

    runScanner(root);
    const report = readReport(root);

    assert.deepEqual(
      filesIn(report),
      [],
      'a bare dev path in shipped SKILL.md prose is a statement about the repo, not an instruction to read it. Tree-wide this form hits 74 times in 22 files — 28 in the constitution alone — so widening past command surfaces would abort every build on descriptive text',
    );
  });

  it('test_when_three_argument_callers_run_then_their_verdicts_are_unchanged', async () => {
    const analyzer = await tryImport('.claude/skills/spec-shippability-review/analyzer.mjs');
    assert.ok(analyzer, 'analyzer.mjs must be importable');

    const chunks = analyzer.collectMarkdownCode(BARE_IN_SKILL);
    const legacy = analyzer.runDevTreeAndUnshippedChecks(chunks, { files: {} }, 'skills/descriptive/SKILL.md');
    const strict = analyzer.runDevTreeAndUnshippedChecks(chunks, { files: {} }, 'commands/x.md', { strictDevPaths: true });

    assert.deepEqual(
      legacy.filter((f) => f.check === 'DEV_TREE_RUNTIME_REF'),
      [],
      'the three-argument call must keep todays behavior exactly — the strict form is opt-in, so no existing caller changes verdict',
    );
    assert.equal(
      strict.filter((f) => f.check === 'DEV_TREE_RUNTIME_REF').length,
      1,
      'with strictDevPaths on, the same bare path must produce exactly one DEV_TREE_RUNTIME_REF — this is the form that would have caught D1',
    );
  });
});

describe('D1/D6 — the in-place skills-block rewrite equals the token render (AC-001, AC-011)', () => {
  const FRONTMATTER_SKILLS = /^(skills:\n)((?:[ \t]+-[^\n]*\n)+)/m;

  function rewriteSkillsBlock(text, skills) {
    assert.match(text, FRONTMATTER_SKILLS, 'the worker frontmatter must carry a skills: list block to rewrite');
    return text.replace(FRONTMATTER_SKILLS, `$1${skills.map((s) => `  - ${s}\n`).join('')}`);
  }

  it('test_when_the_worker_skills_block_is_rewritten_then_it_equals_the_token_render', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'workerender-')), 'rendered.md');
    execFileSync('node', [RENDER_SCRIPT, WORKER_TEMPLATE, out], { encoding: 'utf8' });

    const tokenRendered = readFileSync(out, 'utf8');
    const rewritten = rewriteSkillsBlock(readFileSync(SHIPPED_WORKER, 'utf8'), ['scenario', 'implement']);

    assert.equal(
      rewritten,
      tokenRendered,
      'rewriting the skills: block in place must be byte-identical to substituting {{SKILLS}} in the template. If these diverge, the in-place instruction /init-project gives a consumer install is not a lawful substitute for the dev-only template read',
    );
  });

  it('test_when_extra_skills_are_added_then_only_the_skills_block_differs', () => {
    const original = readFileSync(SHIPPED_WORKER, 'utf8');
    const rewritten = rewriteSkillsBlock(original, ['scenario', 'implement', 'rust-testing']);

    assert.match(rewritten, /^ {2}- rust-testing$/m, 'the added skill must appear in the list block');
    assert.equal(
      rewritten.replace(FRONTMATTER_SKILLS, '$1'),
      original.replace(FRONTMATTER_SKILLS, '$1'),
      'everything outside the skills: block must be untouched — a rewrite that reflows the description or body is not equivalent to token substitution',
    );
  });
});
