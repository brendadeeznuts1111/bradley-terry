import { test, expect } from "bun:test";
import { fc } from "fast-check";
import { Effect } from "effect";
import { BradleyTerry, BradleyTerryLive } from "../../bradley-terry";
import { SelfMatchError, InsufficientDataError } from "../../schema";
import type { EntityId } from "../../schema";

const entityArb = fc.string({ minLength: 3, maxLength: 12 }).map(s => s as EntityId);

test("self-matches always produce SelfMatchError", async () => {
  await fc.assert(
    fc.asyncProperty(
      entityArb,
      async (entity) => {
        const badMatch = { winner: entity, loser: entity };

        const result = Effect.provide(
          Effect.gen(function* () {
            const bt = yield* BradleyTerry;
            return yield* bt.fit([badMatch as any]);
          }),
          BradleyTerryLive
        );

        const exit = await Effect.runPromiseExit(result);
        expect(exit._tag).toBe("Failure");

        if (exit._tag === "Failure") {
          expect(exit.cause).toBeInstanceOf(SelfMatchError);
        }
      }
    ),
    { numRuns: 20 }
  );
});

test("empty match list produces InsufficientDataError", async () => {
  const result = Effect.provide(
    Effect.gen(function* () {
      const bt = yield* BradleyTerry;
      return yield* bt.fit([]);
    }),
    BradleyTerryLive
  );

  const exit = await Effect.runPromiseExit(result);
  expect(exit._tag).toBe("Failure");

  if (exit._tag === "Failure") {
    expect(exit.cause).toBeInstanceOf(InsufficientDataError);
  }
});