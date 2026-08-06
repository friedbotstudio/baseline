// Domain — the README cannot outrun disk.
//
// `.claude/memory/README.md` stated "Elements gained three fields" for a corpus
// where zero of 14 elements carried any of them. A docs claim that outruns disk is
// the same honesty hazard as a wrong diagram, one level up: a reader trusts it and
// stops checking. So the correction ships with a gate rather than as an edit.
//
// The check is one-directional by design. Documenting FEWER fields than are stored
// is terseness; documenting MORE is a claim about disk that disk does not support.

import { readAll, readSourceText } from './store.mjs';

const CANDIDATE_FIELDS = ['anchor_digest', 'shard', 'granularity'];

// `granularity` sits here because readAll DERIVES it onto every record, so its
// presence would prove nothing about what the file on disk carries.
const NON_FIELD_KEYS = new Set(['id', 'kind', 'title', 'anchor', 'body', 'granularity']);

function documentedFields(specDir) {
  const text = readSourceText(specDir, 'README.md');
  if (text === null) return null;
  return CANDIDATE_FIELDS.filter((field) => text.includes(`\`${field}\``));
}

function persistedFields(specDir) {
  const persisted = new Set();
  for (const element of readAll(specDir).elements) {
    for (const name of Object.keys(element)) {
      if (!NON_FIELD_KEYS.has(name)) persisted.add(name);
    }
  }
  return persisted;
}

export function checkReadmeFields({ specDir } = {}) {
  const documented = documentedFields(specDir);
  // Fail-open on an absent README, matching every other memory consumer: a project
  // that ships no README has made no claim to contradict.
  if (documented === null) return { ok: true, overclaimed: [] };

  const persisted = persistedFields(specDir);
  const overclaimed = documented.filter((field) => !persisted.has(field));
  return { ok: overclaimed.length === 0, overclaimed };
}
