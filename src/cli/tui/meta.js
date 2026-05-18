// Domain — branded renderers for the meta commands (--help, --version).
// In a TTY, a brand banner frames the canonical body; in non-TTY the body is
// emitted unchanged so that piped consumers (`$(cli --version)`, `cli --help |
// grep ...`) keep working byte-clean.

import { accent, muted, rule } from './tokens.js';

export function renderHelp(helpText, version) {
  if (!process.stdout.isTTY) {
    process.stdout.write(helpText.endsWith('\n') ? helpText : helpText + '\n');
    return;
  }
  const banner = [
    '',
    `  ${accent('Baseline CLI')}  ${muted(`v${version}`)}`,
    `  ${muted('@friedbotstudio/create-baseline')}`,
    `  ${rule('─'.repeat(48))}`,
    '',
  ].join('\n');
  process.stdout.write(banner + '\n');
  process.stdout.write(helpText.endsWith('\n') ? helpText : helpText + '\n');
}

export function renderVersion(version) {
  if (!process.stdout.isTTY) {
    process.stdout.write(`${version}\n`);
    return;
  }
  process.stdout.write(`${accent('baseline')} ${muted('v')}${version}\n`);
}
