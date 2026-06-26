/**
 * Complete Bradley-Terry usage example.
 *
 * Demonstrates match data ingestion, model fitting via the Effect service,
 * and rating extraction. Run with: bun run start
 */
import { Effect } from "effect";
import { BradleyTerry, BradleyTerryLive } from "../src/bradley-terry";
import type { EntityId, Match } from "../src/schema";

const matches: Match[] = [
	{ winner: "A" as EntityId, loser: "B" as EntityId, weight: 1 },
	{ winner: "A" as EntityId, loser: "B" as EntityId, weight: 1 },
	{ winner: "B" as EntityId, loser: "C" as EntityId, weight: 1 },
	{ winner: "B" as EntityId, loser: "C" as EntityId, weight: 1 },
	{ winner: "C" as EntityId, loser: "A" as EntityId, weight: 1 },
];

const program = Effect.provide(
	Effect.gen(function* () {
		const bt = yield* BradleyTerry;
		return yield* bt.fit(matches);
	}),
	BradleyTerryLive,
);

const fit = await Effect.runPromise(program);
console.log("Ratings:");
for (const [entity, rating] of fit.ratings) {
	console.log(`  ${entity}: ${rating.toFixed(4)}`);
}
console.log("Log-likelihood:", fit.logLikelihood);
console.log("Iterations:", fit.iterations);
