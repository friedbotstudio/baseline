// Foundation: file-based channel state under a channelRoot
// (.claude/state/sprint/<sprint_id>/). All state is plain JSON plus an
// append-only mailbox.jsonl. node:fs only — no dependency.

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

function readJson(channelRoot, name, fallback) {
  try {
    return JSON.parse(readFileSync(join(channelRoot, name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(channelRoot, name, value) {
  writeFileSync(join(channelRoot, name), JSON.stringify(value));
}

export const readSprint = (channelRoot) => readJson(channelRoot, 'sprint.json', { peers: [] });
export const writeSprint = (channelRoot, value) => writeJson(channelRoot, 'sprint.json', value);
export const readTasks = (channelRoot) => readJson(channelRoot, 'tasks.json', []);
export const writeTasks = (channelRoot, value) => writeJson(channelRoot, 'tasks.json', value);
export const readYields = (channelRoot) => readJson(channelRoot, 'yields.json', []);
export const writeYields = (channelRoot, value) => writeJson(channelRoot, 'yields.json', value);

export function appendMailbox(channelRoot, message) {
  appendFileSync(join(channelRoot, 'mailbox.jsonl'), `${JSON.stringify(message)}\n`);
}
