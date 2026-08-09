// Key-form contract for the discard ledger.
//
// THE DEFECT, observed live on 2026-08-05: memory_stop.mjs:275 builds its dedup
// set from group 1 of /^##\s+CANDIDATE:\s*(.+?)\s*$/gm — the FULL header text —
// and :282 folds decidedKeys() into that same set. ledger.mjs:67 stores whatever
// key it is handed, verbatim. So only a key in the header form can ever suppress
// a candidate; any other string is recorded and inert.
//
// /memory-sync Step 4.5 said `key:'<candidate key>'`, a curator read that as the
// bare key, and the ledger filled with rows that match nothing. The file exists,
// so the `discard-ledger-is-inert-until-memory-sync-step-4-5-runs` landmine's
// `ls _discard-ledger.md` check reports healthy while suppression does nothing.
//
// The fix is ONE definition shared by the builder and the validator. These tests
// pin that: the shapes memory_stop actually emits must be exactly the shapes
// recordCuration accepts.
//
// RED until candidateKey/isCandidateKey exist and recordCuration guards on them.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { makeProject, readPending, tryImport } from './helpers/memory-fixtures.mjs';

const LEDGER_MODULE = '.claude/skills/memory-sync/ledger.mjs';
const STOP_MODULE = '.claude/hooks/lib/memory_stop.mjs';

// The module EXISTS; these exports do not until /implement lands. A bare named
// import would bind undefined and die as "x is not a function" — this names the
// missing export instead (scenario MEMORY.md, "asserting on named exports").
function fn(mod, name) {
  assert.equal(
    typeof mod?.[name],
    'function',
    `expected named export \`${name}\` to be a function in ${LEDGER_MODULE}`,
  );
  return mod[name];
}

const BARE_KEY = '.claude/skills/workspace/annotations.mjs';
const HEADER_KEY = '.claude/skills/workspace/annotations.mjs → landmarks.md';
const BACKLOG_KEY = 'backlog → some-intent-slug-1a2b';
const INTENT_LINE = 'We should extract the canonical category list into one module later.';

function ledgerRows(root) {
  const path = join(root, '.claude', 'memory', '_discard-ledger.md');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => /^-\s+(promoted|discarded)\s+::/.test(line));
}

// writeTranscript() emits user text only, which yields a backlog candidate but
// never a landmark one — landmarks come from tool_use Write/Edit blocks. Local
// rather than a memory-fixtures export: that module is already past the ~80-line
// code-structure ceiling (scenario MEMORY.md).
function writeMixedTranscript(root, filePath) {
  const path = join(root, 'transcript.jsonl');
  const events = [
    { uuid: 'u1', message: { role: 'user', content: [{ type: 'text', text: INTENT_LINE }] } },
    { uuid: 'a1', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Write', input: { file_path: filePath } }] } },
  ];
  writeFileSync(path, events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  return path;
}

describe('discard ledger — candidate key form', () => {
  it('test_when_key_lacks_candidate_separator_then_record_curation_rejects', async () => {
    const project = makeProject();
    try {
      const ledger = await tryImport(LEDGER_MODULE);
      assert.ok(ledger, `${LEDGER_MODULE} must exist and be importable`);
      const recordCuration = fn(ledger, 'recordCuration');

      // Control: proves the writer works here, so the assertion below cannot
      // pass vacuously on a ledger that was never writable in the first place.
      assert.equal(
        recordCuration({ key: HEADER_KEY, disposition: 'discarded' }, { rootDir: project.root }),
        true,
        'control: a well-formed key records',
      );
      assert.equal(ledgerRows(project.root).length, 1, 'control: exactly one row on disk');

      const wrote = recordCuration({ key: BARE_KEY, disposition: 'discarded' }, { rootDir: project.root });

      assert.equal(
        wrote,
        false,
        'a key with no " → <target>" separator can never match the header form memory_stop dedups against, so recording it silently suppresses nothing and must be refused',
      );
      assert.equal(
        ledgerRows(project.root).length,
        1,
        'a refused key must leave no row behind — an inert row is worse than none, it reads as a decision that was recorded',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_key_is_full_candidate_header_then_record_curation_records', async () => {
    const project = makeProject();
    try {
      const ledger = await tryImport(LEDGER_MODULE);
      assert.ok(ledger, `${LEDGER_MODULE} must exist and be importable`);
      const isCandidateKey = fn(ledger, 'isCandidateKey');
      const recordCuration = fn(ledger, 'recordCuration');

      assert.equal(isCandidateKey(HEADER_KEY), true, 'the landmark header form is the canonical shape');
      assert.equal(
        recordCuration({ key: HEADER_KEY, disposition: 'discarded' }, { rootDir: project.root }),
        true,
        'the shape memory_stop emits must be the shape the ledger accepts',
      );
      assert.ok(
        ledger.decidedKeys({ rootDir: project.root }).has(HEADER_KEY),
        'the recorded key must land in the suppression set verbatim — decidedKeys feeds memory_stop directly',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_backlog_candidate_header_then_record_curation_records', async () => {
    const project = makeProject();
    try {
      const ledger = await tryImport(LEDGER_MODULE);
      assert.ok(ledger, `${LEDGER_MODULE} must exist and be importable`);
      const isCandidateKey = fn(ledger, 'isCandidateKey');
      const recordCuration = fn(ledger, 'recordCuration');

      assert.equal(
        isCandidateKey(BACKLOG_KEY),
        true,
        'the backlog shape carries a slug on the right, not a *.md target — the predicate keys on the separator, never on a .md suffix',
      );
      assert.equal(
        recordCuration({ key: BACKLOG_KEY, disposition: 'discarded' }, { rootDir: project.root }),
        true,
        'backlog candidates are the most frequently curated kind; rejecting them would break the common path',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_memory_stop_builds_keys_then_every_key_satisfies_is_candidate_key', async () => {
    const project = makeProject();
    try {
      const ledger = await tryImport(LEDGER_MODULE);
      assert.ok(ledger, `${LEDGER_MODULE} must exist and be importable`);
      const stop = await tryImport(STOP_MODULE);
      assert.ok(stop, `${STOP_MODULE} must be importable`);
      const isCandidateKey = fn(ledger, 'isCandidateKey');
      const recordCuration = fn(ledger, 'recordCuration');

      const transcript = writeMixedTranscript(project.root, join(project.root, '.claude/skills/demo/widget.mjs'));
      stop.runMemoryStop({ transcript, pending: project.pending, projectRoot: project.root });

      const keys = [...readPending(project.pending).matchAll(/^##\s+CANDIDATE:\s*(.+?)\s*$/gm)].map((m) => m[1]);

      assert.ok(
        keys.length >= 2,
        `precondition: the transcript must yield both a landmark and a backlog candidate so this covers both key shapes, got ${JSON.stringify(keys)}`,
      );

      for (const key of keys) {
        assert.equal(
          isCandidateKey(key),
          true,
          `memory_stop emitted ${JSON.stringify(key)} but the ledger's validator rejects it — the builder and the validator have drifted apart, which is the whole failure this shares one definition to prevent`,
        );
        assert.equal(
          recordCuration({ key, disposition: 'discarded' }, { rootDir: project.root }),
          true,
          `recordCuration must accept every key memory_stop builds; it refused ${JSON.stringify(key)}`,
        );
      }
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });

  it('test_when_key_contains_newline_then_still_rejected', async () => {
    // REGRESSION TRAP — green before /implement by design. recordCuration already
    // rejects /[\r\n]/ because the ledger is line-delimited, so a newline key
    // forges a second row and permanently silences an unrelated candidate
    // (security review F-3). The new key-form guard must sit ALONGSIDE that
    // check, never replace it.
    const project = makeProject();
    try {
      const ledger = await tryImport(LEDGER_MODULE);
      assert.ok(ledger, `${LEDGER_MODULE} must exist and be importable`);
      const recordCuration = fn(ledger, 'recordCuration');

      const forgedTarget = 'victim → landmarks.md';
      const forged = `a → b\n- promoted :: ${forgedTarget}`;

      assert.equal(
        recordCuration({ key: HEADER_KEY, disposition: 'discarded' }, { rootDir: project.root }),
        true,
        'control: the writer works, so the row count below is meaningful',
      );

      assert.equal(
        recordCuration({ key: forged, disposition: 'discarded' }, { rootDir: project.root }),
        false,
        'a key carrying a newline must stay refused (security review F-3)',
      );
      assert.equal(ledgerRows(project.root).length, 1, 'the forged second row must never reach disk');
      assert.equal(
        ledger.decidedKeys({ rootDir: project.root }).has(forgedTarget),
        false,
        'a forged key would permanently silence an unrelated future candidate',
      );
    } finally {
      rmSync(project.root, { recursive: true, force: true });
    }
  });
});
