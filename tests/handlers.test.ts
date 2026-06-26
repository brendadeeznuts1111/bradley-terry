import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { handleRequest } from "../src/server/handlers.js";
import { resetRateLimits } from "../src/server/rate-limit.js";
import { disposeAppRuntime } from "../src/server/runtime.js";

const sampleMassey = {
	teams: [
		{ teamId: "A", teamName: "Alpha" },
		{ teamId: "B", teamName: "Beta" },
	],
	results: [{ homeTeamId: "A", awayTeamId: "B", homeScore: 1, awayScore: 0 }],
	sport: "e2e",
	season: "2026",
};

describe("HTTP handleRequest", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(async () => {
		originalFetch = globalThis.fetch;
		process.env.DB_PATH = `/tmp/bt-handlers-${Date.now()}.db`;
		process.env.SECRETS_BACKEND = "env";
		await disposeAppRuntime();
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		resetRateLimits();
		delete process.env.REFRESH_RATE_LIMIT;
		delete process.env.REFRESH_RATE_WINDOW;
		await disposeAppRuntime();
	});

	it("returns 404 for unknown routes", async () => {
		const res = await handleRequest(new Request("http://localhost/unknown"));
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error).toBe("NotFound");
	});

	it("returns 405 for wrong method on known route", async () => {
		const res = await handleRequest(
			new Request("http://localhost/api/ratings/refresh", { method: "GET" }),
		);
		expect(res.status).toBe(405);
		expect(res.headers.get("Allow")).toBe("POST");
	});

	it("handles OPTIONS preflight", async () => {
		const res = await handleRequest(
			new Request("http://localhost/api/ratings/bt", { method: "OPTIONS" }),
		);
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBeDefined();
	});

	it("GET /health includes db checks", async () => {
		const res = await handleRequest(new Request("http://localhost/health"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.checks.db).toBe("ok");
		expect(body.checks.secretsBackend).toBe("env");
	});

	it("GET /openapi.json returns OpenAPI document", async () => {
		const res = await handleRequest(new Request("http://localhost/openapi.json"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.openapi).toBe("3.1.0");
		expect(body.paths["/api/ratings/bt"]).toBeDefined();
	});

	it("GET /openapi.yaml returns YAML spec", async () => {
		const res = await handleRequest(new Request("http://localhost/openapi.yaml"));
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toContain("yaml");
		const text = await res.text();
		expect(text).toContain("openapi: 3.1.0");
	});

	it("GET /api/ratings/bt returns empty array when no data", async () => {
		const res = await handleRequest(
			new Request("http://localhost/api/ratings/bt?sport=empty&season=2026"),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});

	it("POST refresh then GET ratings end-to-end", async () => {
		globalThis.fetch = () =>
			Promise.resolve(new Response(JSON.stringify(sampleMassey), { status: 200 }));

		const refresh = await handleRequest(
			new Request("http://localhost/api/ratings/refresh", { method: "POST" }),
		);
		expect(refresh.status).toBe(202);

		const ratings = await handleRequest(
			new Request("http://localhost/api/ratings/bt?sport=e2e&season=2026"),
		);
		expect(ratings.status).toBe(200);
		const body = await ratings.json();
		expect(body).toHaveLength(2);
		expect(body[0]?.rating).toBeGreaterThan(0);

		const health = await handleRequest(new Request("http://localhost/health"));
		const healthBody = await health.json();
		expect(healthBody.checks.teamCount).toBe(2);
		expect(healthBody.checks.lastUpdated).toBeDefined();
	});

	it("POST refresh returns 429 when rate limit exceeded", async () => {
		process.env.REFRESH_RATE_LIMIT = "1";
		process.env.REFRESH_RATE_WINDOW = "60";
		globalThis.fetch = () =>
			Promise.resolve(new Response(JSON.stringify(sampleMassey), { status: 200 }));

		const ip = "198.51.100.10";
		const first = await handleRequest(
			new Request("http://localhost/api/ratings/refresh", {
				method: "POST",
				headers: { "x-forwarded-for": ip },
			}),
		);
		expect(first.status).toBe(202);

		const second = await handleRequest(
			new Request("http://localhost/api/ratings/refresh", {
				method: "POST",
				headers: { "x-forwarded-for": ip },
			}),
		);
		expect(second.status).toBe(429);
		expect(second.headers.get("Retry-After")).toBeTruthy();
		const body = await second.json();
		expect(body.error).toBe("RateLimitExceeded");
	});
});
