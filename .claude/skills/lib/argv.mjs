// Foundation — argv parsing, usage rendering, and the uniform exit contract that
// every skill dispatcher shares.
//
// Why the flag vocabulary is declared HERE rather than per dispatcher: under
// `strict: false` an undeclared `--hops 2` parses as `hops: true` and leaks `2`
// into positionals, silently discarding the value. Declaring the union of
// value-taking flags once is what makes `--hops 2` mean the same thing in every
// dispatcher, which is the shared-conventions rule the spec pins (D6).
//
// This module owns argv and nothing else. Path validation belongs to the skill
// that owns the path — a dispatcher resolving a corpus directory imports its own
// `assertNoTraversal`, because a Foundation module reaching into a sibling skill
// to validate would invert the layer model.

import { parseArgs } from 'node:util';

export const EXIT_OK = 0;
export const EXIT_USAGE = 1;
export const EXIT_NOT_FOUND = 2;

const VALUE_FLAGS = ['root', 'spec-dir', 'hops', 'jar', 'key', 'disposition', 'state', 'governs'];

// Two error classes rather than an exit-code argument: a handler throws what went
// wrong, and the layer that owns the process decides what that means numerically.
export class UsageError extends Error {}
export class NotFoundError extends Error {}

export function parse(argv) {
  const [subcommand = '', ...rest] = argv;
  const options = Object.fromEntries(VALUE_FLAGS.map((name) => [name, { type: 'string' }]));
  const { values, positionals } = parseArgs({ args: rest, options, strict: false, allowPositionals: true });
  return { subcommand, positional: positionals, flags: values, json: values.json === true };
}

// Hoisted here at the third concrete use (workspace, memory-flush, memory-index).
// Every human-readable subcommand result is a list of lines with one trailing
// newline; three copies of that was the signal to name it once.
export function lines(rows) {
  return rows.join('\n') + '\n';
}

export function renderUsage(name, subcommands) {
  const width = Math.max(...Object.keys(subcommands).map((key) => key.length));
  const rows = Object.entries(subcommands)
    .map(([key, { summary }]) => `  ${key.padEnd(width)}  ${summary}`)
    .join('\n');
  return [
    `usage: node .claude/skills/${name}/cli.mjs <subcommand> [args] [--json]`,
    '',
    'subcommands:',
    rows,
    '',
    'shared flags:',
    '  --root <dir>      project root (default: cwd)',
    '  --spec-dir <dir>  corpus directory (default: <root>/docs/system)',
    '  --json            emit machine-readable output',
    '',
  ].join('\n');
}

function exitCodeFor(error) {
  if (error instanceof NotFoundError) return EXIT_NOT_FOUND;
  if (error instanceof UsageError) return EXIT_USAGE;
  return EXIT_USAGE;
}

// A result is `{ text, data }`. `text` is written verbatim so a subcommand whose
// output IS an artifact (a composed PlantUML document) stays byte-identical to
// what the Domain module produced; adding a trailing newline here would break
// that equality for every such caller.
function emit(result, json) {
  if (json) {
    process.stdout.write(JSON.stringify(result.data ?? null, null, 2) + '\n');
    return;
  }
  process.stdout.write(result.text ?? '');
}

export function dispatch({ name, subcommands, argv = process.argv.slice(2) }) {
  const { subcommand, positional, flags, json } = parse(argv);

  if (!subcommand || subcommand === '--help' || flags.help === true) {
    process.stdout.write(renderUsage(name, subcommands));
    process.exit(EXIT_OK);
  }

  const entry = subcommands[subcommand];
  if (!entry) {
    process.stderr.write(`unknown subcommand \`${subcommand}\`\n\n${renderUsage(name, subcommands)}`);
    process.exit(EXIT_USAGE);
  }

  try {
    emit(entry.run({ positional, flags, json, root: flags.root ?? process.cwd() }) ?? {}, json);
    process.exit(EXIT_OK);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(exitCodeFor(error));
  }
}
