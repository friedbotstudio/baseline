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

// ---------------------------------------------------------------------------
// extractor-noise-and-prereq-drift — T1 capture-precision fixtures.
// Spec: docs/specs/extractor-noise-and-prereq-drift.md
// The extractor was re-ingesting its OWN /memory-sync reports and mining
// SKILL.md contract prose, so 16 of 16 candidates at one flush were unpromotable.
// ---------------------------------------------------------------------------

const FLUSH_REPORT = [
  'memory-sync — 2026-07-12',
  '',
  'Closed (1):',
  '- durable-plan-slug-path-traversal-hardening-7c4d → backlog.md (auto-close)',
  '',
  'Promoted (5):',
  '- phase-timer-collapses-phases-appended-in-one-workflow-json-write → landmines.md (new)',
  '',
  'Discarded (16 of 16 pending):',
  '- 8 candidates — verbatim quotations of PRIOR /memory-sync reports (recursive noise)',
].join('\n');

// A skill body as it arrives on FIRST invocation: the marker is at the head.
const ENVELOPE_NO_ARGS = [
  'Base directory for this skill: /Users/x/.claude/skills/harness',
  '',
  '# harness — workflow orchestrator',
  'The fix is mechanical (implementation mismatch, edge case missed, off-by-one).',
].join('\n');

// The SAME body on RE-invocation. The preamble pushes the marker past
// isBoilerplate's 64-char head window (common.mjs:876) — this is D12, the exact
// shape that leaked CLAUDE.md's decision tree into `source: user-instruction`
// in two separate live sessions.
const ENVELOPE_REINVOCATION = [
  '(Re-invocation of /harness — the skill instructions were previously loaded; the arguments or dynamic output below are new.)',
  'Base directory for this skill: /Users/x/.claude/skills/harness',
  '',
  '# harness — workflow orchestrator',
  'The fix is mechanical (implementation mismatch, edge case missed, off-by-one).',
].join('\n');

// A skill envelope carrying REAL human intent below the ARGUMENTS: marker.
// Block-level suppression would silently eat this deferral; section-level (D10) keeps it.
const ENVELOPE_WITH_ARGS = [
  'Base directory for this skill: /Users/x/.claude/skills/triage',
  '',
  '# triage — pick the workflow entry phase',
  'The fix is mechanical (implementation mismatch, edge case missed, off-by-one).',
  '',
  'ARGUMENTS: fix the slug guard; we should also bound the slug length later — add this to backlog',
].join('\n');

const SELF_REFERENTIAL_SENTENCE =
  "4 candidates were memory_stop firing on the literal phrase 'the fix is'";

// The sentence that CREATED ticket T1. If the filter suppresses this, it eats
// its own bug report — the failure mode one level up from the one being fixed.
const HOOK_CLAIM_SENTENCE =
  'memory_stop is in a recursive noise loop and re-ingests its own flush reports';

const GENUINE_DEFERRAL = 'we should also bound the slug length — add this to backlog';

const PATHOLOGICAL_BLOCK = 'Base directory for this skil'.repeat(4000); // ~112KB of near-miss marker

const NON_STRINGS = [null, undefined, 42, {}, [], true];

describe('T1 — capture precision (extractor-noise-and-prereq-drift)', () => {
  it('test_when_assistant_block_is_flush_report_then_zero_candidates', async () => { // AC-001
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    assert.equal(typeof lib.isFlushReport, 'function', 'memory_stop.mjs must export isFlushReport()');
    assert.equal(lib.isFlushReport(FLUSH_REPORT), true, 'a /memory-sync report block must be suppressed');
    assert.equal(lib.isFlushReport(GENUINE_DEFERRAL), false, 'ordinary prose is not a flush report');
  });

  it('test_when_user_block_has_skill_envelope_then_sop_body_suppressed', async () => { // AC-002
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    assert.equal(typeof lib.stripSkillEnvelope, 'function', 'memory_stop.mjs must export stripSkillEnvelope()');
    assert.equal(lib.stripSkillEnvelope(ENVELOPE_NO_ARGS), '', 'an envelope with no ARGUMENTS: yields nothing to mine');
    assert.equal(lib.stripSkillEnvelope(GENUINE_DEFERRAL), GENUINE_DEFERRAL, 'a non-envelope block passes through unchanged');
  });

  it('test_when_deferral_sits_below_arguments_marker_then_candidate_staged', async () => { // AC-002 AC-003
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    const mined = lib.stripSkillEnvelope(ENVELOPE_WITH_ARGS);
    assert.ok(mined.includes('bound the slug length'), 'text at/below ARGUMENTS: must still be mined (D10 section-level)');
    assert.ok(!mined.includes('The fix is mechanical'), 'the SOP contract body above ARGUMENTS: must be dropped');
  });

  it('test_when_genuine_user_deferral_then_candidate_staged', async () => { // AC-003
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    assert.equal(lib.isFlushReport(GENUINE_DEFERRAL), false, 'recall must survive: a real deferral is not a report');
    assert.equal(lib.isSelfReferential(GENUINE_DEFERRAL), false, 'recall must survive: a real deferral is not self-referential');
  });

  it('test_when_sentence_is_about_candidate_extraction_then_self_referential_true', async () => { // AC-009
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    assert.equal(typeof lib.isSelfReferential, 'function', 'memory_stop.mjs must export isSelfReferential()');
    assert.equal(lib.isSelfReferential(SELF_REFERENTIAL_SENTENCE), true, 'narration ABOUT candidate extraction must be suppressed');
  });

  it('test_when_sentence_is_claim_about_the_hook_then_self_referential_false', async () => { // AC-009
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    // THE TEST THAT PROVES THE DESIGN. This exact sentence created ticket T1.
    // If it ever returns true, the filter suppresses the bug reports about itself.
    assert.equal(lib.isSelfReferential(HOOK_CLAIM_SENTENCE), false, 'a claim about the HOOK must be kept — the filter must not eat its own bug report');
  });

  it('test_when_reinvocation_preamble_precedes_marker_then_still_suppressed', async () => { // AC-012
    const common = await import('../.claude/hooks/lib/common.mjs');
    const markerAt = ENVELOPE_REINVOCATION.indexOf('Base directory for this skill:');
    assert.ok(markerAt > 64, 'fixture must place the marker past the 64-char head window to reproduce D12');
    assert.equal(common.isBoilerplate(ENVELOPE_REINVOCATION), true, 'the envelope check must NOT be head-anchored — a re-invocation preamble defeated it in two live sessions');
  });

  it('test_when_pathological_block_then_predicates_bounded', async () => { // AC-001 AC-002 AC-009
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    const startedAt = process.hrtime.bigint();
    lib.isFlushReport(PATHOLOGICAL_BLOCK);
    lib.isSelfReferential(PATHOLOGICAL_BLOCK);
    lib.stripSkillEnvelope(PATHOLOGICAL_BLOCK);
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    assert.ok(elapsedMs < 1000, `predicates must be bounded, not super-linear (CWE-1333); took ${elapsedMs}ms`);
  });

  it('test_when_input_empty_or_non_string_then_predicates_false_no_throw', async () => { // AC-001 AC-002 AC-009
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    for (const bad of [...NON_STRINGS, '', '   ']) {
      assert.equal(lib.isFlushReport(bad), false, `isFlushReport(${JSON.stringify(bad)}) must be false, never throw`);
      assert.equal(lib.isSelfReferential(bad), false, `isSelfReferential(${JSON.stringify(bad)}) must be false, never throw`);
      assert.equal(lib.stripSkillEnvelope(bad), '', `stripSkillEnvelope(${JSON.stringify(bad)}) must be '', never throw`);
    }
  });
});

// ---------------------------------------------------------------------------
// Security remediation (D15). Both findings were reproduced by execution during
// /security and are recorded in docs/security/extractor-noise-and-prereq-drift-2026-07-13.md.
// ---------------------------------------------------------------------------

// A real deferral sitting in the SAME block as a PASTED doc that happens to carry
// the SOP marker. Pre-fix, isBoilerplate fires on the pasted line and the whole
// block is discarded — the deferral is lost silently, with no error and no trail.
const DEFERRAL_BESIDE_PASTED_SOP = [
  'we should also bound the slug length later — add this to backlog.',
  '',
  'Here is a doc I pasted:',
  '  Base directory for this skill: /Users/x/.claude/skills/harness',
].join('\n');

// `staged?` matched both of these. Each carries an explicit high-precision
// routing marker ("add this to backlog"), so each is unambiguously a real deferral.
const DEFERRALS_CONTAINING_STAGE = [
  'we should also stage the rollout behind a flag — add this to backlog',
  'the migration is staged; add this to backlog',
];

describe('T1 — security remediation (D15a, D15b)', () => {
  it('test_when_deferral_sits_beside_pasted_sop_marker_then_deferral_survives', async () => { // AC-016
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    const mined = lib.stripSkillEnvelope(DEFERRAL_BESIDE_PASTED_SOP);
    assert.ok(
      mined.includes('bound the slug length'),
      'a genuine deferral must survive a pasted SOP marker — stripSkillEnvelope must return the text PRECEDING the marker, not discard the whole block',
    );
    assert.ok(
      !mined.includes('Base directory for this skill:'),
      'the pasted SOP body itself must still be dropped',
    );
  });

  it('test_when_envelope_marker_at_head_and_no_arguments_then_still_empty', async () => { // AC-016 AC-002
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    // The surgical rule and the old rule AGREE here: nothing precedes a head marker,
    // so slice(0, 0) === ''. AC-002 is unchanged by the D15a fix.
    assert.equal(lib.stripSkillEnvelope(ENVELOPE_NO_ARGS), '', 'a pure envelope with no ARGUMENTS still yields nothing to mine');
  });

  it('test_when_deferral_contains_the_word_stage_then_not_self_referential', async () => { // AC-017
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    for (const deferral of DEFERRALS_CONTAINING_STAGE) {
      assert.equal(
        lib.isSelfReferential(deferral),
        false,
        `"stage"/"staged" is ordinary English and must NOT suppress a real deferral: ${deferral}`,
      );
    }
  });

  it('test_when_arguments_marker_precedes_sop_then_body_still_dropped', async () => { // AC-016 AC-002
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    // Found by the SECURITY RE-REVIEW of the D15a fix, not by the fix's own tests.
    // Honouring ANY `ARGUMENTS:` occurrence let one planted BEFORE the SOP marker
    // return the whole block — contract prose included — re-opening the very leak
    // this module exists to close. The marker must FOLLOW the SOP body.
    const smuggle = 'ARGUMENTS: harmless\nBase directory for this skill: /x\nThe fix is mechanical (implementation mismatch).';
    const mined = lib.stripSkillEnvelope(smuggle);
    assert.ok(
      !mined.includes('The fix is mechanical'),
      'an ARGUMENTS: marker planted BEFORE the SOP marker must not smuggle the contract body through',
    );
  });

  it('test_when_staged_removed_then_ac009_pair_still_holds', async () => { // AC-017 AC-009
    const lib = await import('../.claude/hooks/lib/memory_stop.mjs');
    // Narrowing the vocabulary must not break the assertion that proves the design.
    assert.equal(lib.isSelfReferential(SELF_REFERENTIAL_SENTENCE), true, 'still suppressed via "candidates"');
    assert.equal(lib.isSelfReferential(HOOK_CLAIM_SENTENCE), false, 'the sentence that created ticket T1 must still be staged');
  });
});
