import { afterEach, describe, expect, it } from "bun:test";
import { checkRateLimit, parseRateLimitConfig, resetRateLimits } from "../src/server/rate-limit.js";

describe("rate-limit", () => {
	afterEach(() => {
		resetRateLimits();
		delete process.env["REFRESH_RATE_LIMIT"];
		delete process.env["REFRESH_RATE_WINDOW"];
	});

	it("parseRateLimitConfig returns defaults (5 per 60s)", () => {
		expect(parseRateLimitConfig()).toEqual({ limit: 5, windowMs: 60_000 });
	});

	it("parseRateLimitConfig returns null when limit is 0 (disabled)", () => {
		process.env["REFRESH_RATE_LIMIT"] = "0";
		expect(parseRateLimitConfig()).toBeNull();
	});

	it("allows requests up to the limit within the window", () => {
		const config = { limit: 2, windowMs: 10_000 };
		const now = 1_000_000;

		expect(checkRateLimit("client-a", config, now).allowed).toBe(true);
		expect(checkRateLimit("client-a", config, now + 1).allowed).toBe(true);
		expect(checkRateLimit("client-a", config, now + 2).allowed).toBe(false);
	});

	it("tracks clients independently", () => {
		const config = { limit: 1, windowMs: 10_000 };
		const now = 2_000_000;

		expect(checkRateLimit("client-a", config, now).allowed).toBe(true);
		expect(checkRateLimit("client-b", config, now).allowed).toBe(true);
		expect(checkRateLimit("client-a", config, now + 1).allowed).toBe(false);
	});

	it("expires timestamps outside the sliding window", () => {
		const config = { limit: 1, windowMs: 1_000 };
		const now = 3_000_000;

		expect(checkRateLimit("client-a", config, now).allowed).toBe(true);
		expect(checkRateLimit("client-a", config, now + 500).allowed).toBe(false);
		expect(checkRateLimit("client-a", config, now + 1_001).allowed).toBe(true);
	});
});
