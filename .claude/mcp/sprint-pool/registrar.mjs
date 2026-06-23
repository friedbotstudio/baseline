// Orchestration: startup auto-join. Reads the project's sprint_mode flag and the
// resolved channelRoot, then composes the Domain registerPoolPeer handler. This is the
// "no /companion on typed" path (AC-001) — the channel subprocess registers its own
// peer the moment Claude Code spawns it. On sprint_mode off it composes a refusal (AC-007).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerPoolPeer } from './handlers.mjs';

function poolEnabled(projectDir) {
  try {
    const velocity = JSON.parse(readFileSync(join(projectDir, '.claude', 'project.json'), 'utf8'))?.velocity || {};
    return velocity.org_mode?.enabled === true || velocity.sprint_mode?.enabled === true;
  } catch {
    return false;
  }
}

export function runRegistration({ projectDir, channelRoot, peer_id, role = 'peer', workspace = '.' }) {
  return registerPoolPeer({ channelRoot, peer_id, role, workspace, poolEnabled: poolEnabled(projectDir) });
}
