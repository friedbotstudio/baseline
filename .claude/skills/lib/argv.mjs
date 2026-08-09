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
// to validate would invert the layer model. Rendering is the same boundary in the
// other direction: usage text and the result writer live in `output.mjs`.

import { parseArgs } from 'node:util';

import { renderUsage, emit } from './output.mjs';

// Re-exported, not redefined. `renderUsage` shipped as a public export of this
// module in 4cc46e0, so a consumer importing it from here keeps working.
export { renderUsage };

export const EXIT_OK = 0;
export const EXIT_USAGE = 1;
export const EXIT_NOT_FOUND = 2;

const VALUE_FLAGS = [
  'root', 'spec-dir', 'hops', 'jar', 'key', 'disposition', 'state', 'governs',
  // Added by the dispatcher sweep. Every one of these is a value-taking flag on a
  // subcommand added by that spec; omitting any of them from this union is not a
  // missing feature but a silent data loss, per the `strict: false` note above.
  'slug', 'kind', 'mem-dir', 'surface', 'delegate', 'touched', 'label',
];

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

// Hoisted here at the third concrete use (workspace, memory-sync, memory-index).
// Every human-readable subcommand result is a list of lines with one trailing
// newline; three copies of that was the signal to name it once.
export function lines(rows) {
  return rows.join('\n') + '\n';
}

// The other half of the `strict: false` hazard, and the one declaring the flag in
// VALUE_FLAGS does NOT fix: `--slug` with no value behind it parses as the BOOLEAN
// true, not as a missing string. A handler doing `assertSafeSlug(flags.slug)` then
// validates `true`, and what reaches the user is a type error from three frames
// down instead of "--slug needs a value".
//
// Sited here rather than in each handler because the failure is a property of the
// parser, so the correction belongs beside the parser. Returns the value so a
// handler can inline it.
export function requireValue(flags, name) {
  const value = flags[name];
  if (value === undefined || value === true || value === '') {
    throw new UsageError(`--${name} requires a value`);
  }
  return value;
}

// W-3: one invocation writes one thing. Declared once here because the rule is
// contract-wide (spec dispatcher-sweep, D4) — five handlers each rolling their own
// bulk check is how four of them end up agreeing and the fifth does not.
export function refuseBulk(flags, positional, { max = 1 } = {}) {
  if (flags.all !== undefined) {
    throw new UsageError('--all is not accepted: this command writes exactly one thing per invocation');
  }
  if (positional.length > max) {
    throw new UsageError(`expected exactly ${max} positional argument, got ${positional.length}: this command writes exactly one thing per invocation`);
  }
}

function exitCodeFor(error) {
  if (error instanceof NotFoundError) return EXIT_NOT_FOUND;
  if (error instanceof UsageError) return EXIT_USAGE;
  return EXIT_USAGE;
}

// `async`, and the `await` on entry.run is load-bearing.
//
// The dispatcher-sweep spec originally decided the opposite (D2: keep this
// synchronous), on the reasoning that the one async handler could carry its own
// entry point instead. That reasoning was falsified at implement time: the handler
// in question lives in `.claude/skills/harness/workflow-migrator.js`, which is a
// byte-for-byte BUILD MIRROR of `src/cli/workflow-migrator.js` (build-template.sh
// Stage 0b, guarded by tests/vendored-mirror-bytes.test.mjs). A main-guard added to
// the mirror is reverted by the next `npm run build`; added to the source, it drags
// the spec's write_set into `src/**`, which matches no diagram profile.
//
// Awaiting costs the synchronous handlers nothing — `await` on a non-promise
// resolves on the next microtask and the emitted value is identical — and
// test_when_four_existing_dispatchers_run_then_behavior_and_exit_codes_unchanged
// is the guard on that claim. Without the await, an async handler's promise reaches
// `emit` as `{}` and `process.exit` fires before the write lands.
export async function dispatch({ name, subcommands, argv = process.argv.slice(2) }) {
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
    emit(await entry.run({ positional, flags, json, root: flags.root ?? process.cwd() }) ?? {}, json);
    process.exit(EXIT_OK);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(exitCodeFor(error));
  }
}
