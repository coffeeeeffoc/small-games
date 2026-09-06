import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

/** Measures one deployed Runtime HTTP operation against the ticket's load and latency targets. */
export async function measureCapacity(name, limitMs, request) {
  const samples = [];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: 100 }, async (_, index) => {
      const requestStarted = performance.now();
      const response = await request(index);
      assert.equal(response.status, 200);
      samples.push(performance.now() - requestStarted);
    }),
  );
  const elapsed = performance.now() - started;
  samples.sort((a, b) => a - b);
  const p95 = samples[94];
  const rps = 100_000 / elapsed;
  console.log(`${name}: ${rps.toFixed(0)} RPS, p95 ${p95.toFixed(1)}ms (limit ${limitMs}ms)`);
  assert.ok(rps >= 100, `${name} throughput is below 100 RPS`);
  assert.ok(p95 < limitMs, `${name} p95 exceeds ${limitMs}ms`);
}
