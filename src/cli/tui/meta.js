// Domain — branded renderers for the meta commands (--help, --version) and
// for usage-class errors. In a TTY, the splash marquee (wordmark + brand
// strip from splash.js) frames the canonical body; in non-TTY the body is
// emitted unchanged so that piped consumers (`$(cli --version)`,
// `cli --help | grep ...`) keep working byte-clean.

import { accent, muted, rule, error as errorPaint } from './tokens.js';
import {
  renderSplash,
  renderBrandStrip,
  renderVersionMarquee,
  wordmarkFits,
} from './splash.js';

const DISCOVER_URL = 'https://baseline.friedbotstudio.com/';

export function renderHelp(helpText, _version) {
  const body = helpText.endsWith('\n') ? helpText : helpText + '\n';
  if (!process.stdout.isTTY || !wordmarkFits()) {
    process.stdout.write(body);
    return;
  }
  process.stdout.write(renderSplash({
    tryLine: 'npx @friedbotstudio/create-baseline ./my-project',
    discoverUrl: DISCOVER_URL,
  }));
  process.stdout.write(body);
}

export function renderVersion(version) {
  if (!process.stdout.isTTY) {
    process.stdout.write(`${version}\n`);
    return;
  }
  if (wordmarkFits()) {
    process.stdout.write(renderVersionMarquee(version));
    return;
  }
  process.stdout.write(renderBrandStrip({ version }));
}

// Usage errors always print to stderr (so a `cli ... 2>/dev/null` pipeline
// can still consume stdout cleanly). In a TTY we wrap the message and the
// HELP_TEXT body in the same brand banner used by --help, with the error
// label painted in --mac-red. In non-TTY we emit a plain `Error: <msg>`
// line followed by the canonical help body — same body, no ANSI.
export function renderUsageError(msg, helpText, version) {
  const body = helpText.endsWith('\n') ? helpText : helpText + '\n';
  if (!process.stderr.isTTY) {
    process.stderr.write(`Error: ${msg}\n`);
    process.stderr.write(body);
    return;
  }
  const banner = [
    '',
    `  ${errorPaint('Error')}  ${msg}`,
    `  ${muted(`@friedbotstudio/create-baseline v${version}`)}`,
    `  ${rule('─'.repeat(48))}`,
    '',
  ].join('\n');
  process.stderr.write(banner + '\n');
  process.stderr.write(body);
}
