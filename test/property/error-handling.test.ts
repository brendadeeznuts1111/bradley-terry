import { describe, expect, it } from "bun:test";
import fc from "fast-check";
import { Effect, Cause } from "effect";
import { BradleyTerry, BradleyTerryLive } from "../../bradley-terry";
import {
  SelfMatchError,
  InsufficientDataError,
  ConvergenceError,
  DisconnectedGraphError,
  EntityNotFoundError,
} from "../../schema";
import type { EntityId, BradleyTerryError } from "../../schema";

// ============================================
// Arbitraries
// ============================================

const entityArb = fc
  .string({ minLength: 3, maxLength: 12 })
  .map((s) => s as EntityId);

// ============================================
// Helpers
// ============================================

function fitEffect(matches: readonly any[]) {
  return Effect.provide(
    Effect.gen(function* () {
      const bt = yield* BradleyTerry;
      return yield* bt.fit(matches);
    }),
    BradleyTerryLive
  );
}

async function expectFailure<T>(
  effect: Effect.Effect<T, BradleyTerryError>
): Promise<BradleyTerryError> {
  const exit = await Effect.runPromiseExit(effect);
  expect(exit._tag).toBe("Failure");

  if (exit._tag !== "Failure") {
    throw new Error("Expected Failure exit");
  }

  const failure = Cause.failureOption(exit.cause);
  expect(failure._tag).toBe("Some");

  if (failure._tag !== "Some") {
    throw new Error("Expected Some(failure) from Cause");
  }

  return failure.value as BradleyTerryError;
}

// ============================================
// Property Tests
// ============================================

describe("error-handling", () => {
  it("self-matches always produce SelfMatchError", async () => {
    await fc.assert(
      fc.asyncProperty(
        entityArb,
        async (entity) => {
          const badMatch = { winner: entity, loser: entity };
          const error = await expectFailure(fitEffect([badMatch as any]));
          expect(error).toBeInstanceOf(SelfMatchError);
        }
      ),
      { numRuns: 20 }
    );
  });

  it("empty match list produces InsufficientDataError", async () => {
    const error = await expectFailure(fitEffect([]));
    expect(error).toBeInstanceOf(InsufficientDataError);
  });

  it.each([
    ["SelfMatchError", SelfMatchError],
    ["InsufficientDataError", InsufficientDataError],
    ["ConvergenceError", ConvergenceError],
    ["DisconnectedGraphError", DisconnectedGraphError],
    ["EntityNotFoundError", EntityNotFoundError],
  ] as const)("error type %s is a tagged BradleyTerryError", (_label, ErrorClass) => {
    const instance = new ErrorClass(
      // minimal constructor args — each tagged error accepts an object payload
      {} as any
    );
    expect(instance._tag).toBeDefined();
  });
});
