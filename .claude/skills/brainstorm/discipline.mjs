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
  return violations;
}
