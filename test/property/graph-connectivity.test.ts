import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { Effect } from "effect";
import { BradleyTerry, BradleyTerryLive } from "../../bradley-terry";
import type { EntityId } from "../../schema";

// ============================================
// Arbitraries
// ============================================

const entityArb = fc
  .string({ minLength: 3, maxLength: 12 })
  .map((s) => s as EntityId);

const matchArb = fc
  .record({
    winner: entityArb,
    loser: entityArb,
  })
  .filter((m) => m.winner !== m.loser);

// ============================================
// Helpers
// ============================================

async function fitMatches(matches: readonly { winner: EntityId; loser: EntityId }[]) {
  return Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const bt = yield* BradleyTerry;
        return yield* bt.fit(matches);
      }),
      BradleyTerryLive
    )
  );
}

// ============================================
// Property Tests
// ============================================

describe("graph-connectivity", () => {
  it("largestComponentSize reflects the biggest connected component", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(matchArb, { minLength: 5, maxLength: 80 }),
        async (matches) => {
          const result = await fitMatches(matches);

          expect(result.largestComponentSize).toBeGreaterThanOrEqual(1);
          expect(result.largestComponentSize).toBeLessThanOrEqual(
            result.entityCount
          );

          if (result.warnings?.some((w) => w.includes("disconnected"))) {
            expect(result.largestComponentSize).toBeLessThan(result.entityCount);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it("disconnected graphs still produce valid ratings for the largest component", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(matchArb, { minLength: 6, maxLength: 60 }),
        async (matches) => {
          const result = await fitMatches(matches);

          expect(result.ratings.size).toBeGreaterThan(0);
          expect(result.entityCount).toBeGreaterThan(0);
        }
      ),
      { numRuns: 25 }
    );
  });
});
