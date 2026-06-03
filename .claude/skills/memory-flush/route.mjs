// Foundation — pure deterministic route classifier for /memory-flush (Tier 3).
//
// suggestRoutes() proposes one canonical bucket + a salience weight per pending
// candidate. It is PURE: no filesystem, no network, no model call. The semantic
// backstop (a Sonnet-tier pass over transcript material) is a main-context
// /memory-flush concern, NOT this module. Per Article IX.3 the output only
// SUGGESTS — the human accepts/overrides at /memory-flush and promotion to
// canonical stays human-only. The suggested bucket is the accept/override
// default; this module never writes anything.

const BUCKETS = ['landmark', 'decision', 'open-question', 'backlog'];

const PATH_RE = /(?:^|\s)[\w./-]+\.[a-z]{2,4}(?:\s|$)|\.claude\//i;
const FUTURE_RE = /\b(?:TODO|backlog|follow-?up|later|next\s+we|defer)\b/i;
const DECISION_RE = /\b(?:decided\s+to|the\s+(?:plan|approach|fix)\s+is|going\s+to|approach\s+is|chose|will\s+use)\b/i;
const CHATTER_RE = /\b(?:thanks|looks\s+good|lgtm|the\s+weather|fine|ok)\b/i;

// First match wins. Order matters: a path reference is a landmark even if it
// also ends with '?'; a question that isn't a path is an open question; etc.
function classify(text) {
  const t = typeof text === 'string' ? text : '';
  if (PATH_RE.test(t)) return { bucket: 'landmark', evidence: 'file-path shape' };
  if (/\?\s*$/.test(t.trim())) return { bucket: 'open-question', evidence: 'ends with ?' };
  if (FUTURE_RE.test(t)) return { bucket: 'backlog', evidence: 'future-work cue' };
  if (DECISION_RE.test(t)) return { bucket: 'decision', evidence: 'decision cue' };
  return { bucket: 'backlog', evidence: 'default' };
}

function salience(text, bucket) {
  const t = typeof text === 'string' ? text : '';
  const isChatter = CHATTER_RE.test(t) || t.trim().length < 25;
  const salientByCue = PATH_RE.test(t) || /\?\s*$/.test(t.trim()) || FUTURE_RE.test(t) || DECISION_RE.test(t);
  if (!salientByCue && isChatter) return 0.1;
  if (bucket === 'backlog') return 0.5;
  return 0.7;
}

export function suggestRoutes(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates.map((c) => {
    const text = (c && typeof c === 'object') ? (c.text || '') : '';
    const { bucket, evidence } = classify(text);
    return {
      key: c && c.key,
      suggested_bucket: bucket,
      weight: salience(text, bucket),
      evidence,
    };
  });
}

export { BUCKETS };
