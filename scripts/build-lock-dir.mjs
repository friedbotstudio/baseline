#!/usr/bin/env node
// Derive the build mutex lock dir for a given build target dir.
//
// build-template.sh serializes concurrent builds with a mkdir-based mutex so
// `npm pack` (prepack) and other build-triggering subprocesses don't race on
// the SAME obj/template rebuild. Keying that lock on a single machine-global
// path, however, also serialized builds into DIFFERENT targets — every isolated
// tmpdir build from tests/helpers/clone-and-build.mjs blocked on one global
// lock, so the parallel test suite ran build-bound work machine-wide-serial.
//
// Keying the lock on the target dir instead lets distinct targets (isolated
// tmp PKG_ROOTs) hold independent locks and build concurrently, while the same
// target (prepack + a live-tree build both targeting REPO_ROOT/obj/template)
// still shares one lock and serializes — the original race stays fixed.
//
// The key is derived from the target path STRING, not realpath of an existing
// dir: callers pass targets that may not exist yet, and the live target is
// rm -rf'd and recreated between lock acquisitions.

import { createHash } from 'node:crypto';

const target = process.argv[2];
if (!target) {
  process.stderr.write('usage: build-lock-dir.mjs <target-dir>\n');
  process.exit(1);
}

const lockKey = createHash('sha256').update(target).digest('hex').slice(0, 16);
const tmp = process.env.TMPDIR && process.env.TMPDIR.length ? process.env.TMPDIR.replace(/\/+$/, '') : '/tmp';
process.stdout.write(`${tmp}/create-baseline-build.${lockKey}.lock.d\n`);
