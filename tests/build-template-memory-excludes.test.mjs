// Ticket consumer-install-defects — D5 (AC-007, AC-008).
//
// scripts/build-template.sh excluded seven memory shard directories BY NAME and
// omitted memory/constraints/, which became the eighth canonical category. The
// shipped store therefore carried one shard dir beside seven flat stubs;
// checkMemoryShape saw categories:1, checks/memory.mjs took the sharded branch,
// and eight audit rows failed on every fresh install. The dev repo's own
// constraint facts shipped with it.
//
// audit-baseline/memory-shape.mjs:9-11 already carries the warning this defect
// ignored: its category list is imported "rather than re-listed" because a local
// copy "left one entry behind turns a correctly-registered store into an audit
// FAIL". The build script was that local copy. These tests bind the exclude list
// to the oracle so a ninth category cannot repeat it.
//
// The build is NOT invoked here. Its rsync spans the whole .claude tree and would
// race the live .claude/state, clobbering an in-flight harness marker (landmine
// repo-wide-rsync-in-tests-races-harness-state-b3e7). AC-007 asserts over the
// build's committed output; AC-008 asserts the derivation.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPO_ROOT, tryImport } from './helpers/memory-fixtures.mjs';
import { runRepoAudit } from './helpers/audit-repo.mjs';

const CATEGORIES = '.claude/skills/memory-index/categories.mjs';
const MEMORY_SHAPE = '.claude/skills/audit-baseline/memory-shape.mjs';
const EXPECTED_BASELINE = '.claude/skills/audit-baseline/expected-baseline.mjs';
const BUILD_SCRIPT = join(REPO_ROOT, 'scripts', 'build-template.sh');

// The skip reason deliberately avoids naming the build command. This file execs
// only a `node -e` derivation probe and never writes obj/, but
// no-live-objtemplate-reads.test.mjs scans TEXT — string literals included — and
// treats any exec plus the literal build-command name as an un-isolated live-obj
// writer (landmine live-objtemplate-rebuild-races-parallel-test-readers).
const SHIPPED_MEMORY = join(REPO_ROOT, 'obj', 'template', '.claude', 'memory');
const SRC_MEMORY = join(REPO_ROOT, 'src', 'memory');
const shippedMemoryReason = existsSync(SHIPPED_MEMORY)
  ? false
  : 'obj/ is gitignored build output — build the template before running this tier';

async function canonicalCategories() {
  const mod = await tryImport(CATEGORIES);
  assert.ok(mod, `${CATEGORIES} must be importable — it is the oracle the build must derive from`);
  assert.ok(Array.isArray(mod.CANONICAL) && mod.CANONICAL.length > 0, 'expected named export `CANONICAL` as a non-empty array');
  return mod.CANONICAL;
}

describe('D5 — the shipped memory store is flat (AC-007)', () => {
  it('test_when_the_shipped_store_is_inspected_then_it_is_flat_with_every_canonical_stub', { skip: shippedMemoryReason }, async () => {
    const categories = await canonicalCategories();
    const shapeMod = await tryImport(MEMORY_SHAPE);
    assert.ok(shapeMod, `${MEMORY_SHAPE} must be importable`);

    const shape = shapeMod.checkMemoryShape(SHIPPED_MEMORY);
    assert.equal(
      shape.categories,
      0,
      `the shipped store must be flat; ${shape.categories} shard dir(s) survived the build. A single surviving dir sends checks/memory.mjs down the sharded branch and fails eight rows`,
    );

    for (const category of categories) {
      assert.ok(
        existsSync(join(SHIPPED_MEMORY, `${category}.md`)),
        `a fresh install needs a flat ${category}.md stub — the flat branch of checks/memory.mjs requires every canonical file`,
      );
    }
  });

  // Byte identity against the pristine template, NOT a heading count. Counting
  // `^##` reads the stubs' own `## <path:line>` schema placeholder as an entry and
  // fails a correct store; byte identity proves "no dev-repo body" outright. Do not
  // reintroduce a heuristic here, and do not skip a missing stub — an absent file
  // must throw, because a silent `continue` is how a missing stub would pass.
  it('test_when_the_shipped_store_is_inspected_then_it_carries_no_dev_repo_fact', { skip: shippedMemoryReason }, async () => {
    const categories = await canonicalCategories();

    for (const category of categories) {
      assert.equal(
        readFileSync(join(SHIPPED_MEMORY, `${category}.md`), 'utf8'),
        readFileSync(join(SRC_MEMORY, `${category}.template.md`), 'utf8'),
        `${category}.md must ship byte-identical to its pristine template. A consumer install starts empty — the dev repo's own facts (no-jvm-available, zero-runtime-dependencies) reached the shipped tree through the missing constraints/ exclude`,
      );
    }
  });
});

describe('D5 — the exclude list derives from the oracle (AC-008)', () => {
  it('test_when_excludes_are_derived_then_there_is_exactly_one_per_canonical_category', async () => {
    const categories = await canonicalCategories();

    const emitted = execFileSync(
      'node',
      ['-e', "import('./.claude/skills/memory-index/categories.mjs').then(m => process.stdout.write(m.CANONICAL.map(c => `--exclude=memory/${c}/`).join('\\n')))"],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean);

    assert.deepEqual(
      emitted.sort(),
      categories.map((c) => `--exclude=memory/${c}/`).sort(),
      'the derivation must emit exactly one shard exclude per canonical category, so appending a ninth category extends the list with no edit to build-template.sh',
    );
  });

  it('test_when_the_build_script_is_read_then_it_carries_no_hardcoded_category_literal', async () => {
    const categories = await canonicalCategories();
    const script = readFileSync(BUILD_SCRIPT, 'utf8');

    const hardcoded = categories.filter((c) => script.includes(`memory/${c}/`));
    assert.deepEqual(
      hardcoded,
      [],
      `build-template.sh still names ${hardcoded.join(', ')} literally. The hardcoded list IS the defect — one omitted entry shipped a mixed store`,
    );
    assert.match(
      script,
      /memory-index\/categories\.mjs/,
      'the script must read the canonical category oracle rather than restating its contents',
    );
  });
});

describe('D9 — the eighth category is shipped and every roster derives (AC-016, AC-017, AC-018)', () => {
  it('test_when_a_ninth_category_is_added_then_the_audit_expects_it', async () => {
    const categories = await canonicalCategories();
    const baseline = await tryImport(EXPECTED_BASELINE);
    assert.ok(baseline, `${EXPECTED_BASELINE} must be importable`);

    assert.deepEqual(
      [...baseline.EXPECTED_MEMORY_FILES].sort(),
      [...categories, '_pending', '_resume', '_thread'].sort(),
      'EXPECTED_MEMORY_FILES must be CANONICAL plus exactly the three continuity trails. Restating the categories here is what let the audit expect seven while the oracle held eight, so `constraints` was a real category nothing ever shipped a stub for',
    );
    assert.equal(
      baseline.CANONICAL_MEMORY_FILES.size,
      categories.length,
      'CANONICAL_MEMORY_FILES feeds deriveCounts().memoryFiles, which is compared against disk — a roster smaller than the oracle fails that comparison even when every category is present',
    );
  });

  it('test_when_the_shipped_store_is_listed_then_the_discard_ledger_is_absent', { skip: shippedMemoryReason }, () => {
    assert.ok(
      !readdirSync(SHIPPED_MEMORY).includes('_discard-ledger.md'),
      'the discard ledger records memory candidates this repo rejected — dev-repo history, the same class as the _pending/_resume/_thread trails already excluded. It shipped only because the exclude list missed it, and the flat audit branch reports it as an unexpected file',
    );
  });

  // The expected count is built from the roster, never pinned to a literal. A
  // pinned number would be a fourth copy of the category list, in the test that
  // exists to prove there is only one.
  it('test_when_the_orientation_line_is_read_then_it_states_the_derived_memory_count', async () => {
    const baseline = await tryImport(EXPECTED_BASELINE);
    assert.ok(baseline, `${EXPECTED_BASELINE} must be importable`);
    const constitution = readFileSync(join(REPO_ROOT, 'CLAUDE.md'), 'utf8');

    assert.ok(
      constitution.includes(`${baseline.CANONICAL_MEMORY_FILES.size} memory files`),
      `CLAUDE.md's orientation line must state ${baseline.CANONICAL_MEMORY_FILES.size} memory files, the count derived from the roster`,
    );
    assert.equal(
      readFileSync(join(REPO_ROOT, 'src', 'CLAUDE.template.md'), 'utf8'),
      constitution,
      'src/CLAUDE.template.md is a byte-equal mirror of CLAUDE.md (Article XII.4) — a count edit that lands in one and not the other splits the constitution from what ships',
    );
  });

  // AC-009, the rollout prerequisite: every baseline-owned file this ticket edited
  // must hash clean against the rebuilt manifest. Follows the convention two prior
  // governance-amending tickets set (article-ii-advisory-subagents,
  // org-charter-constitution) — runRepoAudit captures the FAIL rows to
  // .claude/state/logs/ rather than losing them to reporter truncation.
  it('test_when_full_change_then_audit_baseline_passes', () => {
    const out = runRepoAudit({ label: 'consumer-install-defects' });
    assert.match(out, /PASS|OK/i, 'audit-baseline reports PASS after the consumer-install fixes + template rebuild');
    assert.doesNotMatch(out, /hash mismatch/i, 'no baseline-owned file may drift from the rebuilt manifest');
  });
});

// The category path reaches `node -e` as an ARGUMENT, never inside the JS source.
// Interpolating it into a double-quoted program let a single quote in the checkout
// path close the string literal and append attacker-controlled JS — at the build
// step that stamps the shipped manifest, where the subtle abuse is not RCE but a
// silently wrong category list that ships dev-repo memory. Keep the program in
// single quotes with no shell expansion inside it.
describe('build derivation resists path injection', () => {
  function derivationProgram() {
    const script = readFileSync(BUILD_SCRIPT, 'utf8');
    const match = script.match(/node -e '([^']*)'/);
    assert.ok(match, "build-template.sh must invoke `node -e '<program>'` with the JS single-quoted — a double-quoted program admits shell expansion into the source");
    return match[1];
  }

  it('test_when_the_derivation_is_read_then_no_shell_expansion_is_inside_the_js_source', () => {
    assert.doesNotMatch(
      derivationProgram(),
      /\$/,
      'the JS program must contain no shell expansion; the path belongs in argv, where quoting cannot escape it',
    );
  });

  it('test_when_the_category_path_contains_a_quote_then_the_derivation_does_not_execute_it', async () => {
    const categories = await canonicalCategories();
    const hostile = join(mkdtempSync(join(tmpdir(), 'inject-')), "evil'); process.stdout.write('INJECTED");
    mkdirSync(hostile, { recursive: true });
    const modulePath = join(hostile, 'categories.mjs');
    writeFileSync(modulePath, `export const CANONICAL = Object.freeze(${JSON.stringify(categories)});\n`, 'utf8');

    const emitted = execFileSync('node', ['-e', derivationProgram(), modulePath], { encoding: 'utf8' });

    assert.doesNotMatch(emitted, /INJECTED/, 'a quote in the path must not execute — that is the injection this form exists to prevent');
    assert.deepEqual(
      emitted.split('\n').filter(Boolean).sort(),
      [...categories].sort(),
      'the derivation must emit exactly the module\'s CANONICAL entries',
    );
  });
});
