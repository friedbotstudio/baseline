// AC-001, AC-007, AC-008, AC-009, AC-013 — the `list` verb end to end.
//
// `assertKnownSubcommand` opens every behavioural assertion here. An unknown
// subcommand exits 1, which is also what the rejection tests expect, so without
// that check `--epic nine must exit 1` would pass against a dispatcher that has
// never heard of `list` and keep passing however the real filter is written.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { runCli, runCliJson, assertPresent, assertKnownSubcommand } from './helpers/cli-runner.mjs';

const ROADMAP = 'roadmap';
const SKILL_MD = '.claude/skills/roadmap/SKILL.md';

const scratch = [];
after(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function emptyRoot() {
  const root = mkdtempSync(join(tmpdir(), 'roadmap-list-'));
  scratch.push(root);
  return root;
}

describe('roadmap list — the rendered view (AC-001)', () => {
  it('test_when_list_runs_against_the_live_plan_then_it_prints_header_totals_groups_and_next_line', () => {
    const res = runCli(ROADMAP, ['list']);
    assertKnownSubcommand(assert, res, 'list');

    assert.equal(res.status, 0, `list must exit 0; stderr: ${res.stderr}`);
    assert.match(res.stdout, /docs\/roadmap-execution-plan\.md/, 'the header names the plan it read');
    assert.match(res.stdout, /\bepics\b/i, 'the totals line names the epic count');
    assert.match(res.stdout, /Epic \d+/, 'at least one epic renders');
    assert.match(res.stdout, /Next planned:/, 'the last line names the next pickup');
  });
});

describe('roadmap list — the json path (AC-007)', () => {
  it('test_when_list_runs_with_json_then_it_emits_the_view_object_and_no_rendered_text', () => {
    const res = runCliJson(ROADMAP, ['list', '--json']);
    assertKnownSubcommand(assert, res, 'list');

    assert.ok(res.json, `--json must emit parseable JSON; stdout: ${res.stdout.slice(0, 200)}`);
    for (const key of ['path', 'totals', 'epicCount', 'groups']) {
      assert.ok(key in res.json, `the view must carry ${key}`);
    }
    assert.ok(!/Next planned:/.test(res.stdout), '--json emits data only, never the rendered text');
  });
});

describe('roadmap list — the not-found contract (AC-008)', () => {
  it('test_when_the_root_has_no_plan_file_then_list_exits_2_naming_the_path', () => {
    const res = runCli(ROADMAP, ['list', '--root', emptyRoot()]);
    assertKnownSubcommand(assert, res, 'list');

    assert.equal(res.status, 2, 'a missing plan is NotFoundError, matching tasks/epics/next');
    assert.match(res.stderr, /no roadmap at/, 'the error names the path it looked for');
  });
});

describe('roadmap list — the epic filter (AC-009)', () => {
  it('test_when_epic_filter_names_one_epic_then_only_that_epic_renders_and_no_rollup_line', () => {
    const res = runCli(ROADMAP, ['list', '--epic', '9']);
    assertKnownSubcommand(assert, res, 'list');

    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    assert.match(res.stdout, /Epic 9\b/, 'the named epic renders');
    assert.ok(!/Epic (?!9\b)\d+/.test(res.stdout), 'no other epic header renders');
    assert.ok(!/Epics\s+\d/.test(res.stdout), 'a filtered view emits no rollup line');
  });

  it('test_when_epic_filter_is_not_an_integer_then_list_exits_1_with_the_same_message_tasks_produces', () => {
    const listed = runCli(ROADMAP, ['list', '--epic', 'nine']);
    const tasked = runCli(ROADMAP, ['tasks', '--epic', 'nine']);
    assertKnownSubcommand(assert, listed, 'list');

    assert.equal(listed.status, 1, 'a non-integer filter is a usage error');
    assert.equal(
      listed.stderr,
      tasked.stderr,
      'list and tasks must share the filter, not re-implement it — identical stderr is the evidence',
    );
  });
});

describe('roadmap SKILL.md — the front door itself (AC-013)', () => {
  it('test_when_roadmap_skill_md_is_read_then_frontmatter_declares_baseline_ownership', () => {
    const text = readFileSync(join(REPO_ROOT, SKILL_MD), 'utf8');
    const frontmatter = text.split('---')[1] ?? '';

    assert.match(frontmatter, /^name:\s*roadmap$/m, 'the skill names itself roadmap');
    assert.match(frontmatter, /^owner:\s*baseline$/m, 'Article XII ownership is declared');
    assert.match(
      frontmatter,
      /^disable-model-invocation:\s*true$/m,
      'a read-only recap is user-invoked, like standup — it must not enter the model skill index',
    );
  });

  it('test_when_roadmap_skill_md_sop_is_read_then_it_names_every_verb_the_dispatcher_exposes', async () => {
    const text = readFileSync(join(REPO_ROOT, SKILL_MD), 'utf8');
    const res = runCli(ROADMAP, ['--help']);
    assertPresent(assert, res);

    // The usage block prints one indented row per subcommand. Reading the verbs
    // from the dispatcher rather than listing them here is what makes this fail
    // when a future verb is added without documenting it.
    const verbs = [...res.stdout.matchAll(/^ {2}(\w[\w-]*) {2,}/gm)].map((m) => m[1]);
    assert.ok(verbs.length >= 4, `expected at least four verbs, parsed: ${verbs.join(', ')}`);

    for (const verb of verbs) {
      assert.ok(
        text.includes(`\`${verb}\``) || new RegExp(`\\b${verb}\\b`).test(text),
        `the SOP must name the \`${verb}\` verb — backlog seven-skill-sops-under-describe-their-cli-2f7d is exactly this drift`,
      );
    }
  });
});
