// Ticket E — documentation routing gate. Covers AC-015..AC-018 of
// docs/specs/living-system-model-abcd.md (§Behavior #5).
//
// Provenance worth keeping: this suite exists because /document — Phase 10 of the
// very workflow that ships it — routed a rewritten public-site paragraph to the
// `documentation` style guide instead of `technical-writer`, and skipped the
// two-register rule that CLAUDE.md XI.1 and backlog 7b3e require for public pages.
// The routing rule was correct and written down. It was written down in PROSE, in a
// SKILL.md, which is what a model under load skips.
//
// The third test replays that exact miss. If it ever passes against a diff that
// changed a public page with only a `documentation` receipt on disk, the gate has
// stopped doing the one job it was built for.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { tryImport } from './helpers/memory-fixtures.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = '.claude/skills/document/document-gate.mjs';
const PROSE_SKILL = join(REPO_ROOT, '.claude/skills/prose/SKILL.md');

// Mirrors the shape ticket E adds to project.json → document.surfaces.
const SURFACES = [
  { match: ['site-src/**'], kind: 'public-page', requires: ['technical-writer', 'copywriting'], reader_target: 11 },
  { match: ['docs/**/*.md'], kind: 'doc-page', requires: ['technical-writer'], reader_target: 11 },
  { match: ['**/README.md'], kind: 'reference-section', requires: ['prose'], reader_target: 11 },
];

function makeProject({ receipts = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'docgate-'));
  mkdirSync(join(root, '.claude/state/document'), { recursive: true });
  writeFileSync(
    join(root, '.claude/project.json'),
    JSON.stringify({ document: { surfaces: SURFACES } }, null, 2),
  );
  writeFileSync(
    join(root, '.claude/state/document/demo.json'),
    JSON.stringify({ slug: 'demo', receipts }, null, 2),
  );
  return root;
}

function runGate(root, changedPaths) {
  return spawnSync('node', [join(REPO_ROOT, GATE), '--slug', 'demo', '--paths', changedPaths.join(',')], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
}

describe('document routing gate (ticket E)', () => {
  it('test_when_public_page_changed_then_requires_technical_writer_and_copywriting', async () => {
    const mod = await tryImport(GATE);
    assert.ok(mod, `${GATE} must exist`);

    const required = mod.requiredDelegates({ changedPaths: ['site-src/memory.njk'], surfaces: SURFACES });
    assert.equal(required.length, 1, 'one surface matched');
    assert.deepEqual(
      [...required[0].requires].sort(),
      ['copywriting', 'technical-writer'],
      'a public page owes BOTH registers: mechanism from technical-writer, feature value from copywriting (AC-017)',
    );
  });

  it('test_when_surface_matches_config_then_delegates_come_from_config_not_defaults', async () => {
    const mod = await tryImport(GATE);
    assert.ok(mod, `${GATE} must exist`);

    // Same path, different config → different obligation. Proves routing reads the
    // config rather than re-deciding per run (AC-015).
    const custom = [{ match: ['site-src/**'], kind: 'public-page', requires: ['prose'], reader_target: 9 }];
    const required = mod.requiredDelegates({ changedPaths: ['site-src/memory.njk'], surfaces: custom });
    assert.deepEqual(required[0].requires, ['prose'], 'the config decides, not a hardcoded default');
    assert.equal(required[0].reader_target, 9, 'the reader-level target travels with the surface');
  });

  it('test_when_required_delegate_has_no_receipt_then_gate_exits_1_naming_surface_and_delegate', () => {
    // THE REPLAY. site-src/memory.njk changed; only a `documentation` receipt on
    // disk — exactly the state this workflow's first /document pass left behind.
    const root = makeProject({
      receipts: [{ surface: 'site-src/memory.njk', delegate: 'documentation' }],
    });
    try {
      const res = runGate(root, ['site-src/memory.njk']);
      assert.equal(res.status, 1, `gate must FAIL when a required delegate left no receipt (AC-016)\n${res.stdout}${res.stderr}`);
      const out = `${res.stdout}${res.stderr}`;
      assert.match(out, /site-src\/memory\.njk/, 'the failure names the surface');
      assert.match(out, /technical-writer/, 'the failure names the missing mechanism delegate');
      assert.match(out, /copywriting/, 'the failure names the missing value-register delegate');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_every_required_delegate_has_a_receipt_then_gate_exits_0', () => {
    const root = makeProject({
      receipts: [
        { surface: 'site-src/memory.njk', delegate: 'technical-writer' },
        { surface: 'site-src/memory.njk', delegate: 'copywriting' },
      ],
    });
    try {
      const res = runGate(root, ['site-src/memory.njk']);
      assert.equal(res.status, 0, `gate passes once both registers are satisfied\n${res.stdout}${res.stderr}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_no_documentation_surface_in_diff_then_gate_exits_0', () => {
    const root = makeProject();
    try {
      const res = runGate(root, ['.claude/hooks/lib/memory_stop.mjs', 'tests/foo.test.mjs']);
      assert.equal(res.status, 0, 'a diff with no documentation surface owes nothing');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_path_is_a_workflow_artifact_or_data_file_then_no_delegate_is_required', async () => {
    // Found by running the gate for real: `docs/**/*.md` swept in the workflow's own
    // spec, and `site-src/**` swept in a JSON data file. A spec demanding
    // technical-writer would be a permanent false positive on every future workflow,
    // and a false obligation trains people to override the gate.
    const mod = await tryImport(GATE);
    assert.ok(mod, `${GATE} must exist`);

    const live = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/project.json'), 'utf8'));
    const surfaces = live.document.surfaces;

    const exempt = [
      'docs/specs/living-system-model-abcd.md',
      'docs/intake/foo.md',
      'docs/scout/foo.md',
      'docs/security/foo-2026-01-01.md',
      'docs/archive/2026-08-04/foo/spec.md',
      'site-src/_data/memorynotes.json',
      'docs/roadmap-execution-plan.md',
    ];
    assert.deepEqual(
      mod.requiredDelegates({ changedPaths: exempt, surfaces }),
      [],
      'workflow artifacts and data files are not documentation surfaces and owe no register',
    );

    // ...while the genuine surfaces still are.
    const real = mod.requiredDelegates({ changedPaths: ['site-src/memory.njk', '.claude/memory/README.md'], surfaces });
    assert.equal(real.length, 2, 'real prose surfaces still carry obligations');
  });

  it('test_when_paths_flag_omitted_then_gate_derives_them_from_git_without_crashing', () => {
    // Every other test passes --paths, so the CLI's DEFAULT branch was unexercised
    // and shipped a `require` in ESM scope — six green tests and a ReferenceError on
    // the first real invocation. A gate that cannot run is worse than no gate,
    // because the phase reports it ran.
    const root = makeProject();
    spawnSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
    const res = spawnSync('node', [join(REPO_ROOT, GATE), '--slug', 'demo'], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    });
    try {
      assert.doesNotMatch(
        `${res.stdout}${res.stderr}`,
        /ReferenceError|is not defined/,
        'the git-derived path must not throw',
      );
      assert.ok([0, 1].includes(res.status), `gate exits with a verdict, not a crash (got ${res.status})`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_slug_escapes_state_dir_then_gate_rejects_before_reading_any_path', () => {
    // Found by the ticket-E security pass: `--slug ../../../outside/evil` pointed the
    // receipt read outside .claude/state/document/ and a foreign JSON satisfied the
    // gate — exit 0, "CLEAN". A gate that can be argued into passing is not a gate.
    // REJECT, never repair (CWE-22); normalizing would mask the traversal.
    const root = makeProject();
    const outside = join(root, 'outside');
    mkdirSync(outside, { recursive: true });
    writeFileSync(
      join(outside, 'evil.json'),
      JSON.stringify({ slug: 'pwned', receipts: [{ surface: 'site-src/x.njk', delegate: 'technical-writer' }, { surface: 'site-src/x.njk', delegate: 'copywriting' }] }),
    );
    try {
      const res = spawnSync(
        'node',
        [join(REPO_ROOT, GATE), '--slug', '../../../outside/evil', '--paths', 'site-src/x.njk'],
        { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } },
      );
      assert.equal(res.status, 1, 'a traversing slug is rejected, never satisfied');
      assert.doesNotMatch(`${res.stdout}`, /CLEAN/, 'a foreign receipt file must never report CLEAN');
      assert.match(`${res.stderr}`, /slug/i, 'the rejection names the slug as the cause');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── Hardening pass. Every one of these was found by PROBING the gate, not by
  // reading it; three are silent passes, which is the failure mode a gate cannot
  // have. Inspection had already cleared this file three times.

  it('test_when_paths_flag_is_present_but_empty_then_gate_rejects_instead_of_passing', () => {
    // `--paths "$CHANGED"` with an empty shell variable reported CLEAN and exited 0.
    // An explicitly empty path list is a caller bug, not evidence of a clean tree.
    const root = makeProject();
    try {
      const res = spawnSync('node', [join(REPO_ROOT, GATE), '--slug', 'demo', '--paths', ''], {
        encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      });
      assert.equal(res.status, 1, 'an empty --paths must not be read as "nothing changed"');
      assert.doesNotMatch(res.stdout, /CLEAN/, 'never report CLEAN for an empty explicit path list');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_receipt_file_is_malformed_then_gate_blocks_rather_than_crashing', () => {
    // `receipts: "nope"` threw an uncaught TypeError. Fail-closed by accident is not
    // fail-closed by design: a malformed state file proves nothing, so it must BLOCK
    // with a readable reason.
    const root = makeProject();
    writeFileSync(join(root, '.claude/state/document/demo.json'), JSON.stringify({ receipts: 'nope' }));
    try {
      const res = spawnSync('node', [join(REPO_ROOT, GATE), '--slug', 'demo', '--paths', 'site-src/x.njk'], {
        encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      });
      assert.equal(res.status, 1, 'a malformed receipt file blocks');
      assert.doesNotMatch(`${res.stdout}${res.stderr}`, /TypeError|is not a function/, 'blocks with a reason, not a stack trace');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_a_surface_declares_no_requires_then_config_is_rejected', async () => {
    // First match wins, so a surface with no `requires` silently shadowed a later
    // surface that had real obligations — and the gate reported CLEAN.
    const mod = await tryImport(GATE);
    assert.ok(mod, `${GATE} must exist`);
    assert.throws(
      () => mod.requiredDelegates({
        changedPaths: ['site-src/x.njk'],
        surfaces: [{ match: ['site-src/**'], kind: 'p' }, { match: ['site-src/**'], kind: 'p2', requires: ['prose'] }],
      }),
      /requires/i,
      'a surface with no requires is a config error, not an exemption — exempt via `exclude`',
    );
  });

  it('test_when_new_files_sit_in_an_untracked_directory_then_they_are_still_enumerated', () => {
    // `git status --porcelain` collapses an untracked directory to `?? docs/`, so a
    // brand-new documentation directory was invisible to every glob.
    const root = makeProject();
    spawnSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
    mkdirSync(join(root, 'site-src/newsection'), { recursive: true });
    writeFileSync(join(root, 'site-src/newsection/page.njk'), 'x');
    try {
      const res = spawnSync('node', [join(REPO_ROOT, GATE), '--slug', 'demo'], {
        encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      });
      assert.equal(res.status, 1, 'a new page inside a new directory still owes its delegates');
      assert.match(`${res.stdout}${res.stderr}`, /newsection\/page\.njk/, 'the individual file is enumerated, not the collapsed directory');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_a_path_contains_a_space_then_git_quoting_is_decoded_before_matching', () => {
    // git C-quotes such paths (`"site-src/a b.njk"`), and the raw quotes made every
    // glob miss — a silent pass on exactly the files a human is most likely to name
    // descriptively.
    const root = makeProject();
    spawnSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
    mkdirSync(join(root, 'site-src'), { recursive: true });
    writeFileSync(join(root, 'site-src/needs review.njk'), 'x');
    try {
      const res = spawnSync('node', [join(REPO_ROOT, GATE), '--slug', 'demo'], {
        encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      });
      assert.equal(res.status, 1, 'a quoted path still owes its delegates');
      assert.match(`${res.stdout}${res.stderr}`, /needs review\.njk/, 'the decoded path is reported, without git quoting');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_a_delegate_records_a_receipt_then_the_gate_can_verify_it', async () => {
    // The checker shipped without its producer: nothing wrote receipts and nothing
    // invoked the gate, so it was an orphan that could only ever BLOCK. The drift
    // check passed it because AC ids appear in test comments — literal-mention
    // resolution is not implementation verification.
    const mod = await tryImport('.claude/skills/document/receipts.mjs');
    assert.ok(mod, 'receipts.mjs must exist — a gate with no producer is decoration');

    const root = makeProject();
    try {
      const first = mod.recordReceipt({ slug: 'demo', surface: 'site-src/x.njk', delegate: 'technical-writer', rootDir: root });
      assert.equal(first.recorded, true, 'a new receipt is written');
      const dupe = mod.recordReceipt({ slug: 'demo', surface: 'site-src/x.njk', delegate: 'technical-writer', rootDir: root });
      assert.equal(dupe.recorded, false, 'recording the same run twice is a no-op, not a duplicate row');

      mod.recordReceipt({ slug: 'demo', surface: 'site-src/x.njk', delegate: 'copywriting', rootDir: root });
      const res = runGate(root, ['site-src/x.njk']);
      assert.equal(res.status, 0, `the gate reads what the producer wrote\n${res.stdout}${res.stderr}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_document_skill_read_then_it_invokes_the_gate_before_completing', () => {
    // Wiring assertion: the gate only enforces if the phase actually calls it.
    const text = readFileSync(join(REPO_ROOT, '.claude/skills/document/SKILL.md'), 'utf8');
    assert.match(text, /document-gate\.mjs/, 'document/SKILL.md must invoke the gate');
    assert.match(text, /receipts\.mjs/, 'document/SKILL.md must tell delegates to record receipts');
    assert.match(
      text,
      /[Dd]o not append .?"?document"?.? to .?completed.? while the gate exits 1/,
      'the phase must not mark itself complete over a blocking gate',
    );
  });

  it('test_when_prose_skill_read_then_reader_level_runs_between_conditional_and_humanizer', () => {
    // Ordering is load-bearing, not stylistic. technical-writer Step 4: simplifying
    // AFTER de-slopping reintroduces phrasing the de-slop pass already removed, so
    // it runs twice and the second run flattens the prose (AC-018).
    const text = readFileSync(PROSE_SKILL, 'utf8');
    const method = text.slice(text.indexOf('# Method'));

    const conditional = method.search(/Skill\(copywriting\)|conditional skill the caller named/i);
    const readerLevel = method.search(/Skill\(reader-level\)|reader-level/i);
    const humanizer = method.search(/Skill\(humanizer\)/);

    assert.ok(readerLevel > -1, 'prose must invoke reader-level — it currently never does');
    assert.ok(conditional > -1 && humanizer > -1, 'prose keeps its conditional and humanizer steps');
    assert.ok(
      conditional < readerLevel && readerLevel < humanizer,
      'order must be conditional -> reader-level -> humanizer; reader-level after humanizer flattens the prose',
    );
  });
});
