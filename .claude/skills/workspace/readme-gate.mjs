// Domain — the README cannot outrun disk.
//
// `.claude/memory/README.md` stated "Elements gained three fields" for a corpus
// where zero of 14 elements carried any of them. A docs claim that outruns disk is
// the same honesty hazard as a wrong diagram, one level up: a reader trusts it and
// stops checking. So the correction ships with a gate rather than as an edit.
//
// The FIELD check is one-directional by design. Documenting FEWER fields than are
// stored is terseness; documenting MORE is a claim about disk that disk does not
// support.
//
// The COUNT check below is deliberately BIDIRECTIONAL, and the asymmetry is the
// point. A count has no terseness reading: the shipped table claimed 112 elements
// and 112 shards against a corpus holding 114 of each, and an overstatement would
// have been just as false. Do not "fix" the two checks into symmetry — the field
// rule does not generalise to a number.

import { listWorkspaceFiles, readAll, readSourceText } from './store.mjs';

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

// A README row claims a count when its first cell is a backticked directory name
// and its last is an integer — `| \`elements/\` | ... | 114 |`. Any other line is
// prose and claims nothing. The character class is also what makes a directory
// name safe to join: it admits no `/` and no `.`, so no row can escape specDir.
const COUNT_ROW = /^\|\s*`([a-z0-9_-]+)\/`\s*\|[^|]*\|\s*(\d+)\s*\|\s*$/;

// The corpus stores exactly two formats: records are `.md`, shards are `.puml`.
// Reading the count through listWorkspaceFiles is what keeps this module free of
// node:fs of its own, the same property store.mjs preserves for shards.mjs.
const RECORD_EXTENSION = '.md';
const DIRECTORY_EXTENSION = { diagrams: '.puml' };

function documentedCounts(specDir) {
  const text = readSourceText(specDir, 'README.md');
  if (text === null) return null;
  const claims = [];
  for (const line of text.split('\n')) {
    const row = COUNT_ROW.exec(line);
    if (row) claims.push({ directory: row[1], documented: Number(row[2]) });
  }
  return claims;
}

function storedCount(specDir, directory) {
  const extension = DIRECTORY_EXTENSION[directory] ?? RECORD_EXTENSION;
  return listWorkspaceFiles(specDir, directory, extension).length;
}

export function checkReadmeCounts({ specDir } = {}) {
  const documented = documentedCounts(specDir);
  // Fail-open on an absent README, exactly as the field check does. A README
  // carrying no count rows lands here as an empty list and passes for the same
  // reason: nothing was claimed.
  if (documented === null) return { ok: true, mismatched: [] };

  const mismatched = documented
    .map((claim) => ({ ...claim, actual: storedCount(specDir, claim.directory) }))
    .filter((claim) => claim.documented !== claim.actual);
  return { ok: mismatched.length === 0, mismatched };
}
