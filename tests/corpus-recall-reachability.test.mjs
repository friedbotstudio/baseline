// Cycle 1 — corpus recall reachability (AC-001..AC-010).
//
// The corpus at docs/system/ is total and fresh, and two of the three ways it was
// meant to reach Claude are dead code: renderConceptMap has no caller, and the
// by_path corpus ascent never receives a specDir. A third path — the Bash leg's
// memory surfacing — reads a flat store shape this repo stopped using in July.
//
// These tests pin the reachability, and pin the two things that are easy to get
// subtly wrong: both surfacing blocks must be composed BEFORE any emitAllow (that
// call exits the process), and the @ref structural-kind rule must live in ONE
// module so the guard and the preflight cannot disagree again.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  REPO_ROOT,
  copyLiveCorpus,
  writeFlatCategory,
} from './helpers/memory-fixtures.mjs';
import { writeWorkspaceConcept, writeWorkspaceElement } from './helpers/workspace-fixtures.mjs';

const SESSION_START = '.claude/hooks/lib/memory_session_start.mjs';
const GOVERNED_MEMORY = '.claude/hooks/lib/governed-memory.mjs';
const WRITE_SET_PROFILE = '.claude/hooks/lib/write-set-profile.mjs';
const RESOLVE = '.claude/skills/memory-index/resolve.mjs';
const STALE_ELEMENTS = '.claude/skills/memory-flush/stale-elements.mjs';
const DIGEST = '.claude/skills/workspace/digest.mjs';

const LIFECYCLE_HOOK = join(REPO_ROOT, '.claude/hooks/process_lifecycle_guard.mjs');
const PRESENCE_GUARD = join(REPO_ROOT, '.claude/hooks/spec_diagram_presence_guard.mjs');
const LINT = join(REPO_ROOT, '.claude/skills/spec-lint/lint.mjs');

const CONCEPT_HEADING = '## Architecture map — concepts';
const ENVELOPE = 9500;

// ─── Foundation: module loading ───

// Node's ESM loader caches by URL, and several tests import the same module under
// different on-disk flag states. Cache-bust so the second import re-evaluates.
async function importFresh(relFromRepo) {
  const href = pathToFileURL(join(REPO_ROOT, relFromRepo)).href;
  return import(`${href}?t=${Date.now()}-${Math.random()}`);
}

// ─── Foundation: sandbox construction ───

// copyLiveCorpus gives a throwaway .claude/memory + docs/system. The flag readers
// go through project.json, which it does not copy, so every sandbox writes its own.
function sandbox({ archMap = true } = {}) {
  const { root, memDir, specDir } = copyLiveCorpus('recall-');
  writeProject(root, archMap);
  return { root, memDir, specDir };
}

function writeProject(root, archMap) {
  const path = join(root, '.claude', 'project.json');
  const live = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/project.json'), 'utf8'));
  live.memory = { ...(live.memory || {}) };
  live.memory.architecture_map = { ...(live.memory.architecture_map || {}), enabled: archMap };
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(live, null, 2)}\n`, 'utf8');
  return path;
}

function writeResume(memDir, marker) {
  writeFileSync(join(memDir, '_resume.md'), `---\nowners: [test]\n---\n\n${marker}\n`, 'utf8');
}

// ─── Foundation: subprocess drivers ───

function runHook(root, hookPath, payload) {
  const res = spawnSync('node', [hookPath], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function decisionOf(result) {
  try {
    return JSON.parse(result.stdout || '{}')?.hookSpecificOutput?.permissionDecision ?? 'allow';
  } catch {
    return 'allow';
  }
}

function runLint(root, slug) {
  const res = spawnSync('node', [LINT, slug], {
    encoding: 'utf8',
    cwd: root,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  });
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function presenceRowOf(lintStdout) {
  const row = lintStdout.split('\n').find((l) => l.startsWith('diagram_presence'));
  return row ?? '';
}

// ─── Foundation: spec fixtures for the @ref rule ───

// Only the parts both checkers read: a write_set line (drives the profile) and the
// plantuml fences. No structural C4 fence — the reference is what stands in for it.
function writeSpecFixture(root, slug, refToken) {
  const dir = join(root, 'docs', 'specs');
  mkdirSync(dir, { recursive: true });
  const reference = refToken ? ['```', refToken, '```', ''] : [];
  const body = [
    `# ${slug}`,
    '',
    '## Context',
    '',
    '**Write set**: `.claude/skills/foo/**`',
    '',
    '## Goal',
    '',
    'Pin the reference rule.',
    '',
    '## Design',
    '',
    ...reference,
    '```plantuml',
    '@startuml',
    'class Thing {',
    '  +id: string',
    '}',
    '@enduml',
    '```',
    '',
    '```plantuml',
    '@startuml',
    'participant A',
    'A -> A : ping',
    '@enduml',
    '```',
    '',
    '```plantuml',
    '@startuml',
    "' @kind dependency-graph",
    '[a] --> [b]',
    '@enduml',
    '```',
    '',
    '## Design calls',
    '',
    '*(none)*',
    '',
    '## Acceptance criteria',
    '',
    '| ID | Criterion | Kind | Upstream AC | Sequence |',
    '|---|---|---|---|---|',
    '| AC-001 | given a, when b, then c | behavior | upstream 1 | §Behavior #1 |',
    '',
    '## Test plan',
    '',
    '| Category | Scenario | Expected | Covers |',
    '|---|---|---|---|',
    '| Golden path | a | b | AC-001 |',
    '',
  ].join('\n');
  const path = join(dir, `${slug}.md`);
  writeFileSync(path, `${body}\n`, 'utf8');
  return path;
}

function guardOnSpec(root, specPath) {
  return runHook(root, PRESENCE_GUARD, {
    tool_name: 'Write',
    tool_input: { file_path: specPath, content: readFileSync(specPath, 'utf8') },
  });
}

// ─── Foundation: live-tree probes ───

function liveElementAnchors() {
  const dir = join(REPO_ROOT, 'docs/system/elements');
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .map((n) => readFileSync(join(dir, n), 'utf8'))
    .map((t) => /^anchor:\s*(.+)$/m.exec(t)?.[1]?.trim())
    .filter((a) => a && !a.includes('*'));
}

function liveConceptCount() {
  return readdirSync(join(REPO_ROOT, 'docs/system/concepts')).filter((n) => n.endsWith('.md')).length;
}

// ─── Foundation: the seed/template mirror's one sanctioned divergence ───

const RESERVED_HEADING = '## §16 — Project-specific configuration';

function reservedBounds(text) {
  const start = text.indexOf(RESERVED_HEADING);
  if (start < 0) return null;
  const next = text.indexOf('\n## §', start + RESERVED_HEADING.length);
  return { start, end: next < 0 ? text.length : next };
}

function withoutReservedSection(text) {
  const at = reservedBounds(text);
  return at ? text.slice(0, at.start) + text.slice(at.end) : text;
}

function reservedSectionOf(text) {
  const at = reservedBounds(text);
  return at ? text.slice(at.start, at.end) : '';
}

describe('AC-001 — the concept map reaches session start', () => {
  it('test_when_flag_on_and_corpus_populated_then_build_index_carries_concept_map', async () => {
    const mod = await importFresh(SESSION_START);
    const out = mod.buildIndex({
      memDir: join(REPO_ROOT, '.claude/memory'),
      projectRoot: REPO_ROOT,
      sessionSource: 'startup',
    });
    const context = JSON.parse(out).hookSpecificOutput.additionalContext;

    assert.ok(context.includes(CONCEPT_HEADING),
      'buildIndex must inject the concept map; renderConceptMap had no caller before this change');
    const rows = context.split('\n').filter((l) => /^- `[a-z0-9-]+` — .+ \(\d+ elements\)$/.test(l));
    assert.equal(rows.length, liveConceptCount(),
      'one row per concept in docs/system/concepts/');
  });

  it('test_when_concept_map_present_then_it_precedes_the_resume_snapshot', async () => {
    const { root, memDir } = sandbox();
    try {
      writeResume(memDir, 'RESUME_SENTINEL_LINE');
      const mod = await importFresh(SESSION_START);
      const context = JSON.parse(
        mod.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' }),
      ).hookSpecificOutput.additionalContext;

      const mapAt = context.indexOf(CONCEPT_HEADING);
      const resumeAt = context.indexOf('RESUME_SENTINEL_LINE');
      assert.ok(mapAt >= 0, 'concept map present');
      assert.ok(resumeAt >= 0, 'resume snapshot present');
      assert.ok(mapAt < resumeAt,
        'routing information is read before continuity, so the map precedes the snapshot');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('AC-002 — the layer stays inert for a project that has not opted in', () => {
  it('test_when_architecture_map_disabled_then_session_payload_is_byte_identical', async () => {
    const off = sandbox({ archMap: false });
    const noCorpus = sandbox({ archMap: true });
    try {
      writeResume(off.memDir, 'SENTINEL');
      writeResume(noCorpus.memDir, 'SENTINEL');
      rmSync(noCorpus.specDir, { recursive: true, force: true });

      const mod = await importFresh(SESSION_START);
      const render = (s) => JSON.parse(
        mod.buildIndex({ memDir: s.memDir, projectRoot: s.root, sessionSource: 'startup' }),
      ).hookSpecificOutput.additionalContext;

      const flagOff = render(off);
      assert.ok(!flagOff.includes(CONCEPT_HEADING), 'flag off injects no concept map');
      assert.equal(flagOff, render(noCorpus),
        'flag-off output is byte-identical to the same tree with no corpus at all');
    } finally {
      rmSync(off.root, { recursive: true, force: true });
      rmSync(noCorpus.root, { recursive: true, force: true });
    }
  });

  it('test_when_corpus_absent_or_unreadable_then_build_index_omits_map_without_throwing', async () => {
    const { root, memDir, specDir } = sandbox();
    try {
      rmSync(specDir, { recursive: true, force: true });
      const mod = await importFresh(SESSION_START);
      const absent = mod.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' });
      assert.ok(!JSON.parse(absent).hookSpecificOutput.additionalContext.includes(CONCEPT_HEADING),
        'an absent corpus omits the section rather than throwing');

      mkdirSync(join(specDir, 'concepts'), { recursive: true });
      writeFileSync(join(specDir, 'concepts', 'broken.md'), 'not: [valid\nfrontmatter', 'utf8');
      const malformed = mod.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' });
      assert.ok(JSON.parse(malformed).hookSpecificOutput.additionalContext.length > 0,
        'a malformed shard still yields a valid envelope');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_envelope_budget_exhausted_then_concept_map_section_is_omitted', async () => {
    const { root, memDir, specDir } = sandbox();
    try {
      rmSync(join(specDir, 'concepts'), { recursive: true, force: true });
      for (let i = 0; i < 200; i++) {
        writeWorkspaceConcept(specDir, `overflow-concept-${i}`, {
          title: `Overflow concept number ${i} with a deliberately long title`,
        });
      }
      writeResume(memDir, 'SENTINEL');

      const mod = await importFresh(SESSION_START);
      const context = JSON.parse(
        mod.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' }),
      ).hookSpecificOutput.additionalContext;

      assert.ok(!context.includes(CONCEPT_HEADING),
        'a map that would not fit the envelope is omitted entirely, never truncated mid-list');
      assert.ok(context.length <= ENVELOPE, 'the envelope bound still holds');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('AC-003 — the corpus is reachable from a touched path', () => {
  it('test_when_write_targets_an_anchored_path_then_corpus_location_surfaces_element_and_concepts', async () => {
    const mod = await importFresh(GOVERNED_MEMORY);
    assert.equal(typeof mod.surfaceCorpusLocation, 'function',
      'governed-memory.mjs must export surfaceCorpusLocation');

    const loc = mod.surfaceCorpusLocation('.claude/hooks/track_guard.mjs', {
      rootDir: REPO_ROOT,
      specDir: join(REPO_ROOT, 'docs/system'),
    });
    assert.ok(loc, 'an anchored path resolves');
    assert.ok(loc.elements.some((e) => e.id === 'track-guard'), 'names the anchoring element');
    assert.ok(loc.concepts.some((c) => c.id === 'workflow-tracks'), 'walks up to the owning concept');
  });
});

describe('AC-004 — every negative path degrades to allow', () => {
  it('test_when_path_has_element_but_no_governing_entry_then_corpus_block_still_emits', async () => {
    const resolve = await importFresh(RESOLVE);
    const ungoverned = liveElementAnchors().find(
      (a) => resolve.resolveLookup('by_path', a, { rootDir: REPO_ROOT }).length === 0
        && existsSync(join(REPO_ROOT, a)),
    );
    assert.ok(ungoverned, 'the live corpus has at least one anchored, ungoverned path');

    const res = runHook(REPO_ROOT, LIFECYCLE_HOOK, {
      tool_name: 'Write',
      tool_input: { file_path: join(REPO_ROOT, ungoverned), content: 'x' },
    });
    assert.match(res.stderr, /corpus/i,
      'the corpus block survives the no-governing-entry path; emitAllow exits, so it must be composed first');
    assert.equal(decisionOf(res), 'allow', 'advisory only — never blocks');
  });

  it('test_when_spec_dir_absent_then_surface_corpus_location_returns_null', async () => {
    const mod = await importFresh(GOVERNED_MEMORY);
    assert.equal(mod.surfaceCorpusLocation('.claude/hooks/track_guard.mjs', { rootDir: REPO_ROOT }), null,
      'without specDir resolveLookup returns an ARRAY of memory hits; it must never be read as a corpus result');
  });

  it('test_when_no_element_anchors_the_path_then_surface_corpus_location_returns_null', async () => {
    const mod = await importFresh(GOVERNED_MEMORY);
    const loc = mod.surfaceCorpusLocation('.claude/skills/impeccable/nothing-anchors-this.mjs', {
      rootDir: REPO_ROOT,
      specDir: join(REPO_ROOT, 'docs/system'),
    });
    assert.equal(loc, null, 'null, not {elements: [], concepts: []} — one falsy check at the caller');
  });

  it('test_when_path_escapes_corpus_root_then_surface_corpus_location_returns_null', async () => {
    const mod = await importFresh(GOVERNED_MEMORY);
    assert.equal(
      mod.surfaceCorpusLocation('../../etc/passwd', {
        rootDir: REPO_ROOT,
        specDir: join(REPO_ROOT, 'docs/system'),
      }),
      null,
      'a traversal path resolves to nothing rather than reading outside the corpus root',
    );
  });

  it('test_when_lookup_throws_then_write_leg_emits_allow_and_never_blocks', () => {
    const { root, specDir } = sandbox();
    try {
      rmSync(join(specDir, 'elements'), { recursive: true, force: true });
      writeFileSync(join(specDir, 'elements'), 'not a directory', 'utf8');
      const res = runHook(root, LIFECYCLE_HOOK, {
        tool_name: 'Write',
        tool_input: { file_path: join(root, '.claude/hooks/track_guard.mjs'), content: 'x' },
      });
      assert.equal(res.code, 0, 'an unreadable corpus never fails the hook');
      assert.equal(decisionOf(res), 'allow', 'and never blocks the write');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('AC-005 — the Bash leg reads the store shape in use', () => {
  const KEYS = ['dev-server-ownership', 'lsof-port-kill-takes-firefox-with-it'];
  const FALLBACK = /no memory entries/i;
  const payload = { tool_name: 'Bash', tool_input: { command: 'lsof -i :8080' } };

  it('test_when_store_is_sharded_then_bash_leg_surfaces_both_entries_verbatim', () => {
    const res = runHook(REPO_ROOT, LIFECYCLE_HOOK, payload);
    for (const key of KEYS) {
      assert.match(res.stderr, new RegExp(key),
        `${key} lives as a shard; the leg must read it through resolveCategory`);
    }
    assert.doesNotMatch(res.stderr, FALLBACK, 'the fallback must not fire on a populated store');
  });

  it('test_when_store_is_flat_then_bash_leg_still_surfaces_both_entries', () => {
    const { root, memDir } = sandbox();
    try {
      for (const category of ['conventions', 'landmines']) rmSync(join(memDir, category), { recursive: true, force: true });
      writeFlatCategory(memDir, 'conventions', [{ key: KEYS[0], bodyLines: ['- Trap: flat shape.'] }]);
      writeFlatCategory(memDir, 'landmines', [{ key: KEYS[1], bodyLines: ['- Trap: flat shape.'] }]);

      const res = runHook(root, LIFECYCLE_HOOK, payload);
      for (const key of KEYS) {
        assert.match(res.stderr, new RegExp(key), `${key} must resolve through the flat branch too`);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_neither_target_entry_exists_then_bash_leg_reports_shape_agnostic_fallback', () => {
    const { root, memDir } = sandbox();
    try {
      for (const category of ['conventions', 'landmines']) rmSync(join(memDir, category), { recursive: true, force: true });
      const res = runHook(root, LIFECYCLE_HOOK, payload);
      assert.match(res.stderr, FALLBACK, 'the fallback still fires when both entries are genuinely absent');
      assert.doesNotMatch(res.stderr, /conventions\.md|landmines\.md/,
        'and names the entries by category and key, not by a flat filename that may not exist');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('AC-006 — corpus drift surfaces to the curator, and nothing bulk-stamps', () => {
  it('test_when_element_digest_drifts_then_list_stale_reports_it', async () => {
    const { root, specDir } = sandbox();
    try {
      const anchor = 'subject.mjs';
      writeFileSync(join(root, anchor), 'export const before = 1;\n', 'utf8');
      writeWorkspaceElement(specDir, 'subject', { anchor });
      const digest = await importFresh(DIGEST);
      digest.stampElement(specDir, 'subject', { rootDir: root });

      writeFileSync(join(root, anchor), 'export const after = 1;\n', 'utf8');
      const stale = await importFresh(STALE_ELEMENTS);
      const drifted = stale.listStale({ specDir, rootDir: root });

      assert.ok(drifted.some((d) => d.id === 'subject'), 'a moved exported interface reports as stale');
      assert.match(drifted.find((d) => d.id === 'subject').detail, /digest/i, 'the detail names the digest change');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_memory_flush_sop_read_then_step_0e_invokes_list_stale', () => {
    const sop = readFileSync(join(REPO_ROOT, '.claude/skills/memory-flush/SKILL.md'), 'utf8');
    assert.match(sop, /Step 0e/, 'memory-flush gains a Step 0e');
    assert.match(sop, /stale-elements\.mjs/, 'which invokes the previously orphaned helper');
    assert.match(sop, /listStale/, 'by name');
  });

  it('test_when_step_0e_exists_then_no_bulk_stamp_path_is_introduced', async () => {
    const digest = await importFresh(DIGEST);
    const { root, specDir } = sandbox();
    try {
      assert.throws(() => digest.stampAll(specDir, undefined, { rootDir: root }), /explicit|id list|required/i,
        'stampAll still refuses without an explicit id list');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    const sop = readFileSync(join(REPO_ROOT, '.claude/skills/memory-flush/SKILL.md'), 'utf8');
    assert.ok(!sop.includes('stampAll'),
      'Step 0e re-stamps per element the curator read; a bulk path would launder the drift');
  });
});

describe('AC-007 — prose stops contradicting the code', () => {
  it('test_when_prose_surfaces_read_then_three_drift_claims_are_corrected', () => {
    const scout = readFileSync(join(REPO_ROOT, '.claude/skills/scout/SKILL.md'), 'utf8');
    const deltaLine = scout.split('\n').find((l) => l.includes('mode: "reconcile"')) ?? '';
    assert.ok(!/\bstale\b/.test(deltaLine),
      'reconcile() deletes `stale` deliberately (reconcile.mjs:34-46); scout must not promise it');

    const project = JSON.parse(readFileSync(join(REPO_ROOT, '.claude/project.json'), 'utf8'));
    const template = readFileSync(join(REPO_ROOT, '.claude/skills/spec/template.md'), 'utf8');
    const comment = template.slice(0, template.indexOf('-->'));
    for (const heading of project.artifacts.required_sections.spec) {
      assert.ok(comment.includes(heading), `the required-headings comment must list ${heading}`);
    }

    const readme = readFileSync(join(REPO_ROOT, '.claude/memory/README.md'), 'utf8');
    const builderLine = readme.split('\n').find((l) => l.includes('session-start index is built')) ?? '';
    assert.ok(!builderLine.includes('memory-index/build-index.mjs'),
      'build-index.mjs has no production caller; the builder is buildIndex in memory_session_start.mjs');
  });
});

describe('AC-008 — the write leg is documented governance', () => {
  const TRIGGERS = [/phase-scoped/i, /governs|path-keyed|path-governed/i, /corpus/i];

  it('test_when_governance_docs_read_then_write_leg_triggers_are_documented', () => {
    const settings = readFileSync(join(REPO_ROOT, '.claude/settings.json'), 'utf8');
    assert.match(settings, /process_lifecycle_guard/, 'the hook is registered');

    for (const rel of ['docs/init/seed.md', '.claude/CONSTITUTION.md']) {
      const text = readFileSync(join(REPO_ROOT, rel), 'utf8');
      const at = text.indexOf('process_lifecycle_guard');
      assert.ok(at >= 0, `${rel} mentions the hook`);
      const section = text.slice(at, at + 1200);
      assert.match(section, /Write|Edit/, `${rel} must document the Write registration, not only the Bash leg`);
      for (const trigger of TRIGGERS) {
        assert.match(section, trigger, `${rel} must name the ${trigger} surfacing trigger`);
      }
    }
  });

  it('test_when_seed_mirror_compared_then_it_is_byte_equal_outside_the_reserved_section', () => {
    const genesis = readFileSync(join(REPO_ROOT, 'docs/init/seed.md'), 'utf8');
    const template = readFileSync(join(REPO_ROOT, 'src/seed.template.md'), 'utf8');

    // §16 is the ONE sanctioned divergence: the template reserves it and
    // /init-project populates it per install, so the two are byte-equal
    // everywhere else and nowhere near equal inside it.
    assert.equal(withoutReservedSection(genesis), withoutReservedSection(template),
      'the shipped mirror stays byte-equal to the genesis document outside §16');
    assert.match(reservedSectionOf(template), /\*Reserved\.\*/,
      '§16 stays reserved in the template; audit-baseline checks the reservation, not equality');
    assert.doesNotMatch(reservedSectionOf(genesis), /\*Reserved\.\*/,
      "and is populated in this repo's own copy");
  });
});

describe('AC-010 — the preflight agrees with the guard', () => {
  it('test_when_spec_carries_resolvable_ref_then_guard_and_lint_agree', () => {
    const spec = join(REPO_ROOT, 'docs/specs/corpus-recall-reachability.md');
    const guard = guardOnSpec(REPO_ROOT, spec);
    assert.equal(decisionOf(guard), 'allow', 'the guard allows a spec whose @ref resolves');

    const lint = runLint(REPO_ROOT, 'corpus-recall-reachability');
    assert.match(presenceRowOf(lint.stdout), /PASS/,
      'and the preflight reaches the same structural-kind verdict on the same bytes');
  });

  it('test_when_ref_names_a_missing_element_then_lint_fails_and_guard_blocks', () => {
    const { root } = sandbox();
    try {
      const spec = writeSpecFixture(root, 'unresolved-ref', '@ref element:does-not-exist');
      assert.equal(decisionOf(guardOnSpec(root, spec)), 'deny', 'the guard blocks an unresolvable reference');

      const lint = runLint(root, 'unresolved-ref');
      const row = presenceRowOf(lint.stdout);
      assert.match(row, /FAIL/, 'and the preflight reports it rather than passing');
      assert.match(row, /does-not-exist/, 'naming the id that did not resolve');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_ref_is_malformed_then_both_require_the_full_diagram_set', async () => {
    const profile = await importFresh(WRITE_SET_PROFILE);
    assert.deepEqual(profile.elementReferences('@ref element:Bad_Id'), [],
      'a malformed token yields no id, so no caller strips the structural kinds');

    const { root } = sandbox();
    try {
      const spec = writeSpecFixture(root, 'malformed-ref', '@ref element:Bad_Id');
      assert.equal(decisionOf(guardOnSpec(root, spec)), 'deny',
        'the full set is required, so the missing structural kinds still block');
      assert.match(presenceRowOf(runLint(root, 'malformed-ref').stdout), /FAIL/,
        'and the preflight agrees');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('test_when_element_references_extracted_then_it_shares_the_module_regex', async () => {
    const profile = await importFresh(WRITE_SET_PROFILE);
    assert.ok(profile.STRUCTURAL_KINDS instanceof Set, 'the kind set is shared, not restated per caller');
    assert.deepEqual(
      [...profile.STRUCTURAL_KINDS].sort(),
      ['c4_component', 'c4_container', 'c4_context'],
    );

    // One regex constant backs both, so they can never disagree about what is
    // well-formed — two copies is exactly what produced the drift this AC closes.
    const wellFormed = ['@ref element:surfacing-triggers', '@ref element:a', '@ref element:a-b-c'];
    const malformed = ['@ref element:Bad_Id', '@ref element:-leading', '@ref  element:x y', '@ref element:'];
    for (const token of wellFormed) {
      assert.equal(profile.hasMalformedReference(token), false, `${token} is well-formed`);
      assert.equal(profile.elementReferences(token).length, 1, `${token} yields exactly one id`);
    }
    for (const token of malformed) {
      assert.equal(profile.hasMalformedReference(token), true, `${token} is malformed`);
      assert.deepEqual(profile.elementReferences(token), [], `${token} yields no id`);
    }
  });
});
