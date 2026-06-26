import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { BradleyTerry, BradleyTerryLive } from "../src/bradley-terry";
import { MatchAdapter } from "../src/match-adapter";
import { MATCHES_TABLE_DDL, SqliteLoader } from "../src/repository/sqlite-loader";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

function createFixtureDb(
	rows: Array<{
		match_id?: string;
		home_team: string;
		away_team: string;
		winner_idx: number;
		loser_idx: number;
		date: string;
		sport?: string;
		league?: string;
		y?: number;
	}>,
): string {
	const dir = mkdtempSync(join(tmpdir(), "bt-sqlite-loader-"));
	tempDirs.push(dir);
	const dbPath = join(dir, "wager.db");
	const db = new Database(dbPath, { create: true });
	db.exec(MATCHES_TABLE_DDL);

	const insert = db.prepare(`
		INSERT INTO matches (match_id, home_team, away_team, winner_idx, loser_idx, date, sport, league, y)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);

	for (const row of rows) {
		insert.run(
			row.match_id ?? null,
			row.home_team,
			row.away_team,
			row.winner_idx,
			row.loser_idx,
			row.date,
			row.sport ?? null,
			row.league ?? null,
			row.y ?? null,
		);
	}

	db.close();
	return dbPath;
}

describe("SqliteLoader", () => {
	it("returns decoded MatchRow records from a fixture DB", async () => {
		const dbPath = createFixtureDb([
			{
				match_id: "m1",
				home_team: "alpha",
				away_team: "beta",
				winner_idx: 0,
				loser_idx: 1,
				date: "2026-01-10T00:00:00.000Z",
				sport: "fbs",
				league: "ncaa",
			},
			{
				home_team: "beta",
				away_team: "gamma",
				winner_idx: 1,
				loser_idx: 0,
				date: "2026-01-15T00:00:00.000Z",
				sport: "fbs",
				league: "ncaa",
			},
		]);

		const rows = await Effect.runPromise(SqliteLoader.getMatches(dbPath));
		expect(rows).toHaveLength(2);
		expect(rows[0].home_team).toBe("alpha");
		expect(rows[1].winner_idx).toBe(1);
	});

	it("filters by sport, league, since, and limit", async () => {
		const dbPath = createFixtureDb([
			{
				home_team: "a",
				away_team: "b",
				winner_idx: 0,
				loser_idx: 1,
				date: "2026-01-01T00:00:00.000Z",
				sport: "fbs",
				league: "ncaa",
			},
			{
				home_team: "c",
				away_team: "d",
				winner_idx: 0,
				loser_idx: 1,
				date: "2026-02-01T00:00:00.000Z",
				sport: "fbs",
				league: "ncaa",
			},
			{
				home_team: "e",
				away_team: "f",
				winner_idx: 0,
				loser_idx: 1,
				date: "2026-02-01T00:00:00.000Z",
				sport: "nba",
				league: "pro",
			},
		]);

		const filtered = await Effect.runPromise(
			SqliteLoader.getMatches(dbPath, {
				sport: "fbs",
				league: "ncaa",
				since: new Date("2026-01-15T00:00:00.000Z"),
				limit: 1,
			}),
		);

		expect(filtered).toHaveLength(1);
		expect(filtered[0].home_team).toBe("c");
	});

	it("fails with SqliteLoaderError when matches table is missing", async () => {
		const dir = mkdtempSync(join(tmpdir(), "bt-sqlite-empty-"));
		tempDirs.push(dir);
		const dbPath = join(dir, "empty.db");
		const db = new Database(dbPath, { create: true });
		db.exec("CREATE TABLE other (id INTEGER)");
		db.close();

		await expect(Effect.runPromise(SqliteLoader.getMatches(dbPath))).rejects.toThrow(
			'Table "matches" not found',
		);
	});
});

describe("SqliteLoader → MatchAdapter → BradleyTerry", () => {
	it("fits ratings from SQLite fixture matches", async () => {
		const dbPath = createFixtureDb([
			{
				home_team: "lakers",
				away_team: "celtics",
				winner_idx: 0,
				loser_idx: 1,
				date: "2026-01-10T00:00:00.000Z",
			},
			{
				home_team: "celtics",
				away_team: "warriors",
				winner_idx: 0,
				loser_idx: 1,
				date: "2026-01-11T00:00:00.000Z",
			},
			{
				home_team: "warriors",
				away_team: "lakers",
				winner_idx: 0,
				loser_idx: 1,
				date: "2026-01-12T00:00:00.000Z",
			},
		]);

		const matches = await Effect.runPromise(MatchAdapter.loadMatchesForBT(dbPath));
		expect(matches.length).toBeGreaterThanOrEqual(3);

		const fit = await Effect.runPromise(
			Effect.provide(
				Effect.gen(function* () {
					const bt = yield* BradleyTerry;
					return yield* bt.fit([...matches]);
				}),
				BradleyTerryLive,
			),
		);

		expect(fit.ratings.size).toBeGreaterThanOrEqual(3);
		expect(fit.matchCount).toBe(3);
	});
});
