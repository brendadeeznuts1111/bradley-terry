import { Effect } from "effect";
import fc from "fast-check";
import { BradleyTerry, BradleyTerryLive } from "../../bradley-terry";
import type { EntityId, Match } from "../../src/schema";

export function entityArb(maxLength = 16): fc.Arbitrary<EntityId> {
	return fc.string({ minLength: 3, maxLength }).map((s) => s as EntityId);
}

export interface MatchArbOptions {
	withDate?: boolean;
	withWeight?: boolean;
	maxEntityLength?: number;
}

export function matchArb(options: MatchArbOptions = {}): fc.Arbitrary<Match> {
	const baseRecord: Record<string, fc.Arbitrary<unknown>> = {
		winner: entityArb(options.maxEntityLength ?? 16),
		loser: entityArb(options.maxEntityLength ?? 16),
	};

	if (options.withDate) {
		baseRecord["date"] = fc.option(fc.date());
	}
	if (options.withWeight) {
		baseRecord["weight"] = fc.option(
			fc.float({ min: Math.fround(0.1), max: Math.fround(8) }),
		);
	}

	return fc
		.record(
			baseRecord as {
				winner: fc.Arbitrary<EntityId>;
				loser: fc.Arbitrary<EntityId>;
			},
		)
		.filter((m) => m.winner !== m.loser) as fc.Arbitrary<Match>;
}

export function matchesArb(
	options: MatchArbOptions & { minLength?: number; maxLength?: number } = {},
): fc.Arbitrary<Match[]> {
	const { minLength = 4, maxLength = 120, ...matchOptions } = options;
	return fc.array(matchArb(matchOptions), { minLength, maxLength });
}

export function fitEffect(matches: readonly Match[]) {
	return Effect.provide(
		Effect.gen(function* () {
			const bt = yield* BradleyTerry;
			return yield* bt.fit(matches);
		}),
		BradleyTerryLive,
	);
}

export function fitMatches(matches: readonly Match[]) {
	return Effect.runPromise(fitEffect(matches));
}

export function predictWinProbability(
	ratings: ReadonlyMap<EntityId, number>,
	a: EntityId,
	b: EntityId,
) {
	return Effect.runPromise(
		Effect.provide(
			Effect.gen(function* () {
				const bt = yield* BradleyTerry;
				return yield* bt.predictWinProbability(ratings, a, b);
			}),
			BradleyTerryLive,
		),
	);
}
