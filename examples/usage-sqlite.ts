/**
 * Load historical matches from SQLite (wager.db / Buckeye) and fit BT ratings.
 *
 * Run: bun run examples/usage-sqlite.ts
 */
import { Database } from "bun:sqlite";
import { Effect } from "effect";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BradleyTerry, BradleyTerryLive } from "../src/bradley-terry";
import { MatchAdapter } from "../src/match-adapter";
import { MATCHES_TABLE_DDL, SqliteLoader } from "../src/repository/sqlite-loader";

const dir = mkdtempSync(join(tmpdir(), "bt-usage-sqlite-"));
const dbPath = join(dir, "wager.db");

try {
	const db = new Database(dbPath, { create: true });
	db.exec(MATCHES_TABLE_DDL);
	const insert = db.prepare(`
		INSERT INTO matches (home_team, away_team, winner_idx, loser_idx, date, sport, league)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	for (const row of [
		["lakers", "celtics", 0, 1, "2026-01-10T00:00:00.000Z", "nba", "pro"],
		["celtics", "warriors", 0, 1, "2026-01-11T00:00:00.000Z", "nba", "pro"],
		["warriors", "lakers", 0, 1, "2026-01-12T00:00:00.000Z", "nba", "pro"],
	]) {
		insert.run(...row);
	}
	db.close();

	const count = await Effect.runPromise(SqliteLoader.countMatches(dbPath, { sport: "nba" }));
	console.log(`Loaded ${count} NBA matches from ${dbPath}`);

	const matches = await Effect.runPromise(
		MatchAdapter.loadMatchesForBT(dbPath, { sport: "nba" }),
	);

	const fit = await Effect.runPromise(
		Effect.provide(
			Effect.gen(function* () {
				const bt = yield* BradleyTerry;
				return yield* bt.fit([...matches]);
			}),
			BradleyTerryLive,
		),
	);

	console.log("Ratings:");
	for (const [team, rating] of fit.ratings) {
		console.log(`  ${team}: ${rating.toFixed(4)}`);
	}
} finally {
	rmSync(dir, { recursive: true, force: true });
}
