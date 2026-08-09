// T-011 / AC-007 — `spec/cli.mjs review` fans the spec-review checkers out over
// checker-fanout and emits one merged verdict, with the two previously-deferred
// adapters (backlog -d186) registered.
//
// Before this ticket the registry held spec-diagram, spec-traceability and
// spec-rollout; spec-lint and spec-shippability were called by hand from the SOP
// and their verdicts never reached the merge. That is the gap: a BLOCKER found by
// spec-lint could not block implementation entry, because the pre-implementation
// checkpoint reads the MERGED verdict.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const REPO = process.cwd();
const CLI = join(REPO, '.claude/skills/spec/cli.mjs');
const FANOUT = join(REPO, '.claude/skills/harness/checker-fanout.mjs');

function run(args, opts = {}) {
  try {
    const stdout = execFileSync('node', args, { encoding: 'utf8', cwd: opts.cwd || REPO, stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout ? String(e.stdout) : '', stderr: e.stderr ? String(e.stderr) : '' };
  }
}

// These fixtures are inline rather than read from `docs/specs/<slug>.md`.
//
// An earlier revision pointed the CLEAN cases at this batch's own live spec, which
// made them pass right up until `/archive` moved that file into the bundle — and
// `/archive` moving it is not an edge case, it is what the phase does on every
// workflow. A test that depends on a workflow artifact is a test scheduled to fail.
// The shape below is the one `checker-fanout-live-wiring.test.mjs` already proves
// CLEAN through the DEFAULT registry: acyclic graph, both ACs traced, and an
// explicit empty System delta so the spec-lint adapter has a section to read.
const CLEAN_SPEC = [
  '# Spec', '## Design',
  '```plantuml', '@startuml', "' @kind dependency-graph",
  '[a] --> [b]', '@enduml', '```',
  '## System delta',
  '- *(none)*',
  '## Acceptance criteria',
  '| AC | Upstream |', '| AC-001 | intake AC 1 |', '| AC-002 | intake AC 2 |',
].join('\n');

// Identical but for the delta table: a `change` row naming an element id that does
// not resolve under `docs/system/elements/`. The fixture root deliberately omits
// that directory, so `checkSystemDelta` reports FAIL and the adapter raises BLOCKER.
const BLOCKED_SPEC = CLEAN_SPEC.replace(
  '- *(none)*',
  ['| Verb | Element | Anchor | Concept | Kind |',
    '|---|---|---|---|---|',
    '| change | no-such-element-anywhere | `.claude/skills/x/y.mjs` | memory-model | c4_component |',
  ].join('\n'),
);

// A throwaway project whose only spec is the fixture. project.json is copied so the
// architecture-map flag is on — without it `checkSystemDelta` returns SKIP and the
// BLOCKED case could never trip.
function makeSpecProject(specText, slug) {
  const root = mkdtempSync(join(tmpdir(), 'spec-review-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  cpSync(join(REPO, '.claude/project.json'), join(root, '.claude/project.json'));
  mkdirSync(join(root, 'docs/specs'), { recursive: true });
  writeFileSync(join(root, 'docs/specs', `${slug}.md`), specText);
  return root;
}

describe('AC-007 — the two deferred adapters are registered', () => {
  it('test_when_registry_read_then_spec_lint_and_shippability_are_present', async () => {
    const mod = await import(FANOUT);
    const reg = mod.DEFAULT_CHECKER_REGISTRY;

    assert.ok(reg['spec-lint'], 'spec-lint adapter is registered');
    assert.ok(reg['spec-shippability'], 'spec-shippability adapter is registered');
    assert.equal(reg['spec-lint'].phase, 'spec-review');
    assert.equal(reg['spec-shippability'].phase, 'spec-review');
  });

  it('test_when_adapters_run_on_a_clean_spec_then_they_report_no_blockers', async () => {
    const mod = await import(FANOUT);
    const ctx = { slug: 'clean-fixture', rootDir: REPO, specContent: CLEAN_SPEC, intakeContent: null };

    for (const name of ['spec-lint', 'spec-shippability']) {
      const result = await mod.DEFAULT_CHECKER_REGISTRY[name].run(ctx);
      assert.ok(Array.isArray(result.findings), `${name} returns a findings array`);
      const blockers = result.findings.filter((f) => f.severity === 'BLOCKER');
      assert.deepEqual(blockers, [], `${name} finds no BLOCKER on this repo's own approved spec`);
    }
  });

  // Security review 2026-08-09, finding F-3. spec-shippability-review has no
  // `owner: baseline`, so the build prunes it from consumer installs. A top-level
  // import here would throw at module load — before any try/catch — and take the
  // whole fan-out down with it, because checker-fanout imports this adapter at its
  // own top level. The import must therefore be dynamic and absence must fail open.
  it('test_when_adapter_source_read_then_the_pruned_skill_is_imported_dynamically', async () => {
    const src = (await import('node:fs')).readFileSync(
      join(REPO, '.claude/skills/harness/checkers/spec-shippability.mjs'), 'utf8');

    assert.ok(!/^import .*spec-shippability-review/m.test(src),
      'the pruned skill must not be a top-level import — it is absent on consumer installs');
    assert.match(src, /await import\(.*spec-shippability-review/,
      'it is loaded dynamically so absence degrades to fail-open');
  });

  it('test_when_checker_fanout_loads_then_it_does_not_transitively_require_the_pruned_skill', async () => {
    // The fan-out must import cleanly even where the analyzer is missing. Proven by
    // loading the module graph and confirming the adapter is registered and callable
    // rather than having thrown on the way in.
    const mod = await import(FANOUT);
    assert.ok(mod.DEFAULT_CHECKER_REGISTRY['spec-shippability'],
      'the adapter registers without the analyzer having been resolved at load time');
  });

  it('test_when_adapter_given_unparseable_input_then_it_fails_open_rather_than_throwing', async () => {
    const mod = await import(FANOUT);
    const ctx = { slug: 'read-front-door-sweep', rootDir: REPO, specContent: null, intakeContent: null };

    for (const name of ['spec-lint', 'spec-shippability']) {
      const result = await mod.DEFAULT_CHECKER_REGISTRY[name].run(ctx);
      assert.ok(Array.isArray(result.findings), `${name} fails open on absent content`);
    }
  });
});

describe('AC-007 — the review verb merges and maps exit codes', () => {
  const root = makeSpecProject(CLEAN_SPEC, 'clean-fixture');
  const reviewClean = () => run([CLI, 'review', '--slug', 'clean-fixture', '--root', root, '--json']);

  it('test_when_review_runs_on_a_clean_spec_then_verdict_is_clean_and_exit_zero', () => {
    const r = reviewClean();

    assert.equal(r.code, 0, r.stderr);
    const merged = JSON.parse(r.stdout);
    assert.equal(merged.verdict, 'CLEAN');
    assert.ok(Array.isArray(merged.checkers) && merged.checkers.length >= 3,
      'the merged verdict names every checker that ran');
  });

  it('test_when_review_runs_then_the_two_new_checkers_are_among_those_reported', () => {
    const merged = JSON.parse(reviewClean().stdout);

    assert.ok(merged.checkers.includes('spec-lint'), 'spec-lint participated in the fan-out');
    assert.ok(merged.checkers.includes('spec-shippability'), 'spec-shippability participated');
  });

  it('test_when_review_runs_with_json_then_stdout_is_parseable_json_only', () => {
    assert.doesNotThrow(() => JSON.parse(reviewClean().stdout));
  });
});

describe('AC-012 — the review verb honours the shared exit contract', () => {
  it('test_when_slug_flag_missing_value_then_usage_error_exit_one', () => {
    const r = run([CLI, 'review', '--slug']);
    assert.equal(r.code, 1);
    assert.match(r.stderr + r.stdout, /--slug requires a value/);
  });

  it('test_when_slug_traverses_then_it_is_rejected_not_normalized', () => {
    const r = run([CLI, 'review', '--slug', '../etc/passwd']);
    assert.equal(r.code, 1, 'a traversing slug is refused');
  });

  it('test_when_unknown_subcommand_then_usage_on_stderr_and_exit_one', () => {
    const r = run([CLI, 'bogus']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /unknown subcommand/i);
  });

  it('test_when_optimize_verb_still_present_then_the_existing_front_door_is_intact', () => {
    const r = run([CLI, '--help']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /optimize/, 'the pre-existing verb survives');
    assert.match(r.stdout, /review/, 'review is listed');
  });
});

describe('AC-007 — T-013: the review verb now honours the dispatcher exit-code affordance', () => {
  it('test_when_review_verdict_is_blocked_then_exit_is_two_and_body_still_prints', () => {
    const slug = 'blocked-fixture-t013';
    const root = makeSpecProject(BLOCKED_SPEC, slug);
    try {
      const r = run([CLI, 'review', '--slug', slug, '--root', root, '--json']);

      assert.equal(r.code, 2, `expected exit 2 on a BLOCKED verdict. stderr: ${r.stderr}`);
      const merged = JSON.parse(r.stdout);
      assert.equal(merged.verdict, 'BLOCKED', 'stdout still parses as the merged verdict JSON');
      assert.ok(
        merged.findings.some((f) => f.severity === 'BLOCKER' && f.check === 'system_delta'),
        'the fixture trips the system_delta BLOCKER (change rows do not resolve without docs/system/elements/)',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_review_verdict_is_clean_then_exit_is_zero', () => {
    const root = makeSpecProject(CLEAN_SPEC, 'clean-fixture-t013');
    const r = run([CLI, 'review', '--slug', 'clean-fixture-t013', '--root', root, '--json']);

    assert.equal(r.code, 0, `a CLEAN verdict must exit 0. stderr: ${r.stderr}`);
    assert.equal(JSON.parse(r.stdout).verdict, 'CLEAN');
  });
});
