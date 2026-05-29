// Foundation — /triage flag parsing (AC-010). Detects --no-brainstorm and
// --codesign substrings in the request string, sets the corresponding
// workflow.json fields, and returns the request with flags stripped.
// Flags are independent — both may appear.

const NO_BRAINSTORM_RE = /--no-brainstorm\b/g;
const CODESIGN_RE = /--codesign\b/g;

export function parseFlags(request) {
  if (typeof request !== 'string') {
    return { skip_brainstorm: false, codesign_mode: false, cleaned_request: '' };
  }
  const skip_brainstorm = /--no-brainstorm\b/.test(request);
  const codesign_mode = /--codesign\b/.test(request);

  const cleaned = request
    .replace(NO_BRAINSTORM_RE, '')
    .replace(CODESIGN_RE, '')
    .replace(/\s+/g, ' ')
    .trim();

  return { skip_brainstorm, codesign_mode, cleaned_request: cleaned };
}
