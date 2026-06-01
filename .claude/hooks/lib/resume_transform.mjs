// Foundation — resume-side cache + read (Decision D5).
//
// The resume TRANSFORM (verbatim -> summary + selected cues) is model work
// done inline in main context by Claude Code; this Foundation helper only
// provides the data read (most-recent section) and the TTL cache so the model
// does not recompute a fresh summary on every resume. The shelved verbatim is
// immutable, so the TTL is a regenerate-for-freshness knob, not a
// source-staleness knob.

import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readMostRecent } from './thread_store.mjs';
import { writeJsonAtomic } from './common.mjs';

const CACHE_FILENAME = 'thread_transform_cache.json';

export { readMostRecent };

function cachePath(stateDir) { return join(stateDir, CACHE_FILENAME); }

export function readCache({ stateDir, ttlSeconds, nowMs }) {
  const p = cachePath(stateDir);
  if (!existsSync(p)) return { hit: false };
  let data;
  try { data = JSON.parse(readFileSync(p, 'utf8')); } catch { return { hit: false }; }
  const cachedAt = Number(data.cached_at);
  if (!Number.isFinite(cachedAt)) return { hit: false };
  const ageMs = nowMs - cachedAt;
  if (ageMs < 0 || ageMs > ttlSeconds * 1000) return { hit: false };
  return { hit: true, summary: data.summary, source_shelved_at: data.source_shelved_at };
}

export function writeCache({ stateDir, summary, sourceShelvedAt, nowMs }) {
  try { mkdirSync(stateDir, { recursive: true }); } catch {}
  // Atomic temp+rename (CWE-362) so a crash can't leave a corrupt cache that the
  // next SessionStart would fail to parse (readCache treats parse failure as a
  // miss, but a half-written file shouldn't be observable at all).
  writeJsonAtomic(cachePath(stateDir), {
    source_shelved_at: sourceShelvedAt,
    summary,
    cached_at: nowMs,
  });
}

