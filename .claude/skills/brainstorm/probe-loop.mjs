// Domain — Stage 2 probe loop (AC-004 boundary). Walks each gap, asks via
// the injected askFn, and re-queues unclosed gaps. Hard cap at 5 iterations;
// unclosed gaps after the cap become open_questions. Pure; no I/O.

const ITERATION_CAP = 5;

export function runProbeLoop({ gaps, askFn }) {
  const remaining = [...gaps];
  let iterations = 0;

  while (remaining.length > 0 && iterations < ITERATION_CAP) {
    iterations++;
    const gap = remaining.shift();
    const result = askFn(gap);
    if (!result || !result.closed) {
      remaining.push(gap);
    }
  }

  return {
    iterations,
    open_questions: remaining,
    advanced_to_stage_3: true,
  };
}
