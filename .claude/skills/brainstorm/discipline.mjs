// Foundation — Stage 2 dialogue discipline assertor (AC-003). Scans a single
// model-emitted turn for solution-shaped tokens that indicate the model is
// proposing fixes rather than exploring the problem. Pure regex scan.

const LIBRARY_NAMES = [
  /\b(Redis|PostgreSQL|MongoDB|MySQL|Kafka|RabbitMQ|Elasticsearch|Nginx|Docker|Kubernetes|React|Vue|Angular|Express|Django|Flask|FastAPI|Spring|Rails|TypeScript|GraphQL|gRPC|JWT)\b/,
];

const SOLUTION_PATTERNS = [
  { re: /\bimplement\b/i, category: 'solution-verb' },
  { re: /\brefactor\b/i, category: 'solution-verb' },
  { re: /\badd\s+(a|an|the)?\s*(retry|cache|queue|loop|worker|handler|middleware|fallback|circuit\s*breaker)\b/i, category: 'solution-verb' },
  { re: /\bhave you considered using\b/i, category: 'solution-verb' },
  { re: /\bcircuit breaker\b/i, category: 'solution-pattern' },
  { re: /\bexponential backoff\b/i, category: 'solution-pattern' },
  { re: /\basync\/await\b/i, category: 'solution-pattern' },
  { re: /\b(we could|what if we|should we|i recommend)\b/i, category: 'solution-proposal' },
];

// A3 (roadmap Epic 2) — multiple-choice framing on a load-bearing probe. In a
// Stage-2 brainstorm probe, every question is load-bearing by construction (only
// underivable build-changing gaps are probed), so any menu-style framing is a
// violation: a click is the weakest provenance rung; an OPEN question is what
// upgrades it to a cognition trace.
const MULTIPLE_CHOICE_PATTERNS = [
  // "(a) X ... (b) Y" — two or more lettered/numbered parenthetical options.
  /\(\s*[a-d1-4]\s*\)[\s\S]*?\(\s*[a-d1-4]\s*\)/i,
  // "option 1 ... option 2" / "option A ... option B".
  /\boption\s+(?:1|one|a)\b[\s\S]*?\boption\s+(?:2|two|b)\b/i,
  // "which do you prefer/choose/pick/want ..." menu prompts.
  /\bwhich\s+(?:do|would)\s+you\s+(?:prefer|choose|pick|want|like)\b/i,
  // "prefer/choose: X or Y" binary menu.
  /\b(?:prefer|choose|pick)\s*:?\s*\w+\s+or\s+\w+\b/i,
];

export function scanTurn(text) {
  const violations = [];
  for (const pat of LIBRARY_NAMES) {
    const m = text.match(pat);
    if (m) violations.push({ category: 'library', token: m[0] });
  }
  for (const { re, category } of SOLUTION_PATTERNS) {
    const m = text.match(re);
    if (m) violations.push({ category, token: m[0] });
  }
  for (const re of MULTIPLE_CHOICE_PATTERNS) {
    const m = text.match(re);
    if (m) { violations.push({ category: 'multiple-choice-probe', token: m[0] }); break; }
  }
  return violations;
}
