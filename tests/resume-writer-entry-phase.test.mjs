// Regression test for the same stray entry-phase drift found in track_guard.mjs,
// caught in resume_writer.mjs's OWN copy of TRACK_ID_TO_ENTRY_PHASE (used to
// compute the resume snapshot's "next phase due" hint).
//
// `spec-entry` carried 'spec' instead of 'intake' here too — the resume snapshot
// would report "(unknown)" or the wrong next phase for any spec-entry workflow
// that reaches gate A, since `phases.indexOf('spec')` lands past `intake`/`scout`/
// `research` in workflow.phases and those never get flagged as next.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { composeSnapshot } from '../.claude/hooks/lib/resume_writer.mjs';
import { makeProject, writeTranscript } from './helpers/memory-fixtures.mjs';

const PHASES = ['intake', 'scout', 'research', 'spec', 'tdd', 'simplify', 'security', 'integrate', 'document', 'commit'];

function seedWorkflow(root, workflow) {
  writeFileSync(join(root, '.claude/state/workflow.json'), JSON.stringify({ phases: PHASES, ...workflow }, null, 2));
}

describe('resume_writer entry-phase resolution (consumer-defect regression)', () => {
  it('reports the next phase as scout for a spec-entry workflow with only intake completed', () => {
    const { root } = makeProject();
    const transcript = writeTranscript(root, ['do the thing']);
    seedWorkflow(root, { slug: 'demo', track_id: 'spec-entry', exceptions: ['research'], completed: ['intake'] });

    const snap = composeSnapshot({ transcript, projectDir: root, trigger: 'working' });

    assert.match(snap, /Next phase due: `scout`/, `expected 'scout' to be next after intake on spec-entry; got:\n${snap}`);
  });

  it('reports the next phase as intake for a fresh spec-entry workflow', () => {
    const { root } = makeProject();
    const transcript = writeTranscript(root, ['do the thing']);
    seedWorkflow(root, { slug: 'demo', track_id: 'spec-entry', exceptions: ['research'], completed: [] });

    const snap = composeSnapshot({ transcript, projectDir: root, trigger: 'working' });

    assert.match(snap, /Next phase due: `intake`/, snap);
  });

  it('reports the next phase as scout for an intake-full workflow with only intake completed (unaffected track, still correct)', () => {
    const { root } = makeProject();
    const transcript = writeTranscript(root, ['do the thing']);
    seedWorkflow(root, { slug: 'demo', track_id: 'intake-full', exceptions: [], completed: ['intake'] });

    const snap = composeSnapshot({ transcript, projectDir: root, trigger: 'working' });

    assert.match(snap, /Next phase due: `scout`/, snap);
  });
});
