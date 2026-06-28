import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { handleRequest } from "../src/server/handlers.js";
import { resetMetrics } from "../src/server/metrics.js";
import { resetRateLimits } from "../src/server/rate-limit.js";
import { resetRefreshLock } from "../src/server/refresh-lock.js";
import { disposeAppRuntime } from "../src/server/runtime.js";
import { resetInFlightTracking } from "../src/server/shutdown.js";

const sampleMassey = {
	teams: [
		{ teamId: "A", teamName: "Alpha" },
		{ teamId: "B", teamName: "Beta" },
	],
	results: [{ homeTeamId: "A", awayTeamId: "B", homeScore: 1, awayScore: 0 }],
	sport: "prod",
	season: "2026",
};

describe("production depth", () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(async () => {
		originalFetch = globalThis.fetch;
		process.env["DB_PATH"] = `/tmp/bt-prod-${Date.now()}.db`;
		process.env["SECRETS_BACKEND"] = "env";
		await disposeAppRuntime();
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
		resetRateLimits();
		resetRefreshLock();
		resetMetrics();
		resetInFlightTracking();
		delete process.env["REFRESH_TOKEN"];
		delete process.env["REFRESH_RATE_LIMIT"];
		await disposeAppRuntime();
	});

	it("GET /metrics returns Prometheus text", async () => {
		await handleRequest(new Request("http://localhost/health"));
		const res = await handleRequest(new Request("http://localhost/metrics"));
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toContain("bradley_terry_http_requests_total");
	});

	it("POST refresh requires REFRESH_TOKEN when configured", async () => {
		process.env["REFRESH_TOKEN"] = "secret-token";
		globalThis.fetch = (() =>
			Promise.resolve(new Response(JSON.stringify(sampleMassey), { status: 200 }))) as unknown as typeof fetch;

		const denied = await handleRequest(
			new Request("http://localhost/api/ratings/refresh", { method: "POST" }),
		);
		expect(denied.status).toBe(401);

		const allowed = await handleRequest(
			new Request("http://localhost/api/ratings/refresh", {
				method: "POST",
				headers: { Authorization: "Bearer secret-token" },
			}),
		);
		expect(allowed.status).toBe(202);
	});

	it("POST refresh returns 409 when refresh already in flight", async () => {
		process.env["REFRESH_RATE_LIMIT"] = "0";
		let resolveFetch: (value: Response) => void = () => {};
		const fetchPromise = new Promise<Response>((resolve) => {
			resolveFetch = resolve;
		});
		globalThis.fetch = (() => fetchPromise) as unknown as typeof fetch;

		const first = handleRequest(
			new Request("http://localhost/api/ratings/refresh", { method: "POST" }),
		);
		await Bun.sleep(20);
		const second = await handleRequest(
			new Request("http://localhost/api/ratings/refresh", { method: "POST" }),
		);
		expect(second.status).toBe(409);
		const body = await second.json();
		expect(body.error).toBe("RefreshInProgress");

		resolveFetch(new Response(JSON.stringify(sampleMassey), { status: 200 }));
		const firstRes = await first;
		expect(firstRes.status).toBe(202);
	});
});
