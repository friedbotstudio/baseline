import { mkdir, writeFile, readFile, rename, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, delimiter } from 'node:path';
import { get as httpsGet } from 'node:https';
import { existsSync, statSync } from 'node:fs';
import { pathExists } from './util.js';

export const UPSTREAM_URL = 'https://github.com/plantuml/plantuml/releases/download/v1.2026.2/plantuml-asl-1.2026.2.jar';
export const PINNED_SHA256 = 'c348f6a26d999f81fd05b5d49834bb70df9cf35fab0939c4edecb0909e64022b';
export const PINNED_SIZE = 19395808;

export const FETCH_OUTCOMES = Object.freeze({
  WROTE: 'WROTE',
  SKIPPED_SYSTEM_PLANTUML: 'SKIPPED_SYSTEM_PLANTUML',
  SKIPPED_ALREADY_PRESENT: 'SKIPPED_ALREADY_PRESENT',
  SKIPPED_NO_PLANTUML_FLAG: 'SKIPPED_NO_PLANTUML_FLAG',
  SKIPPED_DRY_RUN: 'SKIPPED_DRY_RUN',
  WARNED_NETWORK_FAILURE: 'WARNED_NETWORK_FAILURE',
  WARNED_HASH_MISMATCH: 'WARNED_HASH_MISMATCH',
  ERRORED_REQUIRE_PLANTUML: 'ERRORED_REQUIRE_PLANTUML',
});

export function detectSystemPlantuml() {
  const pathEnv = process.env.PATH || '';
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, 'plantuml');
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function defaultHttpsFetch(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, hops) => {
      httpsGet(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (hops <= 0) return reject(new Error('Too many redirects'));
          res.resume();
          return follow(res.headers.location, hops - 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Non-200 status: ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    follow(url, maxRedirects);
  });
}

async function writeJarAtomic(target, buffer) {
  const dir = join(target, '.claude/bin');
  await mkdir(dir, { recursive: true });
  const dst = join(dir, 'plantuml.jar');
  const tmp = dst + '.tmp.' + process.pid;
  try {
    await writeFile(tmp, buffer);
    await rename(tmp, dst);
  } catch (err) {
    try { await unlink(tmp); } catch {}
    throw err;
  }
  return dst;
}

export async function fetchPlantumlIfMissing(target, opts = {}) {
  const fetcher = opts.fetch ?? defaultHttpsFetch;
  const systemPath = opts.systemPlantumlPath !== undefined
    ? opts.systemPlantumlPath
    : detectSystemPlantuml();

  if (systemPath) {
    return { outcome: FETCH_OUTCOMES.SKIPPED_SYSTEM_PLANTUML, bytesWritten: 0, reason: `system plantuml at ${systemPath}` };
  }
  if (opts.noPlantuml) {
    return { outcome: FETCH_OUTCOMES.SKIPPED_NO_PLANTUML_FLAG, bytesWritten: 0, reason: '--no-plantuml flag set' };
  }
  if (opts.dryRun) {
    return { outcome: FETCH_OUTCOMES.SKIPPED_DRY_RUN, bytesWritten: 0, reason: `would fetch ${UPSTREAM_URL} (sha256 ${PINNED_SHA256.slice(0, 8)}…)` };
  }

  const targetJar = join(target, '.claude/bin/plantuml.jar');
  if (await pathExists(targetJar)) {
    const existing = await readFile(targetJar);
    if (sha256Hex(existing) === PINNED_SHA256) {
      return { outcome: FETCH_OUTCOMES.SKIPPED_ALREADY_PRESENT, bytesWritten: 0, reason: 'jar already present with matching sha256' };
    }
  }

  let bytes;
  try {
    bytes = await fetcher(UPSTREAM_URL);
  } catch (err) {
    if (opts.requirePlantuml) {
      return { outcome: FETCH_OUTCOMES.ERRORED_REQUIRE_PLANTUML, bytesWritten: 0, reason: `network failure: ${err.message}` };
    }
    return { outcome: FETCH_OUTCOMES.WARNED_NETWORK_FAILURE, bytesWritten: 0, reason: err.message };
  }

  const hash = sha256Hex(bytes);
  if (hash !== PINNED_SHA256) {
    if (opts.requirePlantuml) {
      return { outcome: FETCH_OUTCOMES.ERRORED_REQUIRE_PLANTUML, bytesWritten: 0, reason: `sha256 mismatch: got ${hash.slice(0, 8)}…` };
    }
    return { outcome: FETCH_OUTCOMES.WARNED_HASH_MISMATCH, bytesWritten: 0, reason: `expected ${PINNED_SHA256.slice(0, 8)}… got ${hash.slice(0, 8)}…` };
  }

  await writeJarAtomic(target, bytes);
  return { outcome: FETCH_OUTCOMES.WROTE, bytesWritten: bytes.length, reason: `wrote ${bytes.length} bytes` };
}
