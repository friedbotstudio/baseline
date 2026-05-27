#!/usr/bin/env node
// .env file guard — PreToolUse(Edit|Write|MultiEdit|NotebookEdit)
//
// Blocks any write to files matching .env patterns that are likely to hold
// secrets. Allows .env.example / .env.sample (template files that don't hold
// real secrets).

import { basename } from 'node:path';
import {
  readPayload,
  payloadGet,
  emitAllow,
  emitBlock,
  logLine,
} from './lib/common.mjs';

const payload = await readPayload();

const tool = payloadGet(payload, '.tool_name');
if (!['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) emitAllow();

const file = payloadGet(payload, '.tool_input.file_path');
if (!file) emitAllow();

const base = basename(file);

// Allow clearly-safe template files.
const SAFE = ['.env.example', '.env.sample', '.env.template', '.env.dist', '.env.defaults'];
if (SAFE.includes(base)) emitAllow();

// Block anything else matching .env*.
const looksSecret = base === '.env' || base.startsWith('.env.') || base.endsWith('.env');
if (looksSecret) {
  logLine('env_guard', `BLOCKED ${file}`);
  emitBlock(`.env file guard: '${file}' looks like a secrets file. seed.md forbids edits to .env files. If this is a template, rename to .env.example.`);
}

emitAllow();
