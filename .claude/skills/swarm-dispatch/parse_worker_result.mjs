#!/usr/bin/env node
// parse_worker_result — D4 of swarm-mode-first-run-hardening (-e3f2).
//
// On the first real swarm run, 2 of 7 workers stopped after Skill(scenario)
// without implementing and emitted no {task_id,status} JSON line; dispatch had
// no detection and silently treated them as done-by-default. This classifies a
// worker's final message: only a valid {task_id,status:"done"} line that IS the
// final non-empty line counts as complete. Anything else (missing/garbled JSON,
// trailing prose after the JSON, or status:"failed") is incomplete, and the
// dispatch SOP routes it to resume-or-main-context.
//
// Usage:  parse_worker_result.mjs <result-file>
// Exit codes: 0 complete · 1 incomplete · 2 bad invocation / missing file.

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function fail(msg) { process.stderr.write(`parse_worker_result: ${msg}\n`); }

function tryParseStatusObject(line) {
  let obj;
  try { obj = JSON.parse(line); } catch { return null; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (!('task_id' in obj) || !('status' in obj)) return null;
  return obj;
}

// Pure core: classify a worker's final message text.
export function parseWorkerResult(text) {
  const lines = String(text == null ? '' : text).split('\n');
  const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0);

  let lastJsonIdx = -1;
  let parsed = null;
  for (let i = nonEmpty.length - 1; i >= 0; i--) {
    const obj = tryParseStatusObject(nonEmpty[i]);
    if (obj) { lastJsonIdx = i; parsed = obj; break; }
  }

  if (!parsed) {
    return { complete: false, status: null, task_id: null, reason: 'no parseable {task_id,status} JSON line found' };
  }

  const status = parsed.status;
  const task_id = parsed.task_id ?? null;

  if (lastJsonIdx !== nonEmpty.length - 1) {
    return { complete: false, status, task_id, reason: 'JSON status line is not the final line (trailing prose)' };
  }

  if (status === 'failed') {
    return { complete: false, status: 'failed', task_id, reason: 'worker reported status:failed' };
  }

  if (status === 'done') {
    return { complete: true, status: 'done', task_id, reason: '' };
  }

  return { complete: false, status, task_id, reason: `unexpected status: ${status}` };
}

function main(argv) {
  if (argv.length < 1 || !argv[0]) {
    process.stderr.write('usage: parse_worker_result.mjs <result-file>\n');
    process.exit(2);
  }
  const file = argv[0];
  if (!existsSync(file)) { fail(`result file not found at ${file}`); process.exit(2); }

  const r = parseWorkerResult(readFileSync(file, 'utf8'));
  if (r.complete) {
    process.stdout.write(`parse_worker_result: COMPLETE — ${r.task_id} status=${r.status}\n`);
    process.exit(0);
  }
  process.stdout.write(`parse_worker_result: INCOMPLETE — ${r.task_id ?? '(no task_id)'} — ${r.reason}\n`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
