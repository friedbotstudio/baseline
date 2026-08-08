// Foundation — the presentation half of the shared dispatcher layer: usage text
// and the writer that turns a subcommand result into bytes.
//
// Split from `argv.mjs` because the two halves answer different questions.
// `argv.mjs` reads the command line and owns the exit contract; nothing here
// consults argv or decides an exit code. A dispatcher imports `dispatch` and
// never touches this module directly — `argv.mjs` re-exports `renderUsage` so
// the move is invisible to a caller that already imports it.

// The write sink is a parameter, defaulted rather than hardcoded, so `emit` is
// testable without capturing the process's stdout. Nothing in the shipped path
// passes a second sink.
const DEFAULT_SINK = process.stdout;

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

// A result is `{ text, data }`. `text` is written verbatim so a subcommand whose
// output IS an artifact (a composed PlantUML document) stays byte-identical to
// what the Domain module produced; adding a trailing newline here would break
// that equality for every such caller.
export function emit(result, json, sink = DEFAULT_SINK) {
  if (json) {
    sink.write(JSON.stringify(result.data ?? null, null, 2) + '\n');
    return;
  }
  sink.write(result.text ?? '');
}
