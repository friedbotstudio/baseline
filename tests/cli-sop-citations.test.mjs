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
import { DISPATCHERS, ARGV_LIB } from './helpers/cli-runner.mjs';

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
  // AC-012
  //
  // Scoped to call sites a dispatcher actually covers. The full sweep is 31 sites
  // across 14 target skill directories; these four dispatchers reach 12, and the
  // rest need ~7 more subcommands and ~8 dispatchers that do not exist yet
  // (backlog `finish-the-dispatcher-sweep`). Asserting the universal form here
  // would hold this change hostage to roughly triple its approved scope, and
  // quietly deleting the AC would lose the record that the gap is known.
  const COVERED_MODULES = [
    'workspace/flags.mjs',
    'system-reconcile/reconcile-report.mjs',
    'memory-flush/stale-elements.mjs',
    'memory-flush/route.mjs',
    'memory-flush/ledger.mjs',
    'memory-index/constraints.mjs',
    'memory-index/resolve.mjs',
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

    const required = [ARGV_LIB, ...Object.values(DISPATCHERS)];
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
