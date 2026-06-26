import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { handleGetHistory, handleRefresh } from "../src/server/handlers.js";
import { disposeAppRuntime } from "../src/server/runtime.js";
import { AppLive, RatingsDB } from "../src/service/index.js";

const sampleMassey = {
	teams: [
		{ teamId: "A", teamName: "Alpha" },
		{ teamId: "B", teamName: "Beta" },
		{ teamId: "C", teamName: "Gamma" },
	],
	results: [
		{ homeTeamId: "A", awayTeamId: "B", homeScore: 2, awayScore: 1 },
		{ homeTeamId: "B", awayTeamId: "C", homeScore: 1, awayScore: 0 },
		{ homeTeamId: "C", awayTeamId: "A", homeScore: 3, awayScore: 2 },
	],
	sport: "test",
	season: "2026",
};

describe("POST /api/ratings/refresh integration", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(async () => {
		originalFetch = globalThis.fetch;
		process.env.DB_PATH = `/tmp/bt-refresh-${Date.now()}-${Math.random()}.db`;
		process.env.SECRETS_BACKEND = "env";
		await disposeAppRuntime();
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		await disposeAppRuntime();
	});

	it("fetches Massey data, computes BT ratings, and persists them", async () => {
		globalThis.fetch = () =>
			Promise.resolve(
				new Response(JSON.stringify(sampleMassey), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);

		const res = await handleRefresh();
		expect(res.status).toBe(202);

		const body = await res.json();
		expect(body.stored).toBe(3);
		expect(body.sport).toBe("test");
		expect(body.season).toBe("2026");

		const ratings = await Effect.runPromise(
			Effect.gen(function* () {
				const db = yield* RatingsDB;
				return yield* db.getBT("test", "2026");
			}).pipe(Effect.provide(AppLive)),
		);

		expect(ratings).toHaveLength(3);
		expect(ratings.every((r) => r.rating > 0)).toBe(true);

		const historyRes = await handleGetHistory("test", "2026");
		expect(historyRes.status).toBe(200);
		const history = await historyRes.json();
		expect(history.length).toBeGreaterThanOrEqual(3);
		expect(history[0]?.snapshotAt).toBeDefined();
	});

	it("returns 502 when Massey fetch fails", async () => {
		globalThis.fetch = () => Promise.reject(new Error("network down"));

		const res = await handleRefresh();
		expect(res.status).toBe(502);
		const body = await res.json();
		expect(body.error).toBe("MasseyFetchError");
	});
});
