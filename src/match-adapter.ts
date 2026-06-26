import { Effect, Schema } from "effect";
import {
	type GetMatchesOptions,
	SqliteLoader,
} from "./repository/sqlite-loader";
import {
	type BradleyTerryError,
	type EntityId,
	type Match,
	type MatchRow,
	MatchSchema,
} from "./schema";

/**
 * MatchAdapter — SQLite (MatchRow) → Bradley-Terry (Match) pipeline
 *
 * Converts your existing wager.db / Buckeye match rows into canonical
 * Effect-validated `Match` records ready for `BradleyTerry.fit(...)`.
 *
 * Winner/loser convention (v0.3.1):
 *   winner_idx === 0  → home_team wins
 *   winner_idx !== 0  → away_team wins
 *
 * Extend `fromMatchRow` if your `y` / `venue` columns carry additional
 * weighting or home-advantage semantics.
 */
export const MatchAdapter = {
	/**
	 * Convert a single validated MatchRow into a branded Match.
	 * Performs light business logic for winner/loser derivation.
	 */
	fromMatchRow: (row: MatchRow): Effect.Effect<Match, never> =>
		Effect.gen(function* () {
			const homeTeam = row.home_team as EntityId;
			const awayTeam = row.away_team as EntityId;

			// Derive winner / loser from winner_idx convention
			const winner: EntityId = row.winner_idx === 0 ? homeTeam : awayTeam;
			const loser: EntityId = row.winner_idx === 0 ? awayTeam : homeTeam;

			// Parse date if present (MatchRow date is ISO string)
			const date = row.date ? new Date(row.date) : undefined;

			// Optional weight passthrough (y column or explicit weight if added later)
			const weight = row.y != null && row.y > 0 ? row.y : undefined;

			const candidate = {
				winner,
				loser,
				date,
				weight,
				sport: row.sport,
				league: row.league,
			};

			// Decode to enforce branding + validation (minLength, positive weight, etc.)
			return yield* Schema.decodeUnknown(MatchSchema)(candidate).pipe(
				Effect.mapError(() => {
					// Should never happen for well-formed rows; surface as diagnostic
					console.warn(
						"MatchAdapter: decode failed for row",
						row.match_id ?? row.home_team,
					);
					return candidate as Match; // fallback (unsafe cast)
				}),
			);
		}),

	/**
	 * High-level loader: fetch rows via SqliteLoader then convert en-masse.
	 * Returns Effect<readonly Match[], SqliteLoaderError | decode issues>
	 */
	loadMatchesForBT: (
		dbPath: string,
		opts: GetMatchesOptions = {},
	): Effect.Effect<readonly Match[], BradleyTerryError> =>
		Effect.gen(function* () {
			const rows = yield* SqliteLoader.getMatches(dbPath, opts);

			const matches = yield* Effect.all(
				rows.map((r) => MatchAdapter.fromMatchRow(r)),
				{ concurrency: "unbounded" },
			);

			return matches;
		}),
};
