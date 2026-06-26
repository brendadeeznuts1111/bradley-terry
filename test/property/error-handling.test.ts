import { describe, expect, it } from "bun:test";
import { Cause, Effect } from "effect";
import fc from "fast-check";
import type { BradleyTerryError, EntityId } from "../../src/schema";
import {
	ConvergenceError,
	DisconnectedGraphError,
	EntityNotFoundError,
	InsufficientDataError,
	SelfMatchError,
} from "../../src/schema";
import { entityArb, fitEffect } from "../support/property";

// ============================================
// Helpers
// ============================================

async function expectFailure<T>(
	effect: Effect.Effect<T, BradleyTerryError>,
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
			fc.asyncProperty(entityArb(), async (entity) => {
				const badMatch = { winner: entity, loser: entity };
				const error = await expectFailure(
					fitEffect([badMatch as { winner: EntityId; loser: EntityId }]),
				);
				expect(error).toBeInstanceOf(SelfMatchError);
			}),
			{ numRuns: 20 },
		);
	});

	it("empty match list produces InsufficientDataError", async () => {
		const error = await expectFailure(fitEffect([]));
		expect(error).toBeInstanceOf(InsufficientDataError);
	});

	it.each([
		["SelfMatchError", new SelfMatchError({ entity: "abc" as EntityId })],
		[
			"InsufficientDataError",
			new InsufficientDataError({ message: "empty", matchCount: 0 }),
		],
		[
			"ConvergenceError",
			new ConvergenceError({ message: "diverged", iterations: 0 }),
		],
		[
			"DisconnectedGraphError",
			new DisconnectedGraphError({ components: 0, isolatedEntities: [] }),
		],
		[
			"EntityNotFoundError",
			new EntityNotFoundError({ entity: "xyz" as EntityId }),
		],
	] as const)("error type %s is a tagged BradleyTerryError", (_label, instance) => {
		expect(instance._tag).toBeDefined();
	});
});
