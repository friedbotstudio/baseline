#!/usr/bin/env node
// Covers AC-004 of remove-python-runtime-dep.
// Probe a JSON document on stdin and extract a named field, block, or alias.
// Used by .sh test fixtures across .claude/hooks/tests/ and .claude/skills/*/tests/
// to assert on hook output via Node ESM rather than a separate runtime.
//
// Usage:
//   echo '<json>' | node probe.mjs field <key>
//   echo '<json>' | node probe.mjs block <name>
//   echo '<json>' | node probe.mjs additional-context
//
// Exit 0 with extracted value on stdout (trailing newline).
// Exit 1 on JSON parse failure or missing key.

import { readFileSync } from 'node:fs';

function readStdinJson() {
  const raw = readFileSync(0, 'utf8');
  return JSON.parse(raw);
}

function formatValue(v) {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

function extractField(obj, key) {
  if (!(key in obj)) {
    process.stderr.write(`probe: missing field '${key}'\n`);
    process.exit(1);
  }
  return formatValue(obj[key]);
}

function extractBlock(obj, name) {
  const block = obj?.hookSpecificOutput?.[name];
  if (block === undefined) {
    process.stderr.write(`probe: missing hookSpecificOutput.${name}\n`);
    process.exit(1);
  }
  return formatValue(block);
}

function main(argv) {
  const [verb, arg] = argv;
  if (!verb) {
    process.stderr.write('usage: probe.mjs <field <key> | block <name> | additional-context>\n');
    process.exit(2);
  }

  let json;
  try {
    json = readStdinJson();
  } catch (err) {
    process.stderr.write(`probe: invalid JSON on stdin (${err.message})\n`);
    process.exit(1);
  }

  let result;
  switch (verb) {
    case 'field':
      if (!arg) { process.stderr.write('probe: field requires <key>\n'); process.exit(2); }
      result = extractField(json, arg);
      break;
    case 'block':
      if (!arg) { process.stderr.write('probe: block requires <name>\n'); process.exit(2); }
      result = extractBlock(json, arg);
      break;
    case 'additional-context':
      result = extractBlock(json, 'additionalContext');
      break;
    default:
      process.stderr.write(`probe: unknown verb '${verb}'\n`);
      process.exit(2);
  }

  process.stdout.write(result + '\n');
}

main(process.argv.slice(2));
