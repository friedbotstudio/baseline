// Domain — Stage 0 validation of a Skill(brainstorm) call (AC-001 contract).
// Returns { final_state, brief_path, reason } where final_state is
// 'needs_human' for invalid inputs and 'valid' when the call may proceed.

const VALID_PHASES = new Set(['intake', 'spec', 'tdd']);

export function validateCall({ request, slug, calling_phase, outDir }) {
  if (typeof request !== 'string' || request.trim() === '') {
    return { final_state: 'needs_human', brief_path: null, reason: 'empty_request' };
  }
  if (!VALID_PHASES.has(calling_phase)) {
    return { final_state: 'needs_human', brief_path: null, reason: 'invalid_calling_phase' };
  }
  if (typeof slug !== 'string' || slug === '') {
    return { final_state: 'needs_human', brief_path: null, reason: 'missing_slug' };
  }
  return { final_state: 'valid', brief_path: null };
}
