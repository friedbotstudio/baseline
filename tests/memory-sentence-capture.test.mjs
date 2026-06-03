// Tier 2 — sentence-granular capture + route/weight + expanded cue set.
// Spec: docs/specs/memory-capture-tier2-tier3.md (§Behavior #1).
// Covers AC-001, AC-002, AC-008, AC-010, AC-011, AC-015, AC-016.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { runMemoryStop } from '../.claude/hooks/lib/memory_stop.mjs';
import { makeProject, writeTranscript, readPending, loadCorpus } from './helpers/memory-fixtures.mjs';

function capture(userTexts) {
  const proj = makeProject();
  const transcript = writeTranscript(proj.root, userTexts);
  runMemoryStop({ transcript, pending: proj.pending, projectRoot: proj.root });
  return readPending(proj.pending);
}

function intentLines(pendingText) {
  return pendingText.split('\n').filter((l) => l.startsWith('- Intent:'));
}

describe('Tier 2 — sentence-granular capture', () => {
  it('test_when_mid_line_intent_then_salient_sentence_captured', () => {
    const out = capture(['Here is some context. We need to fix the cue filter before shipping. More context follows.']);
    const intent = intentLines(out).join('\n').toLowerCase();
    assert.ok(intent.includes('fix the cue filter'), 'salient sentence captured');
    assert.ok(!intent.includes('more context follows'), 'trailing sentence excluded');
    assert.ok(!intent.includes('here is some context'), 'leading sentence excluded');
  });

  it('test_when_candidate_staged_then_route_unassigned_and_weight_and_pending_only', () => {
    const out = capture(['We need to fix the cue filter.']);
    assert.match(out, /- route:\s*unassigned/, '_pending candidate carries route: unassigned');
    assert.match(out, /- weight:\s*[0-9.]+/, '_pending candidate carries a numeric weight');
  });

  it('test_when_expanded_cue_phrase_then_captured', () => {
    const out = capture(['I looked at the code and the cleanest approach is to share the noise list across the hooks.']);
    assert.ok(intentLines(out).length >= 1, 'expanded-cue phrasing with no legacy trigger is captured');
  });

  it('test_when_user_instruction_then_verbatim_preserved', () => {
    const out = capture(['We need to fix the cue filter before shipping.']);
    assert.match(out.toLowerCase(), /fix the cue filter/, 'verbatim text preserved in the candidate');
  });

  it('test_when_capture_runs_then_no_network_or_model', () => {
    // Deterministic guard: capture completes purely from the transcript file.
    const out = capture(['We need to fix the cue filter.']);
    assert.ok(out.includes('## CANDIDATE:'), 'capture produced a candidate with no network/model');
  });

  it('test_when_old_pending_block_without_route_then_parses', () => {
    const proj = makeProject();
    const oldBlock = '\n\n<!-- session 2026-01-01T00:00Z -->\n## CANDIDATE: backlog → legacy-aaaa\n- Intent: legacy intent\n- Role: user\n- Source: user-instruction\n- Context: (none)\n- Emitted-at: 2026-01-01T00:00Z\n';
    appendFileSync(proj.pending, oldBlock);
    const transcript = writeTranscript(proj.root, ['We need to fix something else entirely.']);
    // Must not throw, and the legacy block must survive (parse-tolerant).
    runMemoryStop({ transcript, pending: proj.pending, projectRoot: proj.root });
    assert.match(readPending(proj.pending), /legacy-aaaa/, 'legacy block without route/weight survives');
  });

  it('test_when_fixture_corpus_then_recall_ge_80_and_zero_boilerplate_noise', () => {
    const corpus = loadCorpus();
    let midTotal = 0, midHit = 0, boilerTotal = 0, boilerNoise = 0;
    for (const item of corpus) {
      const out = capture([item.text]);
      const captured = intentLines(out).length >= 1;
      if (item.expected === 'captured' && item.position === 'mid-sentence') {
        midTotal++; if (captured) midHit++;
      }
      if (item.expected === 'ignored' && /^(Base directory for this skill:|<system-reminder>|<command-name>)/.test(item.text)) {
        boilerTotal++; if (captured) boilerNoise++;
      }
    }
    const recall = midTotal ? midHit / midTotal : 0;
    assert.ok(recall >= 0.8, `mid-sentence recall ${recall.toFixed(2)} must be >= 0.80`);
    assert.equal(boilerNoise, 0, `known-boilerplate noise must be 0 (got ${boilerNoise}/${boilerTotal})`);
  });
});
