import { test, expect } from "bun:test";
import fc from "fast-check";
import { Effect } from "effect";
import { BradleyTerry, BradleyTerryLive } from "../../bradley-terry";
import type { EntityId } from "../../schema";

const entityArb = fc
  .string({ minLength: 3, maxLength: 16 })
  .map((s) => s as EntityId);

const matchArb = fc
  .record({
    winner: entityArb,
    loser: entityArb,
    date: fc.option(fc.date()),
    weight: fc.option(fc.float({ min: Math.fround(0.1), max: Math.fround(8) })),
  })
  .filter((m) => m.winner !== m.loser);

const largeMatchSetArb = fc.array(matchArb, {
  minLength: 40_000,
  maxLength: 60_000,
});

test("fit 50k matches under 1.5 seconds", async () => {
  const matches = await fc.sample(largeMatchSetArb, 1)[0];

  const start = performance.now();

  const result = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const bt = yield* BradleyTerry;
        return yield* bt.fit(matches, {
          maxIterations: 200,
          timeDecayHalfLifeDays: 90,
        });
      }),
      BradleyTerryLive
    )
  );

  const duration = performance.now() - start;

  expect(result.entityCount).toBeGreaterThan(10);
  expect(duration).toBeLessThan(1500);

  console.log(`[Benchmark] 50k matches fit in ${duration.toFixed(0)}ms`);
}, 30_000);