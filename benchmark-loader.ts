/**
 * Simple benchmark runner utility.
 * Runs a function N times and reports timing statistics.
 */

export interface BenchResult {
  name: string;
  runs: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  totalMs: number;
}

export async function runBench(
  name: string,
  fn: () => Promise<void>,
  runs: number = 3
): Promise<BenchResult> {
  const times: number[] = [];

  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    const elapsed = performance.now() - start;
    times.push(elapsed);
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  const meanMs = totalMs / runs;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);

  return { name, runs, meanMs, minMs, maxMs, totalMs };
}
