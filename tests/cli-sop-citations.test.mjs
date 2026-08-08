// Skill-helper CLI dispatchers — the SOP rewrite and routing traps
// (AC-012..AC-015).
//
// These read files that already exist and assert patterns /implement must add or
// remove, so their RED state is an assertion failure rather than an import error.
// Both are valid pre-implement RED.
//
// Detection is a whole-file substring scan, deliberately NOT a tagged-fence
// extractor. SKILL.md files routinely put commands in INDENTED bare ``` fences
// inside numbered lists, which a /^```(bash|sh)/ regex misses entirely — the
// exact blind spot that let a marker-import bug ship once before. The substring
// `node -e "import(` is narrow enough that no legitimate prose contains it, so
// the false-positive cost of scanning the whole file is zero.
//
// Every scan opens by proving the file is non-empty. A "no bad X in F" assertion
// over an absent or empty F passes for the wrong reason and stays green forever.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './helpers/memory-fixtures.mjs';
import { DISPATCHERS, ARGV_LIB, PATTERN_B, patternBPath } from './helpers/cli-runner.mjs';

const SKILLS_DIR = join(REPO_ROOT, '.claude/skills');
const INLINE_IMPORT = 'node -e "import(';

function shippedSkillFiles() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(SKILLS_DIR, entry.name, 'SKILL.md'))
    .filter((path) => existsSync(path));
}

function offendingLines(text, needle) {
  return text
    .split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => line.includes(needle));
}

describe('SOP citations name a command, not an inline import', () => {
  // AC-012, re-armed by the dispatcher sweep (its AC-017).
  //
  // This list was scoped to 12 of 31 sites because the four dispatchers that
  // shipped in 4cc46e0 reached only those, and the remainder was recorded as
  // backlog `finish-the-dispatcher-sweep` rather than silently dropped. The sweep
  // closed it, so the list is now the full set of covered targets.
  //
  // The census was re-measured during that spec and corrected: the raw needle
  // returns 19 hits across 15 shipped SKILL.md files, but two of them are
  // spec-shippability-review quoting the pattern IT detects. Those are not call
  // sites and are asserted to survive below. 17 real sites remain, and every one
  // of their target modules is named here.
  const COVERED_MODULES = [
    // covered by the four dispatchers of 4cc46e0
    'workspace/flags.mjs',
    'system-reconcile/reconcile-report.mjs',
    'memory-flush/stale-elements.mjs',
    'memory-flush/route.mjs',
    'memory-flush/ledger.mjs',
    'memory-index/constraints.mjs',
    'memory-index/resolve.mjs',
    // added by the sweep — seven workspace subcommands
    'workspace/delta.mjs',
    'workspace/placement.mjs',
    'workspace/digest.mjs',
    'workspace/reconcile.mjs',
    'workspace/annotations.mjs',
    'workspace/sync.mjs',
    'workspace/shards.mjs',
    // added by the sweep — two new Pattern A dispatchers
    'document/receipts.mjs',
    'document/public-site-reflect.mjs',
    'hooks/lib/common.mjs',
    // added by the sweep — six Pattern B entry points
    'commit-planner/inventory.mjs',
    'power/commit-split.mjs',
    'sprint-plan/validate-manifest.mjs',
    'sprint-planner/planner.mjs',
    'org-dispatch/org-mode.mjs',
    'harness/workflow-migrator.js',
  ];

  it('test_when_shipped_skill_md_scanned_then_no_inline_node_e_import_remains', () => {
    const files = shippedSkillFiles();
    assert.ok(files.length > 0, 'the SKILL.md roster must be non-empty before absence can be asserted');

    const offenders = [];
    for (const path of files) {
      const text = readFileSync(path, 'utf8');
      assert.ok(text.length > 0, `${path} must be non-empty before its content can be checked`);
      for (const hit of offendingLines(text, INLINE_IMPORT)) {
        const covered = COVERED_MODULES.find((module) => hit.line.includes(module));
        if (covered) offenders.push(`${path.replace(REPO_ROOT + '/', '')}:${hit.n} -> ${covered}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'a call site whose module HAS a dispatcher subcommand must cite the command; the named list is the punch list',
    );
  });

  // AC-013
  it('test_when_system_readme_scanned_then_no_inline_import_examples_remain', () => {
    const path = join(REPO_ROOT, 'docs/system/README.md');
    assert.ok(existsSync(path), 'docs/system/README.md must exist before its content can be checked');
    const text = readFileSync(path, 'utf8');
    assert.ok(text.length > 0, 'README must be non-empty');

    // Scoped like AC-012: the surviving inline example is `materialize`, a WRITE
    // with no subcommand yet. What the README must no longer do is present the
    // inline form as THE interface for queries a subcommand covers.
    const offenders = offendingLines(text, INLINE_IMPORT)
      .filter((hit) => !hit.line.includes('materialize.mjs'))
      .map((hit) => `README.md:${hit.n}`);
    assert.deepEqual(
      offenders,
      [],
      'the README taught the inline-import form as the corpus interface; every query a subcommand covers must now cite the command',
    );
    assert.match(
      text,
      /cli\.mjs/,
      'the README must cite the dispatcher it replaced those examples with, or the guidance is merely deleted',
    );
    assert.match(
      text,
      /finish-the-dispatcher-sweep/,
      'the surviving inline example must say why it survives, or it reads as an oversight and gets copied again',
    );
  });

  // AC-019 (dispatcher sweep)
  //
  // The second place an inline example must NOT be rewritten, and the one the
  // AC-013 scan above cannot defend on its own: that scan proves the README stopped
  // teaching the inline form, and it filters `materialize.mjs` out of its offender
  // list — but a filter is silent about deletion. A sweep that removed the example
  // outright would leave AC-013 green and leave the corpus with no documented way
  // to add an element. The reason clause is load-bearing too: without "it writes",
  // the survivor reads as an oversight someone tidies away next pass.
  it('test_when_system_readme_scanned_then_materialize_example_and_its_reason_survive', () => {
    const path = join(REPO_ROOT, 'docs/system/README.md');
    assert.ok(existsSync(path), 'docs/system/README.md must exist before its content can be checked');
    const text = readFileSync(path, 'utf8');
    assert.ok(text.length > 0, 'README must be non-empty');

    assert.match(
      text,
      /workspace\/materialize\.mjs/,
      'the materialize invocation is the only documented way to add an element; deleting it strands the corpus',
    );
    assert.match(
      text,
      /`materialize` has no subcommand/,
      'the survivor must name itself as the exception, or the next sweep reads it as a missed call site',
    );
    assert.match(
      text,
      /it writes/,
      'the reason is what scopes the exception — this dispatcher exposes reads, so the write stays inline',
    );
  });

  // AC-018 (dispatcher sweep)
  //
  // The one place in the repo where an inline import must NOT be rewritten. This
  // skill's job is to detect the pattern, so its prose quotes the pattern — line
  // 14 cites the v0.8.1 marker-import bug it was built to catch, and line 60
  // defines "runtime invocation" by example. A sweep that rewrote them would
  // delete the detector's description of what it detects, and the AC-012 scan
  // above cannot tell the difference on its own: it ignores them only because
  // neither line names a covered module, which is a property of the prose rather
  // than a decision anyone recorded.
  it('test_when_detector_skill_scanned_then_its_two_pattern_quotes_survive', () => {
    const path = join(SKILLS_DIR, 'spec-shippability-review', 'SKILL.md');
    assert.ok(existsSync(path), 'spec-shippability-review/SKILL.md must exist before its content can be checked');
    const text = readFileSync(path, 'utf8');
    assert.ok(text.length > 0, 'the detector SKILL.md must be non-empty');

    const quotes = offendingLines(text, INLINE_IMPORT);
    assert.equal(
      quotes.length,
      2,
      `the detector must keep exactly the two prose quotes of the pattern it detects; found ${quotes.length} at lines ${quotes.map((q) => q.n).join(', ') || '(none)'}`,
    );
    assert.match(text, /marker-import/, 'line 14 cites the v0.8.1 bug by name — that citation is the reason the quote is there');
    assert.match(text, /Runtime invocation/, 'line 60 defines runtime invocation by example — the example IS the definition');
  });
});

describe('code-browser is reachable, not merely present', () => {
  // AC-014
  //
  // The oracle here is deliberately narrow. Counting every file that MENTIONS
  // code-browser reports 4 today — but two of those are its own SKILL.md and the
  // annex reference table, neither of which routes anyone anywhere, and the
  // governance mandate in CLAUDE.md XI.5 has been in force the whole time the
  // skill went unused. What decides whether code-browser is ever reached is the
  // number of EXECUTABLE SOPs that send a navigation question to it, and today
  // that is exactly one: scout.
  it('test_when_navigation_routing_checked_then_code_browser_named_before_grep', () => {
    const ownSkill = join(SKILLS_DIR, 'code-browser', 'SKILL.md');
    const routing = shippedSkillFiles()
      .filter((path) => path !== ownSkill)
      .filter((path) => readFileSync(path, 'utf8').includes('code-browser'));
    const names = routing.map((p) => p.replace(REPO_ROOT + '/', ''));

    assert.ok(
      names.includes('.claude/skills/scout/SKILL.md'),
      'scout must keep routing to code-browser — this half is a regression guard on existing behavior',
    );
    assert.ok(
      routing.length >= 2,
      `code-browser ships a working CLI and a constitutional first-attempt mandate, yet only ${routing.length} executable SOP routes to it, which is why it is never reached. At least one more SOP must name it. Current: ${names.join(', ') || '(none)'}`,
    );
  });
});

describe('consumer installs receive the dispatchers', () => {
  // AC-015
  it('test_when_manifest_checked_then_all_five_new_files_present', () => {
    const manifestPath = join(REPO_ROOT, 'obj/template/.claude/manifest.json');
    assert.ok(existsSync(manifestPath), 'the built manifest must exist — run npm run build');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.ok(
      manifest.files && Object.keys(manifest.files).length > 0,
      'manifest.files must be non-empty before membership can be asserted',
    );

    // AC-020 (dispatcher sweep) widens this from "the dispatchers" to "every file
    // a rewritten SOP now names". A consumer that received the dispatcher but not
    // the Pattern B module it delegates to is in exactly the state the marker-import
    // bug produced: a procedure citing a path that is not there.
    const required = [
      ARGV_LIB,
      ...Object.values(DISPATCHERS),
      ...Object.keys(PATTERN_B).map(patternBPath),
    ];
    const missing = required.filter((rel) => !manifest.files[rel]);
    assert.deepEqual(
      missing,
      [],
      'a SOP that cites a command the consumer never received is worse than the inline import it replaced',
    );
    for (const rel of required) {
      assert.match(
        String(manifest.files[rel].sha256 ?? ''),
        /^[0-9a-f]{64}$/,
        `${rel} must carry a sha256 so Article XII drift detection covers it`,
      );
    }
  });
});
