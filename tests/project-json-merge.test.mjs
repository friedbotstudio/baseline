// Structural 3-way merge for .claude/project.json.
//
// Per src/cli/project-json-merge.js header: leaf fields where local equals
// base receive incoming's value; user-customized fields preserve local; new
// fields in incoming are added; user-removed fields stay removed.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  structuralMerge3Way,
  computeMergedProjectJson,
  mergeProjectJsonFile,
} from '../src/cli/project-json-merge.js';

describe('structuralMerge3Way (pure)', () => {
  it('when local equals base on a leaf field, takes incoming value', () => {
    const base     = { test: { cmd: 'old-cmd' } };
    const incoming = { test: { cmd: 'new-cmd-with-flag' } };
    const local    = { test: { cmd: 'old-cmd' } };
    const merged   = structuralMerge3Way(base, incoming, local);
    assert.equal(merged.test.cmd, 'new-cmd-with-flag');
  });

  it('when local differs from base on a leaf field, keeps local (user customized)', () => {
    const base     = { test: { cmd: 'old-cmd' } };
    const incoming = { test: { cmd: 'new-cmd' } };
    const local    = { test: { cmd: 'my-custom-cmd' } };
    const merged   = structuralMerge3Way(base, incoming, local);
    assert.equal(merged.test.cmd, 'my-custom-cmd');
  });

  it('adds new fields introduced by incoming', () => {
    const base     = { test: { cmd: 'x' } };
    const incoming = { test: { cmd: 'x' }, newSection: { knob: 42 } };
    const local    = { test: { cmd: 'x' } };
    const merged   = structuralMerge3Way(base, incoming, local);
    assert.deepEqual(merged.newSection, { knob: 42 });
  });

  it('preserves user-added fields not present in base or incoming', () => {
    const base     = { a: 1 };
    const incoming = { a: 1 };
    const local    = { a: 1, userKnob: 'added' };
    const merged   = structuralMerge3Way(base, incoming, local);
    assert.equal(merged.userKnob, 'added');
  });

  it('respects user removal: key in base+incoming, missing in local → stays removed', () => {
    const base     = { keepable: 'baseline-value' };
    const incoming = { keepable: 'baseline-new-value' };
    const local    = {};
    const merged   = structuralMerge3Way(base, incoming, local);
    assert.equal(Object.prototype.hasOwnProperty.call(merged, 'keepable'), false);
  });

  it('drops keys removed upstream when user never customized', () => {
    const base     = { removable: 'baseline' };
    const incoming = {};
    const local    = { removable: 'baseline' };
    const merged   = structuralMerge3Way(base, incoming, local);
    assert.equal(Object.prototype.hasOwnProperty.call(merged, 'removable'), false);
  });

  it('arrays are atomic — equal local/base → take incoming', () => {
    const base     = { globs: ['a', 'b'] };
    const incoming = { globs: ['a', 'b', 'c'] };
    const local    = { globs: ['a', 'b'] };
    const merged   = structuralMerge3Way(base, incoming, local);
    assert.deepEqual(merged.globs, ['a', 'b', 'c']);
  });

  it('arrays are atomic — local differs → keep local', () => {
    const base     = { globs: ['a', 'b'] };
    const incoming = { globs: ['a', 'b', 'c'] };
    const local    = { globs: ['a', 'b', 'user-added'] };
    const merged   = structuralMerge3Way(base, incoming, local);
    assert.deepEqual(merged.globs, ['a', 'b', 'user-added']);
  });

  it('null values handled correctly (lint.cmd starts as null)', () => {
    const base     = { lint: { cmd: null } };
    const incoming = { lint: { cmd: null } };
    const local    = { lint: { cmd: 'eslint .' } };
    const merged   = structuralMerge3Way(base, incoming, local);
    assert.equal(merged.lint.cmd, 'eslint .');
  });

  it('recurses through nested objects', () => {
    const base = {
      test: { cmd: 'old', timeout_seconds: 60 },
      lint: { cmd: null, timeout_seconds: 30 },
    };
    const incoming = {
      test: { cmd: 'new', timeout_seconds: 120 },
      lint: { cmd: null, timeout_seconds: 30 },
    };
    const local = {
      test: { cmd: 'old', timeout_seconds: 999 },
      lint: { cmd: 'eslint', timeout_seconds: 30 },
    };
    const merged = structuralMerge3Way(base, incoming, local);
    assert.equal(merged.test.cmd, 'new');                  // local==base, take incoming
    assert.equal(merged.test.timeout_seconds, 999);        // user customized
    assert.equal(merged.lint.cmd, 'eslint');               // user customized
    assert.equal(merged.lint.timeout_seconds, 30);         // unchanged everywhere
  });
});

describe('mergeProjectJsonFile (file I/O)', () => {
  it('updates default test.cmd when user never customized', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pjm-'));
    const basePath = join(dir, 'base.json');
    const incomingPath = join(dir, 'incoming.json');
    const localPath = join(dir, 'local.json');
    await writeFile(basePath,     JSON.stringify({ test: { cmd: 'bash audit.sh' } }));
    await writeFile(incomingPath, JSON.stringify({ test: { cmd: 'bash audit.sh --file={file}' } }));
    await writeFile(localPath,    JSON.stringify({ test: { cmd: 'bash audit.sh' } }));

    const result = await mergeProjectJsonFile({ basePath, incomingPath, localPath });
    assert.equal(result.wrote, true);
    const after = JSON.parse(await readFile(localPath, 'utf8'));
    assert.equal(after.test.cmd, 'bash audit.sh --file={file}');
  });

  it('preserves customized test.cmd', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pjm-'));
    const basePath = join(dir, 'base.json');
    const incomingPath = join(dir, 'incoming.json');
    const localPath = join(dir, 'local.json');
    await writeFile(basePath,     JSON.stringify({ test: { cmd: 'bash audit.sh' } }));
    await writeFile(incomingPath, JSON.stringify({ test: { cmd: 'bash audit.sh --file={file}' } }));
    await writeFile(localPath,    JSON.stringify({ test: { cmd: 'pytest -x' } }));

    const result = await mergeProjectJsonFile({ basePath, incomingPath, localPath });
    const after = JSON.parse(await readFile(localPath, 'utf8'));
    assert.equal(after.test.cmd, 'pytest -x');
  });

  it('writes nothing when merged output equals existing (NOOP)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pjm-'));
    const basePath = join(dir, 'base.json');
    const incomingPath = join(dir, 'incoming.json');
    const localPath = join(dir, 'local.json');
    const content = JSON.stringify({ test: { cmd: 'x' } }, null, 2) + '\n';
    await writeFile(basePath, content);
    await writeFile(incomingPath, content);
    await writeFile(localPath, content);

    const result = await mergeProjectJsonFile({ basePath, incomingPath, localPath });
    assert.equal(result.wrote, false);
  });

  it('preserves local when BASE unavailable (safe fallback)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pjm-'));
    const incomingPath = join(dir, 'incoming.json');
    const localPath = join(dir, 'local.json');
    await writeFile(incomingPath, JSON.stringify({ test: { cmd: 'new' } }));
    await writeFile(localPath,    JSON.stringify({ test: { cmd: 'user-set' } }));

    const result = await mergeProjectJsonFile({
      basePath: join(dir, 'NONEXISTENT.json'),
      incomingPath,
      localPath,
    });
    assert.equal(result.wrote, false);
    assert.equal(result.baseUnavailable, true);
    const after = JSON.parse(await readFile(localPath, 'utf8'));
    assert.equal(after.test.cmd, 'user-set');
  });
});

describe('computeMergedProjectJson (pure file read; in-memory result)', () => {
  it('returns incoming verbatim when local file is absent (fresh install case)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pjm-'));
    const basePath = join(dir, 'base.json');
    const incomingPath = join(dir, 'incoming.json');
    const incomingText = JSON.stringify({ configured: false }, null, 2) + '\n';
    await writeFile(basePath, '{}');
    await writeFile(incomingPath, incomingText);

    const result = await computeMergedProjectJson({
      basePath,
      incomingPath,
      localPath: join(dir, 'DOES_NOT_EXIST.json'),
    });
    assert.equal(result.existing, null);
    assert.equal(result.merged, incomingText);
  });
});
