// maker-checker — the bounded round-trip's structural invariant. seed.md §II.A
// clause 6: exactly one maker and one checker, no fan-out, until the amendment
// lifts the cap. The round-trip runner asserts this before doing any work.

/** Throw unless the round-trip is configured with exactly one maker and one checker. */
export function assertBounded({ makers, checkers }) {
  if (makers !== 1 || checkers !== 1) {
    throw new Error(
      `§II.A clause 6: a bounded round-trip is exactly one maker, one checker — got makers=${makers}, checkers=${checkers}.`,
    );
  }
}
