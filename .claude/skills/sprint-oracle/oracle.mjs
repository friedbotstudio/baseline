// Domain + thin CLI: the sprint completeness oracle.
// Reads a sprint manifest, scans the test tree for `// @sprint-feature:<id> @kind:<k>`
// tags, and reports per-feature gaps in three dimensions: done-record, edge, wiring.
// Exit/return code: 0 = all features complete, 2 = gaps found, 1 = operational error.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TAG_RE = /^\s*\/\/\s*@sprint-feature:(\S+)\s+@kind:(edge|wiring|happy)\b/;
const TEST_RE = /\btest\(\s*['"]([^'"]+)['"]/;

function listMjsFiles(root) {
  const files = [];
  let entries;
  try { entries = readdirSync(root); } catch { return files; }
  for (const name of entries) {
    const full = join(root, name);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) files.push(...listMjsFiles(full));
    else if (name.endsWith('.mjs')) files.push(full);
  }
  return files;
}

function buildTagMap(files) {
  const map = new Map();
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const tag = TAG_RE.exec(lines[i]);
      if (!tag) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') continue;
        const named = TEST_RE.exec(lines[j]);
        if (named) map.set(named[1], { feature: tag[1], kind: tag[2] });
        break;
      }
    }
  }
  return map;
}

function resolves(tagMap, name, feature, kind) {
  const entry = tagMap.get(name);
  return Boolean(entry) && entry.feature === feature && entry.kind === kind;
}

function featureGaps(feature, tagMap) {
  const id = feature?.id ?? '(unknown)';
  const gaps = [];
  if (!(typeof feature?.done_record === 'string' && feature.done_record.trim())) {
    gaps.push({ feature: id, dimension: 'done-record', detail: 'done_record is empty' });
  }
  const edgeNames = Array.isArray(feature?.edge_tests) ? feature.edge_tests : [];
  if (!edgeNames.some((name) => resolves(tagMap, name, id, 'edge'))) {
    gaps.push({ feature: id, dimension: 'edge', detail: `no resolvable @kind:edge test among [${edgeNames.join(', ')}]` });
  }
  const wiring = feature?.wiring_test;
  if (!(wiring && resolves(tagMap, wiring, id, 'wiring'))) {
    gaps.push({ feature: id, dimension: 'wiring', detail: `wiring_test '${wiring || ''}' does not resolve to a @kind:wiring test` });
  }
  return gaps;
}

export function runOracle({ manifestPath, testRoot }) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return { code: 1, gaps: [], error: `cannot read or parse manifest at ${manifestPath}: ${err.message}` };
  }
  const features = Array.isArray(manifest.features) ? manifest.features : [];
  const tagMap = buildTagMap(listMjsFiles(testRoot));
  const gaps = features.flatMap((feature) => featureGaps(feature, tagMap));
  return { code: gaps.length > 0 ? 2 : 0, gaps };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const result = runOracle({ manifestPath: process.argv[2], testRoot: process.argv[3] || 'tests' });
  if (result.error) process.stderr.write(`sprint-oracle: ${result.error}\n`);
  for (const gap of result.gaps) {
    process.stderr.write(`GAP ${gap.feature}: ${gap.dimension} — ${gap.detail}\n`);
  }
  process.exit(result.code);
}
