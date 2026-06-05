// Fixture module under mutation (AC-002). Small, pure, with a real conditional
// and arithmetic so Stryker has obvious mutants to introduce.
export function classify(n) {
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return 'zero';
}

export function double(n) {
  return n * 2;
}
