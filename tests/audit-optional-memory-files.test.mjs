// Ticket discard-ledger-audit-allowance.
//
// `/memory-sync` Step 4.5 creates `.claude/memory/_discard-ledger.md` at runtime.
// `scripts/build-template.sh` deliberately excludes it from the shipped template,
// so a fresh install starts without it and grows it on the first flush. The flat
// branch of checks/memory.mjs treats every `.md` outside EXPECTED_MEMORY_FILES as
// an unexpected file, so that first flush turned the audit red permanently in
// every consumer install. The shipped template's memory store is flat, so this is
// the branch every install runs; this dev repo migrated to the sharded shape,
// which never walks loose files, which is why the suite stayed green.
//
// The file is ALLOWED, never EXPECTED: adding it to EXPECTED_MEMORY_FILES would
// swap the `unexpected` failure for a `missing` one on a store that has not
// flushed yet. That is what the optional roster is for.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { REPO_ROOT, makeProject, tryImport, CANONICAL_CATEGORIES } from './helpers/memory-fixtures.mjs';

const CONTEXT = '.claude/skills/audit-baseline/checks/context.mjs';
const MEMORY_CHECK = '.claude/skills/audit-baseline/checks/memory.mjs';
const EXPECTED_BASELINE = '.claude/skills/audit-baseline/expected-baseline.mjs';
const LEDGER = '.claude/skills/memory-sync/ledger.mjs';
const SESSION_START_LIB = '.claude/hooks/lib/memory_session_start.mjs';
const PRESENCE_ROW = 'memory files present';

const PREAMBLE = '---\nsize-cap: 500\n---\n\n';

// A flat store — the shape `scripts/build-template.sh` ships and every fresh
// install therefore audits. Sharded stores take the other branch entirely.
function seedFlatStore(memDir, extraFiles = []) {
  mkdirSync(memDir, { recursive: true });
  for (const category of CANONICAL_CATEGORIES) {
    writeFileSync(join(memDir, `${category}.md`), PREAMBLE, 'utf8');
  }
  for (const trail of ['_pending', '_resume', '_thread']) {
    writeFileSync(join(memDir, `${trail}.md`), PREAMBLE, 'utf8');
  }
  writeFileSync(join(memDir, 'README.md'), '# memory\n', 'utf8');
  for (const name of extraFiles) {
    writeFileSync(join(memDir, name), PREAMBLE, 'utf8');
  }
}

async function memoryRows(root) {
  const contextMod = await tryImport(CONTEXT);
  const checkMod = await tryImport(MEMORY_CHECK);
  assert.ok(contextMod, `${CONTEXT} must be importable`);
  assert.ok(checkMod, `${MEMORY_CHECK} must be importable`);
  return checkMod.run(contextMod.buildContext({ root, skipHashCheck: true }));
}

async function presenceRow(root) {
  const row = (await memoryRows(root)).find(([name]) => name === PRESENCE_ROW);
  assert.ok(row, `the memory check must emit a "${PRESENCE_ROW}" row on a flat store`);
  return row;
}

describe('D1 — the runtime discard ledger is allowed in a flat store', () => {
  it('test_when_a_flat_store_carries_the_discard_ledger_then_the_audit_passes', async () => {
    const { root, memDir } = makeProject();
    seedFlatStore(memDir, ['_discard-ledger.md']);

    const [, status, detail] = await presenceRow(root);

    assert.equal(
      status,
      'PASS',
      `the first /memory-sync in a consumer install creates _discard-ledger.md, so a FAIL here is permanent for that install; got: ${detail}`,
    );
  });

  it('test_when_a_flat_store_has_never_flushed_then_the_ledger_is_not_demanded', async () => {
    const { root, memDir } = makeProject();
    seedFlatStore(memDir);

    const [, status, detail] = await presenceRow(root);

    assert.equal(
      status,
      'PASS',
      `the ledger is created lazily and is excluded from the shipped template, so demanding it would fail every install that has not flushed yet; got: ${detail}`,
    );
  });

  it('test_when_a_flat_store_carries_an_unknown_file_then_the_audit_still_fails', async () => {
    const { root, memDir } = makeProject();
    seedFlatStore(memDir, ['_scratch.md']);

    const [, status, detail] = await presenceRow(root);

    assert.equal(status, 'FAIL', 'widening the allowance must not disable the unexpected-file check itself');
    assert.match(detail, /_scratch/, 'the failure must name the file it rejected');
  });

  it('test_when_the_ledger_is_present_then_its_shape_is_not_preamble_checked', async () => {
    const { root, memDir } = makeProject();
    seedFlatStore(memDir);
    // The real ledger is a plain markdown table with no frontmatter — the shape
    // the canonical categories are checked for does not apply to it.
    writeFileSync(join(memDir, '_discard-ledger.md'), '# discard ledger\n\n| key | disposition |\n', 'utf8');

    const rows = await memoryRows(root);

    assert.ok(
      !rows.some(([name, status]) => name === 'memory shape: _discard-ledger.md' && status === 'FAIL'),
      'the ledger is a session trail like _pending and _thread, not a canonical entry file with frontmatter',
    );
  });
});

describe('D2 — the two oracles name the same file', () => {
  it('test_when_the_rosters_are_read_then_the_ledger_is_optional_not_expected', async () => {
    const baseline = await tryImport(EXPECTED_BASELINE);
    assert.ok(baseline, `${EXPECTED_BASELINE} must be importable`);

    assert.ok(
      baseline.OPTIONAL_MEMORY_FILES instanceof Set,
      'expected-baseline.mjs must export OPTIONAL_MEMORY_FILES — files the store may carry but need not',
    );
    assert.ok(
      baseline.OPTIONAL_MEMORY_FILES.has('_discard-ledger'),
      'the runtime-created ledger belongs on the optional roster',
    );
    assert.ok(
      !baseline.EXPECTED_MEMORY_FILES.has('_discard-ledger'),
      'EXPECTED means required-present; the ledger does not exist until the first flush',
    );
    for (const name of baseline.OPTIONAL_MEMORY_FILES) {
      assert.ok(
        !baseline.CANONICAL_MEMORY_FILES.has(name),
        `${name} must not reach CANONICAL_MEMORY_FILES — that roster feeds deriveCounts().memoryFiles, which is compared against disk`,
      );
    }
  });

  it('test_when_the_ledger_writer_moves_then_the_optional_roster_follows', async () => {
    // The defect was two components disagreeing about one filename. Pin the
    // audit's roster entry to the path the writer actually opens, so renaming
    // one without the other fails here instead of in a consumer install.
    const source = readFileSync(join(REPO_ROOT, LEDGER), 'utf8');
    const written = source.match(/'([A-Za-z0-9_-]+)\.md'/g) || [];

    assert.ok(
      written.some((literal) => literal === "'_discard-ledger.md'"),
      `${LEDGER} must still write the filename the audit's optional roster allows`,
    );
  });
});

describe('D3 — the shipped pre-commit hook can be extended', () => {
  it('test_when_the_shipped_hook_is_read_then_it_does_not_exec_the_gitleaks_check', () => {
    const hook = readFileSync(join(REPO_ROOT, '.githooks', 'pre-commit'), 'utf8');

    assert.ok(
      /require-gitleaks\.sh/.test(hook),
      'the hook must still run the gitleaks check — this widens how it is invoked, not whether',
    );
    assert.ok(
      !/^\s*exec\s+/m.test(hook),
      'the hook ships as a template consumers append their own checks to; exec replaces the shell, so every appended check is silently skipped',
    );
    assert.match(
      hook,
      /set -euo pipefail/,
      'a plain call only aborts the commit on failure because set -e is in force',
    );
  });
});

// ---------------------------------------------------------------------------
// D4 — found while running the suite for this ticket, not part of the reported
// install failure. `npm test` is red at HEAD on this repo: the SessionStart
// injection measured 4097 characters against a 4096 budget. Nothing committed
// caused it — the injected text carries staleness counts derived from today's
// date, so the payload grows on its own until it crosses the ceiling and the
// re-clamp runs for the first time.
//
// `envelopeWithin` shrinks the inner text by the exact overage it measured, on
// the stated assumption that shrinking text never grows the envelope. Shrinking
// via `clampTo` appends a truncation notice, and JSON escaping turns each of the
// notice's newlines into two characters, so one pass can land back over the
// limit. A property sweep is used rather than one crafted string because the
// overshoot depends on where the newlines fall.

describe('D4 — the SessionStart envelope never exceeds its budget', () => {
  it('test_when_any_limit_is_applied_then_the_envelope_fits_it', async () => {
    const mod = await tryImport(SESSION_START_LIB);
    assert.ok(mod, `${SESSION_START_LIB} must be importable`);
    assert.equal(
      typeof mod.envelopeWithin,
      'function',
      'envelopeWithin must be exported so its budget invariant is testable without a live memory store',
    );

    // Lines of mixed width so the newline positions the clamp cuts on vary.
    const text = Array.from({ length: 400 }, (_, i) => `- row ${i} ${'x'.repeat(i % 37)}`).join('\n');

    const violations = [];
    for (let limit = 200; limit <= 4200; limit += 1) {
      const envelope = mod.envelopeWithin(text, limit);
      if (envelope.length > limit) violations.push({ limit, got: envelope.length });
    }

    assert.deepEqual(
      violations.slice(0, 5),
      [],
      'the hook writes this envelope straight into the session context, so exceeding the limit by even one character is the whole failure',
    );
  });

  it('test_when_the_text_already_fits_then_it_is_returned_unclamped', async () => {
    const mod = await tryImport(SESSION_START_LIB);
    assert.ok(mod, `${SESSION_START_LIB} must be importable`);
    const text = 'a short index\nwith two lines';

    const envelope = mod.envelopeWithin(text, 4096);

    assert.equal(
      JSON.parse(envelope).hookSpecificOutput.additionalContext,
      text,
      'a payload under budget must not be truncated — the re-clamp is for overflow only',
    );
  });
});

// D5 — the character that actually turned the suite red. The budget is declared
// as a property of what the hook WRITES, and the hook writes the envelope plus a
// newline, but only the envelope was measured against it. The two ends lived in
// different files and disagreed, the same shape as D2.
describe('D5 — the trailing newline is inside the budget', () => {
  it('test_when_the_hook_writes_the_envelope_then_it_appends_exactly_the_reserved_bytes', async () => {
    const mod = await tryImport(SESSION_START_LIB);
    assert.ok(mod, `${SESSION_START_LIB} must be importable`);
    const hook = readFileSync(join(REPO_ROOT, '.claude', 'hooks', 'memory_session_start.mjs'), 'utf8');

    const write = hook.match(/process\.stdout\.write\(context \+ '((?:\\n|.)*?)'\)/);
    assert.ok(write, 'the hook must still write the built context to stdout in one call');

    assert.equal(
      write[1].replace(/\\n/g, '\n').length,
      mod.STDOUT_NEWLINE,
      'the reserve the builder holds back must equal what the hook actually appends — measuring only the envelope is what put stdout one character over',
    );
  });

  it('test_when_the_payload_overflows_then_the_envelope_leaves_room_for_the_newline', async () => {
    const mod = await tryImport(SESSION_START_LIB);
    assert.ok(mod, `${SESSION_START_LIB} must be importable`);
    const { root, memDir } = makeProject();
    seedFlatStore(memDir);
    // Many short lines: JSON escaping doubles every newline, so this overflows
    // the envelope while the raw text is still well under budget — the state in
    // which the re-clamp runs and the accounting matters.
    writeFileSync(
      join(memDir, '_thread.md'),
      ['# Conversation thread trail', '', '## SHELVED 2026-08-26T00:00:00Z · trigger:working · span:start..now', '', '### Verbatim cues']
        .concat(Array.from({ length: 900 }, () => '> a'))
        .join('\n'),
      'utf8',
    );

    const envelope = mod.buildIndex({ memDir, projectRoot: root, sessionSource: 'startup' });

    assert.ok(
      envelope.includes('thread section truncated'),
      'the fixture must actually exhaust the budget, otherwise this asserts nothing',
    );
    assert.ok(
      envelope.length + mod.STDOUT_NEWLINE <= mod.SESSION_START_BUDGET,
      `the hook writes ${envelope.length} + ${mod.STDOUT_NEWLINE} characters against a ${mod.SESSION_START_BUDGET} budget`,
    );
  });
});
