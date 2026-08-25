// Tests for docs/specs/warm-context-diet.md — the four levers that cut the
// always-loaded warm-context token floor (AC-001..AC-012).
//
// Four of these are regression traps that already hold and must keep holding
// across the relocation: the Article VI hash, the mirror byte-equality, the
// two citation checks, and the audit. The rest are RED until the levers land.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { composeSnapshot } from '../.claude/hooks/lib/resume_writer.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const HOOK_PATH = join(REPO_ROOT, '.claude/hooks/memory_session_start.mjs');
const AUDIT_PATH = join(REPO_ROOT, '.claude/skills/audit-baseline/audit.mjs');

const SESSION_START_BUDGET = 4096;
const MAX_CLAUDE_MD_CHARS = 28000;
const MAX_INFLIGHT_ROWS = 8;

// Captured from CLAUDE.md before the Lever 3 relocation. Article VI is the
// non-negotiable engineering rules; it ships byte-identical or this fails.
//
// Re-pinned 2026-08-25 (release-safety, T7 — AC-021): VI.5 stopped naming a documentation
// vendor and now cites `.claude/docs-provider.json`, so the outcome mandate reads
// the same whichever provider a project configures. Re-pin and rewrite land in
// ONE commit — split across two, the suite is red in between for a reason
// indistinguishable from the accidental edit this pin exists to catch.
const ARTICLE_VI_SHA256 = 'cf7bbd5e32758b228630c6561884245f9e8e7976109e44ba4cab746de55759d6';

const DELETED_SKILLS = [
  'google-analytics',
  'optimize-seo',
  'pagespeed-insights',
  'marketing-psychology',
];

// Twelve, not the sixteen the spec's AC-003 first named. `/document`'s
// reflective public-site check surfaced four that something else invokes
// through the Skill tool, so de-indexing them would have broken that caller:
// claude-automation-recommender and gitignore (`/init-project` steps 4 and 5a),
// rca (verify/SKILL.md's repeat-FAIL recommendation), and org-dispatch (the
// `org` track's Phase 6 node, which the harness invokes). They stay invocable.
const DE_INDEXED_SKILLS = [
  'brd',
  'commit-planner',
  'companion',
  'retrospective',
  'roadmap-planner',
  'spec-sync',
  'sprint-oracle',
  'sprint-plan',
  'sprint-planner',
  'standup',
  'system-reconcile',
  'upgrade-project',
];

const MODEL_INVOCABLE_SKILLS = [
  'harness', 'tdd', 'spec', 'implement', 'scenario', 'code-structure',
  'prose', 'humanizer', 'chore', 'power', 'cli-copy-review', 'code-browser',
  'faithful-capture', 'audit-baseline', 'whatsnew', 'technical-tutorials',
  // Reached by a documented SOP through the Skill tool — see DE_INDEXED_SKILLS.
  'claude-automation-recommender', 'gitignore', 'rca', 'org-dispatch',
];

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// ---------- Foundation ----------

function readRepo(rel) {
  return readFileSync(join(REPO_ROOT, rel), 'utf8');
}

function frontmatterOf(skillSlug) {
  const text = readRepo(join('.claude/skills', skillSlug, 'SKILL.md'));
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return fence ? fence[1] : '';
}

// A bare `## Article VII` heading terminates the slice; matching the next
// heading rather than a fixed length keeps the assertion honest when
// surrounding Articles shrink.
function articleSlice(text, roman) {
  const start = text.indexOf(`## Article ${roman} `);
  if (start === -1) return '';
  const rest = text.slice(start + 1);
  const nextAt = rest.search(/^## Article [IVX]+ /m);
  return nextAt === -1 ? text.slice(start) : text.slice(start, start + 1 + nextAt);
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function additionalContextOf(result) {
  if (!result.stdout || !result.stdout.trim()) return '';
  const parsed = JSON.parse(result.stdout);
  return parsed?.hookSpecificOutput?.additionalContext || '';
}

function invokeHook(projectDir, payload = { source: 'startup' }, { raw = null } = {}) {
  return spawnSync('node', [HOOK_PATH], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, CLAUDE_PROJECT_ROOT: projectDir },
    input: raw === null ? JSON.stringify(payload) : raw,
    encoding: 'utf8',
  });
}

function assistantEvent(toolUses) {
  return {
    message: {
      role: 'assistant',
      content: toolUses.map(([name, input]) => ({ type: 'tool_use', name, input })),
    },
  };
}

function writeTranscript(events) {
  const dir = mkdtempSync(join(tmpdir(), 'warm-context-diet-'));
  const path = join(dir, 'transcript.jsonl');
  writeFileSync(path, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return { dir, path };
}

// ---------- Lever 1 — deletion ----------

describe('warm-context-diet — Lever 1 removes the orphaned website skills', () => {
  it('test_when_website_skill_dirs_removed_then_none_resolve', () => {
    for (const slug of DELETED_SKILLS) {
      assert.equal(
        existsSync(join(REPO_ROOT, '.claude/skills', slug)),
        false,
        `${slug} still resolves under .claude/skills/ — it targets the Friedbot Studio website, not this baseline`,
      );
    }
  });

  it('test_when_project_json_read_then_no_optimize_seo_excluded_tree', () => {
    const project = JSON.parse(readRepo('.claude/project.json'));
    const excluded = project.memory.architecture_map.governed_surface.excludedTrees;
    assert.ok(Array.isArray(excluded), 'excludedTrees is still an array');
    assert.equal(
      excluded.some((entry) => entry.includes('optimize-seo')),
      false,
      'excludedTrees still names optimize-seo/scripts/ after the skill directory was deleted',
    );
    assert.ok(
      excluded.some((entry) => entry.includes('impeccable')),
      'the surviving excludedTrees entries were dropped along with the optimize-seo one',
    );
  });
});

// ---------- Lever 2 — de-indexing ----------

describe('warm-context-diet — Lever 2 withholds user-only skills from the index', () => {
  it('test_when_user_only_skills_read_then_each_disables_model_invocation', () => {
    for (const slug of DE_INDEXED_SKILLS) {
      assert.match(
        frontmatterOf(slug),
        /^disable-model-invocation:\s*true$/m,
        `${slug} is user-only but its description still loads into the warm skill index`,
      );
    }
  });

  it('test_when_skill_is_de_indexed_then_nothing_invokes_it_through_the_skill_tool', () => {
    // The check that would have caught all four restorations. De-indexing is
    // safe only when no track node and no SOP reaches the skill via Skill();
    // grepping hooks and commands alone missed org-dispatch (a track node) and
    // the two prose-worded `/init-project` calls.
    const trackTargets = new Set();
    for (const line of readRepo('.claude/workflows.jsonl').split('\n').filter(Boolean)) {
      const track = JSON.parse(line);
      for (const node of track.nodes ?? []) {
        if (node.id) trackTargets.add(node.id);
        if (node.metadata?.phase) trackTargets.add(node.metadata.phase);
        if (node.skill) trackTargets.add(node.skill);
        for (const alt of node.alternates ?? []) if (alt.sub_track) trackTargets.add(alt.sub_track);
      }
    }
    const docs = spawnSync('find', ['.claude/commands', '.claude/skills', '-name', '*.md'],
      { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);

    // Three shapes, all observed in this repo. The prose form is the one that
    // matters most: `/init-project` says "invoke the `gitignore` skill" without
    // ever writing "Skill(", and grepping for the call syntax alone missed it.
    const invocationOf = (slug) => [
      new RegExp(`Skill\\(\\s*${slug}\\b`),
      new RegExp(`invokes?\\s+(the\\s+)?\`?/?${slug}\`?\\s+skill`, 'i'),
      new RegExp(`\`${slug}\`[^\\n]{0,60}via the Skill tool`),
    ];

    for (const slug of DE_INDEXED_SKILLS) {
      assert.equal(trackTargets.has(slug), false, `${slug} is a workflow track node — the harness must be able to invoke it`);
      for (const doc of docs) {
        if (doc.startsWith(`.claude/skills/${slug}/`)) continue;
        const text = readRepo(doc);
        for (const pattern of invocationOf(slug)) {
          assert.ok(!pattern.test(text), `${doc} invokes ${slug} through the Skill tool, but it is de-indexed`);
        }
      }
    }
  });

  it('test_when_workflow_reachable_skills_read_then_model_invocation_intact', () => {
    for (const slug of MODEL_INVOCABLE_SKILLS) {
      assert.doesNotMatch(
        frontmatterOf(slug),
        /^disable-model-invocation:/m,
        `${slug} is reached by the harness or a sub-skill contract and must stay model-invocable`,
      );
    }
  });
});

// ---------- Lever 3 — constitution relocation ----------

describe('warm-context-diet — Lever 3 relocates narration to the annex', () => {
  it('test_when_claude_md_measured_then_at_most_28000_chars', () => {
    const chars = readRepo('CLAUDE.md').length;
    assert.ok(
      chars <= MAX_CLAUDE_MD_CHARS,
      `CLAUDE.md is ${chars} chars, over the ${MAX_CLAUDE_MD_CHARS} target — move narration to .claude/CONSTITUTION.md`,
    );
  });

  it('test_when_mirror_compared_then_byte_equal_to_claude_md', () => {
    const live = readFileSync(join(REPO_ROOT, 'CLAUDE.md'));
    const mirror = readFileSync(join(REPO_ROOT, 'src/CLAUDE.template.md'));
    assert.ok(live.equals(mirror), 'src/CLAUDE.template.md drifted — run npm run sync:constitution');
    assert.ok(
      !/derived|DO NOT EDIT/i.test(mirror.toString('utf8').slice(0, 400)),
      'the constitution mirror must carry no derived-header banner; byte-equality is the guard',
    );
  });

  it('test_when_articles_enumerated_then_all_twelve_present', () => {
    const text = readRepo('CLAUDE.md');
    for (const roman of ROMAN_NUMERALS) {
      assert.ok(
        text.includes(`## Article ${roman} `),
        `Article ${roman} heading vanished from CLAUDE.md — relocation moves narration, never an Article`,
      );
    }
  });

  it('test_when_article_six_compared_then_body_unchanged', () => {
    const body = articleSlice(readRepo('CLAUDE.md'), 'VI');
    assert.ok(body.startsWith('## Article VI '), 'Article VI slice did not resolve');
    assert.equal(
      sha256(body),
      ARTICLE_VI_SHA256,
      'Article VI changed — the non-negotiable engineering rules ship byte-identical',
    );
  });

  it('test_when_citations_checked_then_article_twelve_and_seed_seventeen_present', () => {
    const claude = readRepo('CLAUDE.md');
    assert.ok(claude.includes('## Article XII'), 'audit checks CLAUDE.md for the literal "## Article XII"');
    assert.ok(claude.includes('manifest'), 'audit checks CLAUDE.md for the token "manifest"');
    const seed = readRepo('docs/init/seed.md');
    assert.ok(seed.includes('## §17'), 'audit checks seed.md for the literal "## §17"');
    assert.ok(seed.includes('manifest'), 'audit checks seed.md for the token "manifest"');
  });
});

// ---------- Lever 4 — SessionStart injection ----------

describe('warm-context-diet — Lever 4 bounds the SessionStart injection', () => {
  it('test_when_session_start_hook_runs_then_stdout_within_budget', () => {
    const result = invokeHook(REPO_ROOT);
    assert.equal(result.status, 0, 'the SessionStart hook must never fail a session start');
    assert.ok(
      result.stdout.length <= SESSION_START_BUDGET,
      `injection is ${result.stdout.length} chars, over the ${SESSION_START_BUDGET} budget`,
    );
  });

  it('test_when_hook_output_inspected_then_no_thread_entry_blob', () => {
    const injected = additionalContextOf(invokeHook(REPO_ROOT));
    assert.ok(
      !injected.includes('thread-entry'),
      'the base64 thread-entry comment is a machine field and must be stripped from the injected copy',
    );
  });

  it('test_when_thread_file_inspected_then_blob_still_on_disk', (t) => {
    const threadPath = join(REPO_ROOT, '.claude/memory/_thread.md');
    if (!existsSync(threadPath)) return t.skip('no shelved thread on disk');
    const onDisk = readFileSync(threadPath, 'utf8');
    if (!onDisk.includes('thread-entry')) return t.skip('no thread-entry comment to preserve');
    invokeHook(REPO_ROOT);
    assert.ok(
      readFileSync(threadPath, 'utf8').includes('thread-entry'),
      'stripping happens in the consumer; thread_store owns the on-disk round-trip',
    );
  });

  it('test_when_transcript_has_repeated_cd_then_no_shell_rows_emitted', () => {
    const cd = `cd ${REPO_ROOT}`;
    const events = Array.from({ length: 10 }, () => assistantEvent([['Bash', { command: cd }]]));
    const { dir, path } = writeTranscript(events);
    const snapshot = composeSnapshot({ transcript: path, projectDir: dir, trigger: 'stop' });
    assert.ok(
      !snapshot.includes('## Recent shell commands'),
      'ten identical cd commands carry no information; the section should be omitted entirely',
    );
  });

  it('test_when_transcript_has_many_writes_then_inflight_rows_capped', () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      assistantEvent([['Write', { file_path: join(REPO_ROOT, `src/generated-${i}.mjs`) }]]));
    const { dir, path } = writeTranscript(events);
    const snapshot = composeSnapshot({ transcript: path, projectDir: dir, trigger: 'stop' });
    const section = snapshot.split('## In-flight files')[1].split('##')[0];
    const rows = section.split('\n').filter((line) => line.startsWith('- `'));
    assert.ok(
      rows.length <= MAX_INFLIGHT_ROWS,
      `${rows.length} in-flight rows emitted, over the ${MAX_INFLIGHT_ROWS} cap`,
    );
  });

  it('test_when_clamp_limit_below_notice_then_output_still_within_limit', async () => {
    // Unreachable at SESSION_START_BUDGET=4096 (envelope overhead is ~150 chars,
    // not ~4000), but a future budget cut below ~250 would reach it and the clamp
    // would return MORE than the limit. Pin the bound rather than the arithmetic.
    const { clampTo } = await import('../.claude/hooks/lib/memory_session_start.mjs');
    for (const limit of [-100, 0, 10, 57, 200]) {
      const out = clampTo('x'.repeat(500), limit);
      assert.ok(
        out.length <= Math.max(limit, 0) || limit <= 0,
        `clampTo(500, ${limit}) returned ${out.length} chars, over the limit`,
      );
    }
    assert.equal(clampTo('x'.repeat(500), 0), '', 'a zero limit yields nothing, not a notice');
  });

  it('test_when_hook_given_degenerate_payloads_then_exits_zero', () => {
    const empty = invokeHook(REPO_ROOT, {});
    const malformed = invokeHook(REPO_ROOT, null, { raw: '{not json' });
    const noMemory = invokeHook(mkdtempSync(join(tmpdir(), 'warm-context-diet-bare-')));

    for (const [label, result] of [['empty', empty], ['malformed', malformed], ['no-memory-dir', noMemory]]) {
      assert.equal(result.status, 0, `hook exited non-zero on a ${label} payload`);
      if (result.stdout.trim()) {
        const parsed = JSON.parse(result.stdout);
        assert.ok(parsed.hookSpecificOutput, `hook emitted non-contract JSON on a ${label} payload`);
      }
    }
  });
});

// ---------- Cross-lever regression trap ----------

describe('warm-context-diet — the baseline audit still passes', () => {
  it('test_when_audit_runs_then_exits_zero', () => {
    const result = spawnSync('node', [AUDIT_PATH], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120000,
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.ok(!output.includes('hash mismatch'), 'manifest drifted — run npm run manifest:refresh last');
    assert.ok(!output.includes('baseline skill missing'), 'a manifest-listed baseline skill is absent from disk');
    assert.equal(result.status, 0, `audit-baseline exited ${result.status}`);
  });
});
