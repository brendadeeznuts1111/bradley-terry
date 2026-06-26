import { beforeEach, describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { BradleyTerry, BradleyTerryLive } from "../src/bradley-terry/index.js";
import type { EntityId, Match } from "../src/schema.js";
import { handleHealth } from "../src/server/handlers.js";
import { disposeAppRuntime } from "../src/server/runtime.js";
import { AppLive, RatingsDB } from "../src/service/index.js";

const sampleMatches: Match[] = [
	{ winner: "A" as EntityId, loser: "B" as EntityId },
	{ winner: "B" as EntityId, loser: "C" as EntityId },
	{ winner: "C" as EntityId, loser: "A" as EntityId },
];

describe("BradleyTerry.fit", () => {
	it("converges on a small round-robin", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const bt = yield* BradleyTerry;
				return yield* bt.fit(sampleMatches);
			}).pipe(Effect.provide(BradleyTerryLive)),
		);
		expect(result.entityCount).toBe(3);
		expect(result.matchCount).toBe(3);
		expect(result.ratings.get("A" as EntityId)).toBeGreaterThan(0);
	});
});

describe("RatingsDB", () => {
	beforeEach(async () => {
		await disposeAppRuntime();
	});

	it("reports stats after storing ratings", async () => {
		const testDbPath = `/tmp/bt-stats-${Date.now()}.db`;
		process.env.DB_PATH = testDbPath;

		await Effect.runPromise(
			Effect.gen(function* () {
				const db = yield* RatingsDB;
				yield* db.storeBT(
					[
						{
							teamID: "A",
							teamName: "Alpha",
							rating: 1.2,
							confidence: 0.9,
							rank: 1,
							sport: "test",
							season: "2026",
						},
					],
					"test",
					"2026",
				);
				const stats = yield* db.getStats();
				expect(stats.teamCount).toBe(1);
				expect(stats.lastUpdated).toBeDefined();
			}).pipe(Effect.provide(AppLive)),
		);
	});

	it("stores and retrieves BT ratings", async () => {
		const testDbPath = `/tmp/bt-test-${Date.now()}.db`;
		process.env.DB_PATH = testDbPath;

		const ratings = [
			{
				teamID: "A",
				teamName: "Alpha",
				rating: 1.2,
				confidence: 0.9,
				rank: 1,
				sport: "test",
				season: "2026",
			},
		];

		await Effect.runPromise(
			Effect.gen(function* () {
				const db = yield* RatingsDB;
				yield* db.storeBT(ratings, "test", "2026");
				const loaded = yield* db.getBT("test", "2026");
				expect(loaded).toHaveLength(1);
				expect(loaded[0]?.teamID).toBe("A");
			}).pipe(Effect.provide(AppLive)),
		);
	});

	it("appends history rows on each storeBT", async () => {
		const testDbPath = `/tmp/bt-history-${Date.now()}.db`;
		process.env.DB_PATH = testDbPath;

		const rating = {
			teamID: "A",
			teamName: "Alpha",
			rating: 1.2,
			confidence: 0.9,
			rank: 1,
			sport: "test",
			season: "2026",
		};

		await Effect.runPromise(
			Effect.gen(function* () {
				const db = yield* RatingsDB;
				yield* db.storeBT([rating], "test", "2026");
				yield* db.storeBT([{ ...rating, rating: 1.4 }], "test", "2026");
				const history = yield* db.getHistory("test", "2026");
				expect(history.length).toBeGreaterThanOrEqual(2);
				expect(history[0]?.snapshotAt).toBeDefined();
			}).pipe(Effect.provide(AppLive)),
		);
	});
});

describe("HTTP handlers", () => {
	it("GET /health returns ok with checks", async () => {
		const res = await handleHealth();
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
		expect(body.version).toBeDefined();
		expect(body.checks.db).toBeDefined();
	});
});
