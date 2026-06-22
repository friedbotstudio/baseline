// Foundation: the closed message-type enum is the mechanical-only boundary.
// A message can only carry one of these coordination types — there is no
// free-form "directive" type, so a design instruction cannot be expressed
// over the channel. (Hand-rolled rather than zod to keep the core zero-dep.)

export const MESSAGE_TYPES = ['CLAIM', 'DONE', 'CONFLICT', 'YIELD', 'MSG', 'STATUS'];

export function validateMessage(message) {
  if (!message || typeof message.from !== 'string' || message.from.trim() === '') {
    return { valid: false, error: 'message.from must be a non-empty string' };
  }
  if (!MESSAGE_TYPES.includes(message.type)) {
    return { valid: false, error: `message.type '${message.type}' is not in the closed enum ${MESSAGE_TYPES.join('|')}` };
  }
  return { valid: true };
}
