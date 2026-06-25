import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { Effect } from "effect";
import { BradleyTerry, BradleyTerryLive } from "../../bradley-terry";
import type { Match, EntityId } from "../../schema";

// ============================================
// Arbitraries
// ============================================

const entityArb = fc
  .string({ minLength: 3, maxLength: 16 })
  .map((s) => s as EntityId);

const matchArb = fc
  .record({
    winner: entityArb,
    loser: entityArb,
    date: fc.option(
      fc.date({
        min: new Date("2024-01-01"),
        max: new Date("2026-12-31"),
      })
    ),
    weight: fc.option(fc.float({ min: Math.fround(0.1), max: Math.fround(8) })),
  })
  .filter((m) => m.winner !== m.loser);

const matchesArb = fc.array(matchArb, {
  minLength: 4,
  maxLength: 120,
});

// ============================================
// Helpers
// ============================================

async function fitMatches(matches: readonly Match[]) {
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

async function predict(
  ratings: ReadonlyMap<EntityId, number>,
  a: EntityId,
  b: EntityId
) {
  return Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const bt = yield* BradleyTerry;
        return yield* bt.predictWinProbability(ratings, a, b);
      }),
      BradleyTerryLive
    )
  );
}

// ============================================
// Property Tests
// ============================================

describe("mm-invariants", () => {
  it("win probabilities are symmetric and sum to 1", async () => {
    await fc.assert(
      fc.asyncProperty(matchesArb, async (matches) => {
        const fitResult = await fitMatches(matches);

        const entities = Array.from(fitResult.ratings.keys());
        const sampleSize = Math.min(entities.length, 12);
        const sampled = entities.slice(0, sampleSize);

        for (let i = 0; i < sampled.length; i++) {
          for (let j = i + 1; j < sampled.length; j++) {
            const p1 = await predict(fitResult.ratings, sampled[i], sampled[j]);
            const p2 = await predict(fitResult.ratings, sampled[j], sampled[i]);

            expect(p1 + p2).toBeCloseTo(1, 10);
            expect(p1).toBeGreaterThanOrEqual(0);
            expect(p1).toBeLessThanOrEqual(1);
          }
        }
      }),
      {
        numRuns: 40,
        endOnFailure: true,
        verbose: true,
      }
    );
  });

  it("adding a win for A over B never decreases A's relative strength", async () => {
    await fc.assert(
      fc.asyncProperty(
        matchesArb,
        entityArb,
        entityArb,
        async (baseMatches, a, b) => {
          if (a === b) return true;

          const result1 = await fitMatches(baseMatches);

          const extraMatch: Match = {
            winner: a,
            loser: b,
            date: new Date(),
          };
          const result2 = await fitMatches([...baseMatches, extraMatch]);

          const strengthA1 = result1.ratings.get(a) ?? 0;
          const strengthB1 = result1.ratings.get(b) ?? 0;
          const strengthA2 = result2.ratings.get(a) ?? 0;
          const strengthB2 = result2.ratings.get(b) ?? 0;

          const ratio1 = strengthA1 / (strengthA1 + strengthB1 || 1);
          const ratio2 = strengthA2 / (strengthA2 + strengthB2 || 1);

          expect(ratio2).toBeGreaterThanOrEqual(ratio1 - 0.0001);
        }
      ),
      {
        numRuns: 30,
        endOnFailure: true,
      }
    );
  });
});
