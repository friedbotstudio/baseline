import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const MANIFEST_VERSION = 2;

export async function hashFile(path) {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}

export async function loadManifest(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  return JSON.parse(text);
}

export async function saveManifest(path, m) {
  await writeFile(path, JSON.stringify(m, null, 2) + '\n');
}

export async function buildManifestFromDir(rootDir, fileList, opts = {}) {
  const files = {};
  const sorted = [...fileList].sort();
  for (const rel of sorted) {
    files[rel] = await hashFile(join(rootDir, rel));
  }
  const manifest = {
    manifest_version: MANIFEST_VERSION,
    generated_at: new Date().toISOString(),
    files,
  };
  if (typeof opts.baseline_version === 'string' && opts.baseline_version.length > 0) {
    manifest.baseline_version = opts.baseline_version;
  }
  return manifest;
}
