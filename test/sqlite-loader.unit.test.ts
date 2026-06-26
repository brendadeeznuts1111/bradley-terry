import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { type EntityId } from "../src/schema";
import { BradleyTerry, BradleyTerryLive } from "../src/bradley-terry";
import { MatchAdapter } from "../src/match-adapter";
import { SqliteLoader } from "../src/repository/sqlite-loader";
import {
	cleanupWagerFixtures,
	createWagerFixtureDb,
	createWagerFixtureFromSql,
	trackWagerFixtureDir,
} from "./helpers/wager-fixture";

afterEach(() => {
	cleanupWagerFixtures();
});

describe("SqliteLoader", () => {
	it("returns decoded MatchRow records from a fixture DB", async () => {
		const dbPath = createWagerFixtureDb([
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

	it("loads committed Buckeye SQL fixture (wager-matches.sql)", async () => {
		const dbPath = createWagerFixtureFromSql();
		const rows = await Effect.runPromise(
			SqliteLoader.getMatches(dbPath, { sport: "fbs", league: "ncaa" }),
		);

		expect(rows).toHaveLength(3);
		expect(rows.map((r) => r.match_id)).toEqual(["buckeye-003", "buckeye-002", "buckeye-001"]);
	});

	it("filters by sport, league, since, and limit", async () => {
		const dbPath = createWagerFixtureDb([
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
		trackWagerFixtureDir(dir);
		const dbPath = join(dir, "empty.db");
		const db = new Database(dbPath, { create: true });
		db.exec("CREATE TABLE other (id INTEGER)");
		db.close();

		await expect(Effect.runPromise(SqliteLoader.getMatches(dbPath))).rejects.toThrow(
			'Table "matches" not found',
		);
	});

	it("initSchema creates the matches table on a fresh database", async () => {
		const dir = mkdtempSync(join(tmpdir(), "bt-sqlite-init-"));
		trackWagerFixtureDir(dir);
		const dbPath = join(dir, "fresh.db");

		await Effect.runPromise(SqliteLoader.initSchema(dbPath));
		const count = await Effect.runPromise(SqliteLoader.countMatches(dbPath));
		expect(count).toBe(0);
	});

	it("countMatches respects filters and limit cap", async () => {
		const dbPath = createWagerFixtureDb([
			{
				home_team: "a",
				away_team: "b",
				winner_idx: 0,
				loser_idx: 1,
				date: "2026-01-01T00:00:00.000Z",
				sport: "fbs",
			},
			{
				home_team: "c",
				away_team: "d",
				winner_idx: 0,
				loser_idx: 1,
				date: "2026-02-01T00:00:00.000Z",
				sport: "fbs",
			},
			{
				home_team: "e",
				away_team: "f",
				winner_idx: 0,
				loser_idx: 1,
				date: "2026-02-01T00:00:00.000Z",
				sport: "nba",
			},
		]);

		expect(await Effect.runPromise(SqliteLoader.countMatches(dbPath, { sport: "fbs" }))).toBe(2);
		expect(
			await Effect.runPromise(SqliteLoader.countMatches(dbPath, { sport: "fbs", limit: 1 })),
		).toBe(1);
	});
});

describe("SqliteLoader → MatchAdapter → BradleyTerry", () => {
	it("fits ratings from SQLite fixture matches", async () => {
		const dbPath = createWagerFixtureDb([
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

	it("fits ratings from committed Buckeye SQL fixture", async () => {
		const dbPath = createWagerFixtureFromSql();
		const matches = await Effect.runPromise(
			MatchAdapter.loadMatchesForBT(dbPath, { sport: "fbs" }),
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

		expect(fit.ratings.size).toBe(3);
		expect(fit.matchCount).toBe(3);
		expect(fit.ratings.has("ohio-state" as EntityId)).toBe(true);
	});
});
