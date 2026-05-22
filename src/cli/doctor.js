import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { hashFile, loadManifest } from './manifest.js';
import { MARKER_PATH_REL } from './reconciliation-marker.js';
import { pathExists } from './util.js';

const MANIFEST_REL = '.claude/.baseline-manifest.json';

// Directories under target/ that we scan to detect ADDED files. Limited to
// the baseline product's footprint so we don't enumerate the user's whole
// project. CLAUDE.md / .mcp.json / docs/init/seed.md are flat single files
// and are covered by the manifest comparison; ADDED only meaningfully applies
// inside the .claude/ tree where /init-project legitimately introduces files.
const ADDED_SCAN_PREFIX = '.claude';

async function listFilesUnder(dir, baseDir = dir, acc = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await listFilesUnder(full, baseDir, acc);
    } else if (entry.isFile()) {
      acc.push(relative(baseDir, full).split(sep).join('/'));
    }
  }
  return acc;
}

/**
 * Compare the installed baseline at `target/` against its `.baseline-manifest.json`.
 * Returns a structured report; never throws on drift.
 *
 * Exit-code semantics:
 *   - 0 when the manifest exists and no baseline files are MISSING. Customized
 *     and added files are informational (legacy default).
 *   - 1 when one or more baseline files are MISSING (lossy drift) OR
 *     `--strict` is set and one or more files are CUSTOMIZED (post-install
 *     tampering detection per spec AC-006).
 *   - 2 when there is no `.baseline-manifest.json` at the expected path.
 */
export async function runDoctor(target, options = {}) {
  const strict = !!options.strict;
  const manifestPath = join(target, MANIFEST_REL);
  if (!(await pathExists(manifestPath))) {
    return {
      exitCode: 2,
      error: `No baseline manifest at ${MANIFEST_REL}. This target was not installed by create-baseline, or the manifest was removed.`,
      target,
    };
  }

  const manifest = await loadManifest(manifestPath);
  if (!manifest || typeof manifest !== 'object' || !manifest.files) {
    return {
      exitCode: 2,
      error: `Invalid baseline manifest at ${MANIFEST_REL}: missing files object.`,
      target,
    };
  }

  const matched = [];
  const customized = [];
  const missing = [];
  const tampered = [];

  for (const [rel, recordedHash] of Object.entries(manifest.files)) {
    const full = join(target, rel);
    if (!existsSync(full)) {
      missing.push(rel);
      continue;
    }
    const actualHash = await hashFile(full);
    if (actualHash === recordedHash) {
      matched.push(rel);
    } else {
      customized.push(rel);
      tampered.push({ path: rel, shipped: recordedHash, observed: actualHash });
    }
  }

  // ADDED — files under .claude/ that aren't in the manifest. Excludes the
  // manifest itself (it's written by the CLI post-install and is not self-referential)
  // and the reconciliation marker (per-target user state written by
  // /upgrade-project; see docs/specs/upgrade-no-replay-prompts.md §Behavior #6).
  const added = [];
  const onDisk = await listFilesUnder(join(target, ADDED_SCAN_PREFIX));
  for (const rel of onDisk) {
    const full = `${ADDED_SCAN_PREFIX}/${rel}`;
    if (full === MANIFEST_REL) continue;
    if (full === MARKER_PATH_REL) continue;
    if (!(full in manifest.files)) added.push(full);
  }

  const tamperedSorted = tampered.sort((a, b) => a.path.localeCompare(b.path));
  const exitCode = missing.length > 0 || (strict && customized.length > 0) ? 1 : 0;

  return {
    exitCode,
    strict,
    target,
    manifestVersion: manifest.manifest_version,
    generatedAt: manifest.generated_at,
    matched: matched.sort(),
    customized: customized.sort(),
    missing: missing.sort(),
    added: added.sort(),
    tampered: tamperedSorted,
  };
}

/** Human-readable formatter used by the CLI. */
export function formatReport(report) {
  if (report.error) {
    return `doctor: ${report.error}\n`;
  }
  const lines = [];
  lines.push(`Baseline doctor — target: ${report.target}`);
  lines.push(`Manifest: version ${report.manifestVersion}, installed ${report.generatedAt}`);
  lines.push('');
  lines.push(`  matched:    ${report.matched.length}`);
  lines.push(`  customized: ${report.customized.length}`);
  lines.push(`  missing:    ${report.missing.length}`);
  lines.push(`  added:      ${report.added.length}`);
  if (report.missing.length > 0) {
    lines.push('');
    lines.push('Missing (deleted from disk; exit 1):');
    for (const p of report.missing) lines.push(`  - ${p}`);
  }
  if (report.customized.length > 0) {
    lines.push('');
    if (Array.isArray(report.tampered) && report.tampered.length > 0) {
      const header = report.strict
        ? 'Customized (target hash differs from manifest; strict mode → exit 1):'
        : 'Customized (target hash differs from manifest; informational):';
      lines.push(header);
      for (const entry of report.tampered) {
        lines.push(`  TAMPERED: ${entry.path}  shipped=${entry.shipped}  observed=${entry.observed}`);
      }
    } else {
      lines.push('Customized (target hash differs from manifest; informational):');
      for (const p of report.customized) lines.push(`  - ${p}`);
    }
  }
  if (report.added.length > 0) {
    lines.push('');
    lines.push(`Added under ${ADDED_SCAN_PREFIX}/ since install (likely /init-project; informational):`);
    for (const p of report.added) lines.push(`  - ${p}`);
  }
  return lines.join('\n') + '\n';
}
