// Foundation: one lead per channel.
//
// The retired sprint-broker held this by being the single process every peer
// connected through. With the broker gone the channel store has to hold it, so
// the holder is a file: whoever writes it first owns the hat, and a second
// session is refused with the current holder's id rather than a bare "no" — the
// refused session needs to know who to escalate to.
//
// The write goes through the same directory lock the task handlers use, so two
// sessions racing on an empty channel cannot both come away believing they lead.

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { withLock } from './lock.mjs';
import { isSafeId } from './safe-id.mjs';

const leadPath = (channelRoot) => join(channelRoot, 'lead.json');

/** The current holder's peer id, or null when the channel is unled. */
export function readLead({ channelRoot }) {
  const file = leadPath(channelRoot);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return typeof parsed.holder === 'string' && parsed.holder !== '' ? parsed.holder : null;
  } catch {
    // An unreadable lead file is not an empty channel. Refusing to name a holder
    // is safe; inventing one is not, and claiming the hat off a corrupt file is
    // exactly the split-brain this module exists to prevent.
    return null;
  }
}

/**
 * Take the lead hat. Idempotent for the holder, refused for anyone else.
 */
export function acquireLead({ channelRoot, peer_id }) {
  if (!isSafeId(peer_id)) return { ok: false, holder: null, error: `invalid peer_id: ${String(peer_id)}` };

  const lock = withLock(channelRoot, 'lead', () => {
    const current = readLead({ channelRoot });
    if (current !== null && current !== peer_id) return { ok: false, holder: current };
    writeFileSync(leadPath(channelRoot), `${JSON.stringify({ holder: peer_id }, null, 2)}\n`);
    return { ok: true, holder: peer_id };
  });

  if (!lock.acquired) {
    return { ok: false, holder: readLead({ channelRoot }), error: 'lead lock held by a concurrent acquire' };
  }
  if (!lock.result.ok) {
    return { ok: false, holder: lock.result.holder, error: `channel is led by ${lock.result.holder}` };
  }
  return lock.result;
}

/**
 * Hand the hat back. Only the holder may — a non-holder releasing would let any
 * peer unseat the lead by asking.
 */
export function releaseLead({ channelRoot, peer_id }) {
  const current = readLead({ channelRoot });
  if (current === null) return { ok: true, holder: null };
  if (current !== peer_id) return { ok: false, holder: current, error: `channel is led by ${current}` };
  unlinkSync(leadPath(channelRoot));
  return { ok: true, holder: null };
}
