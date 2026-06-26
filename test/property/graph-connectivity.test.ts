import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { fitMatches, matchArb } from "../support/property";

// ============================================
// Property Tests
// ============================================

describe("graph-connectivity", () => {
	it("largestComponentSize reflects the biggest connected component", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(matchArb({ maxEntityLength: 12 }), {
					minLength: 5,
					maxLength: 80,
				}),
				async (matches) => {
					const result = await fitMatches(matches);

					expect(result.largestComponentSize).toBeGreaterThanOrEqual(1);
					expect(result.largestComponentSize).toBeLessThanOrEqual(result.entityCount);

					if (result.warnings?.some((w) => w.includes("disconnected"))) {
						expect(result.largestComponentSize).toBeLessThan(result.entityCount);
					}
				},
			),
			{ numRuns: 30 },
		);
	});

	it("disconnected graphs still produce valid ratings for the largest component", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(matchArb({ maxEntityLength: 12 }), {
					minLength: 6,
					maxLength: 60,
				}),
				async (matches) => {
					const result = await fitMatches(matches);

					expect(result.ratings.size).toBeGreaterThan(0);
					expect(result.entityCount).toBeGreaterThan(0);
				},
			),
			{ numRuns: 25 },
		);
	});
});
