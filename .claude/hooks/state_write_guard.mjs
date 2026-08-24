#!/usr/bin/env node
// state_write_guard.mjs — PreToolUse(Edit|Write|MultiEdit|NotebookEdit)
//
// Denies a SUBAGENT write to `.claude/state/**`. Article II puts decisions in
// main context, and workflow state is where a decision becomes durable: a
// subagent appending a phase to `completed` widens what track_guard authorizes
// next. Six hooks read workflow.json; before this one, none guarded a write.
//
// The decision lives in lib/state-write.mjs so it is testable without this
// file's top-level payload read — the seam branch_guard and consent-decision
// already use.
//
// Fail-open on anything ambiguous: a main-session write, a path outside the
// state directory, a degenerate payload, or any read error. It never bricks
// editing.

import { pathToFileURL } from 'node:url';
import { readPayload, emitAllow, emitBlock, logLine } from './lib/common.mjs';
import { decideStateWrite } from './lib/state-write.mjs';

const HOOK = 'state_write_guard';

async function main() {
  const payload = await readPayload();
  const decision = decideStateWrite(payload);
  const target = payload?.tool_input?.file_path ?? '(no path)';

  if (decision.allow) {
    logLine(HOOK, `ALLOW ${target}`);
    return emitAllow();
  }
  logLine(HOOK, `BLOCK ${target} agent_type=${payload?.agent_type ?? '(none)'}`);
  return emitBlock(decision.reason);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => emitAllow());
}
