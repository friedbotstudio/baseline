// Domain: validate a sprint manifest against the feature schema.
// A feature is complete-shaped when it carries id, priority, done_record,
// a non-empty edge_tests array, and a wiring_test. Duplicate ids are invalid.

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function featureErrors(feature) {
  const errors = [];
  if (!isNonEmptyString(feature?.id)) errors.push({ field: 'id', reason: 'id must be a non-empty string' });
  if (!isNonEmptyString(feature?.priority)) errors.push({ field: 'priority', reason: 'priority must be a non-empty string' });
  if (!isNonEmptyString(feature?.done_record)) errors.push({ field: 'done_record', reason: 'done_record must be a non-empty string' });
  if (!isNonEmptyArray(feature?.edge_tests)) errors.push({ field: 'edge_tests', reason: 'edge_tests must be a non-empty array' });
  if (!isNonEmptyString(feature?.wiring_test)) errors.push({ field: 'wiring_test', reason: 'wiring_test must be a non-empty string' });
  return errors;
}

export function validateManifest(manifest) {
  const features = Array.isArray(manifest?.features) ? manifest.features : [];
  const errors = [];
  const seen = new Set();
  for (const feature of features) {
    const id = feature?.id;
    const label = isNonEmptyString(id) ? id : '(unknown)';
    for (const e of featureErrors(feature)) {
      errors.push({ feature: label, field: e.field, reason: e.reason });
    }
    if (isNonEmptyString(id)) {
      if (seen.has(id)) errors.push({ feature: id, field: 'id', reason: `duplicate feature id: ${id}` });
      seen.add(id);
    }
  }
  return { valid: errors.length === 0, errors };
}

// ─── entry point (spec dispatcher-sweep, Pattern B) ───
//
// The inline block read the file, called validateManifest, branched on `valid`, and
// wrote its own error formatting — four steps a SOP reader had to reproduce. Only
// the middle one is this module's job; the rest belongs to its front door.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, resolve } from 'node:path';

const USAGE = `usage: node .claude/skills/sprint-plan/validate-manifest.mjs validate <manifest.json> [--root <dir>]

subcommands:
  validate   check a sprint manifest against the done-criteria contract

flags:
  --root <dir>  project root (default: cwd)
  --json        emit machine-readable output
`;

function main(argv) {
  const subcommand = argv[0];
  if (!subcommand || subcommand === '--help') { process.stdout.write(USAGE); return 0; }
  if (subcommand !== 'validate') { process.stderr.write(`unknown subcommand \`${subcommand}\`\n\n${USAGE}`); return 1; }

  const given = argv[1];
  if (!given || given.startsWith('--')) { process.stderr.write(`validate requires a manifest path\n\n${USAGE}`); return 1; }
  if (given.split(/[\\/]/).includes('..')) { process.stderr.write(`unsafe path traversal (REJECT, never normalize): ${JSON.stringify(given)}\n`); return 1; }

  const rootIndex = argv.indexOf('--root');
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : process.cwd();
  const path = isAbsolute(given) ? given : join(root, given);

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    // Split from the usage error above: a path nobody passed and a path that will
    // not parse are different mistakes, and exit 2 is the house code for "the thing
    // you named is not there".
    process.stderr.write(`cannot read manifest at ${given}: ${error.message}\n`);
    return 2;
  }

  const result = validateManifest(manifest);
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return 0; }
  if (result.valid) { process.stdout.write('valid\n'); return 0; }
  process.stderr.write(`invalid:\n${(result.errors ?? []).map((e) => `  ${typeof e === 'string' ? e : JSON.stringify(e)}`).join('\n')}\n`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
