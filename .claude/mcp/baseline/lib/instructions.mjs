// Foundation: what a session is told about its own role on the channel.
//
// A session that guesses its identity claims the wrong lane. The retired pool
// server carried this in its MCP instructions; with the pool gone the identity
// has to come from here, because this is now the only server a peer loads.

// The wording no longer promises pushes. There is no broker, and the native-messaging
// pointer is an accelerator that may never arrive, so the instructions tell both roles
// to reconcile against sprint_status and treat anything that arrives as a hint.
const PEER_INSTRUCTIONS =
  'You are a PEER (role: peer) on this channel, and you stay a peer here regardless of any other role this session plays elsewhere. '
  + 'Reconcile via sprint_status, then claim_task a pending lane you are eligible for (a lane with no assignee, or one whose assignee is your peer_id), '
  + 'execute its recipe within its write_set, signal_done when finished, ask_lead for a free-form question, and yield_fork any un-decidable choice. '
  + 'You NEVER arbitrate yields, NEVER release_task or answer_peer, and NEVER decline a claimable lane on the belief that you are the lead. '
  + 'A message naming a claimable lane is a hint that may never arrive; sprint_status is what decides.';

const LEAD_INSTRUCTIONS =
  'You are the LEAD (role: lead) on this channel. Take the hat with acquire_lead — one lead per channel, and a second session is refused with the current holder id. '
  + 'Enqueue work with enqueue_task (set assignee to direct a lane at a named peer, or omit it for claim-any), arbitrate in main context and then release_task, and answer a peer question with answer_peer. '
  + 'Call sprint_status to read authoritative state (tasks/yields/peers/messages); its all_done flag is true exactly when every enqueued lane has drained, so a lost pointer can never strand you.';

export const CHANNEL_ROLE = process.env.BASELINE_CHANNEL_ROLE || 'peer';
export const CHANNEL_PEER_ID = process.env.BASELINE_CHANNEL_PEER_ID || '';

export function instructionsFor(role, peerId = '') {
  const base = role === 'lead' ? LEAD_INSTRUCTIONS : PEER_INSTRUCTIONS;
  if (!peerId) return base;
  const id = role === 'lead'
    ? ` Your id on this channel is \`${peerId}\`.`
    : ` Your peer id on this channel is \`${peerId}\` — you are \`${peerId}\` and no other peer; claim only a lane with no assignee or assigned to \`${peerId}\`, and never assume another peer's identity.`;
  return base + id;
}
