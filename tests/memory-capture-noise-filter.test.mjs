// Tier 1 of llm-assisted-memory-capture-routing (cf4a/91a3).
// Backlog: shelve-capture-grabs-skill-sop-boilerplate-not-decisions-91a3
// Spec: docs/specs/llm-assisted-memory-capture-routing.md (DP3, §Behavior #4)
// Covers AC-005 (no boilerplate cues), AC-006 (shared noise source).
//
// shelve_capture.extract today pushes every user-role event text as a verbatim
// cue with no noise filter, so SKILL.md bodies (prefixed "Base directory for
// this skill:") and <system-reminder>/<command-name>/<local-command-*> wrappers
// land as cues. These tests pin the capture-time filter + the shared noise
// source in lib/common.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { capture } from '../.claude/hooks/lib/shelve_capture.mjs';
import { readMostRecent } from '../.claude/hooks/lib/thread_store.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LIB = join(REPO_ROOT, '.claude/hooks/lib');

function userEvent(uuid, text) {
  return JSON.stringify({ uuid, message: { role: 'user', content: text } });
}

function writeTranscript(lines) {
  const dir = mkdtempSync(join(tmpdir(), 'memcap-'));
  const transcriptPath = join(dir, 'transcript.jsonl');
  writeFileSync(transcriptPath, lines.join('\n') + '\n', 'utf8');
  return { dir, transcriptPath };
}

async function runCapture(lines) {
  const { dir, transcriptPath } = writeTranscript(lines);
  const memDir = join(dir, 'mem');
  const stateDir = join(dir, 'state');
  await capture({ transcriptPath, memDir, stateDir });
  return readMostRecent({ memDir });
}

const SKILL_BODY = 'Base directory for this skill: /x/.claude/skills/foo\n\n# foo\nDo the thing.';
const SYSTEM_REMINDER = '<system-reminder>remember to do X</system-reminder>';
const COMMAND_NAME = '<command-name>grant-commit</command-name>';
const LOCAL_COMMAND = '<local-command-stdout>ok</local-command-stdout>';
const REAL_TEXT = "let's converge the noise filters across the hooks before shipping";

describe('Tier 1 — boilerplate-free cues + shared noise source', () => {
  it('test_when_skill_md_body_and_wrapper_tags_then_no_cues', async () => {
    const entry = await runCapture([
      userEvent('u1', SKILL_BODY),
      userEvent('u2', SYSTEM_REMINDER),
      userEvent('u3', COMMAND_NAME),
      userEvent('u4', LOCAL_COMMAND),
      userEvent('u5', REAL_TEXT),
    ]);
    const cues = entry.verbatim_cues.join('\n');
    assert.ok(!cues.includes('Base directory for this skill:'), 'SKILL.md body must not be a cue');
    assert.ok(!cues.includes('<system-reminder>'), '<system-reminder> must not be a cue');
    assert.ok(!cues.includes('<command-name>'), '<command-name> must not be a cue');
    assert.ok(!cues.includes('<local-command-'), '<local-command-*> must not be a cue');
  });

  it('test_when_three_hooks_filter_noise_then_share_common_source', async () => {
    const common = await import('../.claude/hooks/lib/common.mjs');
    assert.ok(Array.isArray(common.NOISE_PREFIXES), 'common.mjs must export NOISE_PREFIXES array');
    for (const p of ['<system-reminder>', '<command-name>', '<local-command-']) {
      assert.ok(common.NOISE_PREFIXES.includes(p), `NOISE_PREFIXES must include ${p}`);
    }
    assert.equal(typeof common.isBoilerplate, 'function', 'common.mjs must export isBoilerplate()');
    assert.equal(common.isBoilerplate('Base directory for this skill: /x'), true);
    assert.equal(common.isBoilerplate(REAL_TEXT), false);

    for (const f of ['memory_stop.mjs', 'resume_writer.mjs', 'shelve_capture.mjs']) {
      const src = readFileSync(join(LIB, f), 'utf8');
      assert.match(src, /from '\.\/common\.mjs'/, `${f} must import from ./common.mjs`);
      assert.match(src, /NOISE_PREFIXES|isBoilerplate/, `${f} must reference the shared noise source`);
    }
  });

  it('test_when_real_user_text_then_still_captured_as_cue', async () => {
    const entry = await runCapture([
      userEvent('u1', SKILL_BODY),
      userEvent('u2', REAL_TEXT),
    ]);
    const cues = entry.verbatim_cues.join('\n');
    assert.ok(cues.includes('converge the noise filters'), 'real user authorship must still be captured');
  });
});
