// Orchestration — the front door to the memory-index helpers.
//
// `assert-writable` reports the refusal REASON rather than a bare boolean. An
// unreachable entry and a malformed one both fail, and a caller that cannot tell
// them apart fixes the wrong thing.

import { join } from 'node:path';

import { dispatch, lines } from '../lib/argv.mjs';
import { writeConstraint } from './constraints.mjs';
import { assertWritable, isReachable } from './resolve.mjs';

const STATES = { true: true, false: false };

function memDir({ flags, root }) {
  return flags['mem-dir'] ?? join(root, '.claude/memory');
}

function parseEntry(raw) {
  if (!raw) throw new Error('assert-writable needs a JSON entry object');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`assert-writable: entry must be valid JSON — ${error.message}`);
  }
}

function assertEntryWritable(ctx) {
  const entry = parseEntry(ctx.positional[0]);
  assertWritable(entry);
  return {
    data: { writable: true, reachable: isReachable(entry) },
    text: lines(['writable: yes', `reachable: ${isReachable(entry)}`]),
  };
}

function constraint(ctx) {
  const { key, state, governs } = ctx.flags;
  if (!key) throw new Error('constraint needs --key');
  if (!(String(state) in STATES)) {
    throw new Error(`constraint: --state must be true or false; got ${JSON.stringify(state)}`);
  }
  if (!governs) throw new Error('constraint needs --governs');
  const written = writeConstraint(memDir(ctx), key, {
    state: STATES[String(state)],
    state_verified_at: ctx.flags['verified-at'] ?? 'unverified',
    governs,
  });
  return { data: { key, written }, text: lines([`wrote constraint ${key}`]) };
}

dispatch({
  name: 'memory-index',
  subcommands: {
    'assert-writable': { summary: 'refuse an unreachable or malformed entry, with the reason', run: assertEntryWritable },
    constraint: { summary: 'write a constraint entry (--key, --state, --governs)', run: constraint },
  },
});
