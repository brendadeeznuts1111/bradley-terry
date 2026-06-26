import { Context, Effect, Layer } from "effect";
import { BradleyTerry, BradleyTerryLive } from "../bradley-terry/index.js";
import type { EntityId, Match } from "../schema.js";
import { BTComputationError } from "./errors.js";
import type { BTRating, MasseyData } from "./schemas.js";

export interface BTComputeApi {
	readonly compute: (data: MasseyData) => Effect.Effect<readonly BTRating[], BTComputationError>;
}

export class BTCompute extends Context.Tag("BTCompute")<BTCompute, BTComputeApi>() {}

function masseyToMatches(data: MasseyData): Match[] {
	const matches: Match[] = [];

	for (const r of data.results) {
		if (r.homeScore === r.awayScore) continue;
		const homeWins = r.homeScore > r.awayScore;
		const winner = (homeWins ? r.homeTeamId : r.awayTeamId) as EntityId;
		const loser = (homeWins ? r.awayTeamId : r.homeTeamId) as EntityId;
		matches.push({
			winner,
			loser,
			date: r.date ? new Date(r.date) : undefined,
			sport: data.sport,
			league: data.season,
		});
	}

	return matches;
}

function toRatings(data: MasseyData, fit: Awaited<ReturnType<typeof rankRatings>>): BTRating[] {
	const names = new Map(data.teams.map((t) => [t.teamId, t.teamName]));
	return fit.map((row, i) => ({
		teamID: row.teamId,
		teamName: names.get(row.teamId) ?? row.teamId,
		rating: row.rating,
		confidence: row.confidence,
		rank: i + 1,
		sport: data.sport,
		season: data.season,
	}));
}

function rankRatings(strengths: Map<EntityId, number>) {
	return [...strengths.entries()]
		.map(([teamId, rating]) => ({
			teamId,
			rating,
			confidence: Math.min(1, Math.max(0.1, rating / (rating + 1))),
		}))
		.sort((a, b) => b.rating - a.rating);
}

export const BTComputeLive = Layer.succeed(BTCompute, {
	compute: (data) =>
		Effect.gen(function* () {
			const matches = masseyToMatches(data);
			const teamCount = data.teams.length;

			const result = yield* Effect.gen(function* () {
				const bt = yield* BradleyTerry;
				return yield* bt.fit(matches);
			}).pipe(
				Effect.provide(BradleyTerryLive),
				Effect.mapError((cause) => new BTComputationError({ cause, teamCount })),
			);

			const ranked = rankRatings(result.ratings);
			return toRatings(data, ranked);
		}),
});
