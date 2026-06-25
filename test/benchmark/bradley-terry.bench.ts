import { expect, test } from "bun:test";
import { Effect } from "effect";
import fc from "fast-check";
import { BradleyTerry, BradleyTerryLive } from "../../bradley-terry";
import { matchArb } from "../support/property";

const largeMatchSetArb = fc.array(
	matchArb({ withDate: true, withWeight: true }),
	{
		minLength: 40_000,
		maxLength: 60_000,
	},
);

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
			BradleyTerryLive,
		),
	);

	const duration = performance.now() - start;

	expect(result.entityCount).toBeGreaterThan(10);
	expect(duration).toBeLessThan(1500);

	console.log(`[Benchmark] 50k matches fit in ${duration.toFixed(0)}ms`);
}, 30_000);
