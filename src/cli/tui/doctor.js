// Domain — branded sectioned doctor report. Consumes the structured
// DoctorReport from src/cli/doctor.js (unchanged) and writes a colorized,
// sectioned rendering to stdout. The non-TTY plain path stays on doctor.js's
// formatReport — this renderer is only invoked when stdout is a TTY.

import { accent, muted, success, warn, error, accentLight } from './tokens.js';
import { renderHeader } from './splash.js';

function targetAndManifestLines(target, manifestInfo) {
  const lines = [accent('Baseline doctor')];
  if (target) lines.push(muted(`target:   ${target}`));
  if (manifestInfo) lines.push(muted(`manifest: ${manifestInfo}`));
  return lines;
}

export function render(report) {
  process.stdout.write(renderHeader({ subtitle: 'doctor' }));
  if (report.error) {
    const headerLines = targetAndManifestLines(report.target);
    process.stdout.write(headerLines.join('\n') + '\n\n');
    process.stdout.write(`${error('doctor:')} ${report.error}\n`);
    return;
  }
  const lines = targetAndManifestLines(report.target, `version ${report.manifestVersion}, installed ${report.generatedAt}`);
  lines.push('');
  lines.push(`  ${success('matched')}:    ${report.matched.length}`);
  lines.push(`  ${accentLight('customized')}: ${report.customized.length}`);
  lines.push(`  ${error('missing')}:    ${report.missing.length}`);
  lines.push(`  ${warn('added')}:      ${report.added.length}`);

  if (report.missing.length > 0) {
    lines.push('');
    lines.push(error('Missing (deleted from disk; exit 1):'));
    for (const p of report.missing) lines.push(`  - ${p}`);
  }
  if (report.customized.length > 0) {
    lines.push('');
    const header = report.strict
      ? accentLight('Customized (strict mode → exit 1):')
      : accentLight('Customized (informational):');
    lines.push(header);
    if (Array.isArray(report.tampered) && report.tampered.length > 0) {
      for (const entry of report.tampered) {
        lines.push(`  ${warn('TAMPERED')}: ${entry.path}`);
        lines.push(`    shipped=${muted(entry.shipped)}  observed=${muted(entry.observed)}`);
      }
    } else {
      for (const p of report.customized) lines.push(`  - ${p}`);
    }
  }
  if (report.added.length > 0) {
    lines.push('');
    lines.push(warn('Added under .claude/ since install (likely /init-project; informational):'));
    for (const p of report.added) lines.push(`  - ${p}`);
  }

  process.stdout.write(lines.join('\n') + '\n');
}
