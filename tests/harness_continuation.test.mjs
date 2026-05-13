import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const HOOK_PATH = path.join(REPO_ROOT, '.claude/hooks/harness_continuation.sh');
const SESSION_START_HOOK_PATH = path.join(REPO_ROOT, '.claude/hooks/memory_session_start.sh');

const SLUG = 'test-harness-continuation';
const PROJECT_JSON = JSON.stringify(
  {
    configured: true,
    test: { cmd: 'true' },
    harness: { continue_window_seconds: 10, max_ticks_per_session: 20 },
  },
  null,
  2
);

async function createTempProject() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-stop-'));
  await fs.mkdir(path.join(tmp, '.claude/state/logs'), { recursive: true });
  await fs.writeFile(path.join(tmp, '.claude/project.json'), PROJECT_JSON);
  return tmp;
}

async function writeHarnessState(tmp, state) {
  await fs.writeFile(
    path.join(tmp, '.claude/state/harness_state'),
    JSON.stringify(state, null, 2)
  );
}

async function writeMarker(tmp, slug) {
  await fs.writeFile(path.join(tmp, '.claude/state/.harness_active'), `${slug}\n`);
}

async function writeWorkflowJson(tmp, slug) {
  await fs.writeFile(
    path.join(tmp, '.claude/state/workflow.json'),
    JSON.stringify({ slug, entry_phase: 'intake', completed: [] }, null, 2)
  );
}

function invokeHook(tmp, payload) {
  return spawnSync('bash', [HOOK_PATH], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

function invokeSessionStart(tmp, payload) {
  return spawnSync('bash', [SESSION_START_HOOK_PATH], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmp },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

function freshContinueState() {
  return {
    state: 'continue',
    reason: 'next phase: document',
    written_at: Math.floor(Date.now() / 1000),
    slug: SLUG,
    tick_count: 1,
  };
}

function defaultPayload() {
  return {
    session_id: 'test-session',
    transcript_path: '/dev/null',
    cwd: '/tmp',
  };
}

describe('harness_continuation Stop hook', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await createTempProject();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('test_stop_hook_emits_block_when_state_is_continue_and_marker_present', async () => {
    await writeHarnessState(tmp, freshContinueState());
    await writeMarker(tmp, SLUG);
    const result = invokeHook(tmp, defaultPayload());
    assert.equal(
      result.status,
      0,
      `exit code should be 0, got ${result.status}; stderr: ${result.stderr}`
    );
    const out = JSON.parse(result.stdout);
    assert.equal(out.decision, 'block');
    assert.ok(
      typeof out.reason === 'string' && out.reason.includes('Skill(harness)'),
      `reason should include "Skill(harness)", got: ${out.reason}`
    );
  });

  it('test_stop_hook_silent_when_marker_absent', async () => {
    await writeHarnessState(tmp, freshContinueState());
    const result = invokeHook(tmp, defaultPayload());
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('test_stop_hook_silent_when_stop_hook_active_true', async () => {
    await writeHarnessState(tmp, freshContinueState());
    await writeMarker(tmp, SLUG);
    const result = invokeHook(tmp, { ...defaultPayload(), stop_hook_active: true });
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('test_stop_hook_silent_when_harness_state_missing', async () => {
    await writeMarker(tmp, SLUG);
    const result = invokeHook(tmp, defaultPayload());
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('test_stop_hook_silent_when_harness_state_malformed_json', async () => {
    await writeMarker(tmp, SLUG);
    await fs.writeFile(
      path.join(tmp, '.claude/state/harness_state'),
      'not parseable json {{{'
    );
    const result = invokeHook(tmp, defaultPayload());
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('test_stop_hook_silent_when_state_is_yielded', async () => {
    await writeMarker(tmp, SLUG);
    await writeHarnessState(tmp, { ...freshContinueState(), state: 'yielded' });
    const result = invokeHook(tmp, defaultPayload());
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('test_stop_hook_logs_warn_on_slug_mismatch', async () => {
    await writeWorkflowJson(tmp, 'right-slug');
    await writeHarnessState(tmp, { ...freshContinueState(), slug: 'right-slug' });
    await writeMarker(tmp, 'wrong-slug');
    const result = invokeHook(tmp, defaultPayload());
    assert.equal(result.status, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.decision, 'block');
    const log = await fs.readFile(
      path.join(tmp, '.claude/state/logs/harness_continuation.log'),
      'utf8'
    );
    assert.match(log, /WARN/, 'log should contain a WARN line');
    assert.match(log, /slug mismatch/, 'WARN should mention slug mismatch');
    assert.match(log, /wrong-slug/, 'WARN should name the marker slug');
    assert.match(log, /right-slug/, 'WARN should name the workflow slug');
  });

  it('test_stop_hook_chain_within_turn', async () => {
    await writeHarnessState(tmp, freshContinueState());
    await writeMarker(tmp, SLUG);
    const firstFire = invokeHook(tmp, defaultPayload());
    assert.equal(firstFire.status, 0);
    const firstOut = JSON.parse(firstFire.stdout);
    assert.equal(firstOut.decision, 'block', 'first fire should emit block');
    const secondFire = invokeHook(tmp, { ...defaultPayload(), stop_hook_active: true });
    assert.equal(secondFire.status, 0);
    assert.equal(
      secondFire.stdout.trim(),
      '',
      'second fire with stop_hook_active=true should stay silent'
    );
  });
});

describe('memory_session_start marker cleanup', () => {
  let tmp;
  beforeEach(async () => {
    tmp = await createTempProject();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('test_memory_session_start_removes_stale_marker', async () => {
    const staleSlug = 'stale-slug-from-yesterday';
    await writeMarker(tmp, staleSlug);
    const markerPath = path.join(tmp, '.claude/state/.harness_active');
    assert.ok(existsSync(markerPath), 'marker should exist before invocation');

    invokeSessionStart(tmp, { source: 'startup' });

    assert.equal(
      existsSync(markerPath),
      false,
      'marker should be removed by memory_session_start.sh'
    );
    const log = await fs.readFile(
      path.join(tmp, '.claude/state/logs/harness_continuation.log'),
      'utf8'
    );
    assert.match(log, /INFO/, 'log should contain INFO line');
    assert.match(log, /removed stale \.harness_active/, 'log should describe the cleanup');
    assert.match(log, new RegExp(staleSlug), 'log should name the removed slug');
  });
});

describe('post-refactor invariants', () => {
  it('test_harness_skill_md_lacks_disable_model_invocation', async () => {
    const content = await fs.readFile(
      path.join(REPO_ROOT, '.claude/skills/harness/SKILL.md'),
      'utf8'
    );
    assert.ok(
      !/^disable-model-invocation:\s*true/m.test(content),
      'harness/SKILL.md still contains "disable-model-invocation: true"'
    );
  });

  it('test_caller_skills_lack_Skill_verify_invocation', async () => {
    const callers = [
      '.claude/skills/integrate/SKILL.md',
      '.claude/skills/simplify/SKILL.md',
      '.claude/skills/chore/SKILL.md',
      '.claude/skills/tdd/SKILL.md',
    ];
    for (const rel of callers) {
      const content = await fs.readFile(path.join(REPO_ROOT, rel), 'utf8');
      assert.equal(
        content.includes('Skill(verify)'),
        false,
        `${rel} still contains "Skill(verify)"`
      );
    }
  });

  it('test_harness_state_is_3_fields_only', async () => {
    const raw = await fs.readFile(
      path.join(REPO_ROOT, '.claude/state/harness_state'),
      'utf8'
    );
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed).sort();
    assert.deepEqual(
      keys,
      ['reason', 'slug', 'state'],
      `harness_state must contain only {state, slug, reason}; got ${JSON.stringify(keys)}`
    );
  });

  it('test_project_json_has_no_harness_key', async () => {
    const raw = await fs.readFile(
      path.join(REPO_ROOT, '.claude/project.json'),
      'utf8'
    );
    const parsed = JSON.parse(raw);
    assert.equal(
      'harness' in parsed,
      false,
      '.claude/project.json must not contain a top-level "harness" key after the redesign'
    );
  });
});

describe('post-redesign text invariants (harness-internal-loop)', () => {
  it('test_harness_skill_md_describes_internal_loop', async () => {
    const sop = await fs.readFile(
      path.join(REPO_ROOT, '.claude/skills/harness/SKILL.md'),
      'utf8'
    );
    const loopLanguage = /(?:loops?\s+internally|harness\s+loops|loops?\s+(?:through|over|until)\s+[^.]*non-gated|while[^.]*\bnon-gated)/i;
    assert.match(
      sop,
      loopLanguage,
      'harness/SKILL.md must describe an internal loop over non-gated phases (e.g., "loops internally", "loops through non-gated", "while … non-gated"). Current SOP omits this — the redesign is incomplete.'
    );
    const safetyNet = /\bsafety[-\s]?net\b/i;
    assert.match(
      sop,
      safetyNet,
      'harness/SKILL.md must reference the "safety net" role of the Stop hook (the hook only fires when the loop exits mid-flow). Current SOP omits this — the redesign is incomplete.'
    );
  });

  it('test_harness_skill_md_lacks_one_skill_per_tick_phrase', async () => {
    const sop = await fs.readFile(
      path.join(REPO_ROOT, '.claude/skills/harness/SKILL.md'),
      'utf8'
    );
    const deprecatedAny = /(?:exactly\s+)?one[^.\n]{0,80}\bcall\s+per\s+tick\b/i;
    assert.doesNotMatch(
      sop,
      deprecatedAny,
      'harness/SKILL.md still contains an "(exactly) one … call per tick" phrase — the per-tick atomicity rule was replaced by the internal loop contract. Search for "per tick" and rewrite uses that frame Skill-call atomicity around a tick.'
    );
    const perTickAtomicity = /per-tick\s+atomicity/i;
    assert.doesNotMatch(
      sop,
      perTickAtomicity,
      'harness/SKILL.md still uses the "per-tick atomicity" framing in a heading or paragraph — the redesign reframes atomicity around the internal loop (e.g., "Internal loop atomicity" or "Loop-exit atomicity").'
    );
  });

  it('test_claude_md_article_v_describes_internal_loop', async () => {
    const constitution = await fs.readFile(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8');
    const articleVMatch = constitution.match(
      /## Article V[\s\S]*?(?=\n## Article VI\b|\n## Article [A-Z])/
    );
    assert.ok(
      articleVMatch,
      'CLAUDE.md must contain an "## Article V" section followed by another Article heading'
    );
    const articleV = articleVMatch[0];
    const loopLanguage = /(?:loops?\s+internally|harness\s+loops|loops?\s+(?:through|over|until)\s+[^.]*non-gated|while[^.]*\bnon-gated)/i;
    assert.match(
      articleV,
      loopLanguage,
      'CLAUDE.md Article V must describe the internal loop over non-gated phases. Current text references Stop-hook-driven per-tick re-firing — the constitutional contract was not updated.'
    );
    const deprecatedBacktick = /exactly\s+one\s+`?Skill[^`]*`?\s*call\s+per\s+tick/i;
    assert.doesNotMatch(
      articleV,
      deprecatedBacktick,
      'CLAUDE.md Article V still carries the deprecated "exactly one Skill call per tick" phrasing — the rewrite is incomplete.'
    );
  });

  it('test_claude_template_md_byte_mirrors_claude_md', async () => {
    const live = await fs.readFile(path.join(REPO_ROOT, 'CLAUDE.md'));
    const template = await fs.readFile(path.join(REPO_ROOT, 'src/CLAUDE.template.md'));
    assert.equal(
      live.length,
      template.length,
      `CLAUDE.md (${live.length} bytes) and src/CLAUDE.template.md (${template.length} bytes) differ in length — byte-mirror invariant from Article XI violated.`
    );
    assert.ok(
      live.equals(template),
      'CLAUDE.md and src/CLAUDE.template.md must be byte-equal (Article XI byte-mirror invariant). After editing Article V in one, mirror to the other via `cp CLAUDE.md src/CLAUDE.template.md`.'
    );
  });
});
