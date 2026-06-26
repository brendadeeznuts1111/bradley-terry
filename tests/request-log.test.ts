import { afterEach, describe, expect, it, spyOn } from "bun:test";
import {
	clientIp,
	formatRequestLog,
	isRequestLogEnabled,
	logRequest,
} from "../src/server/request-log.js";

describe("request-log", () => {
	afterEach(() => {
		delete process.env.REQUEST_LOG;
	});

	it("is enabled by default", () => {
		expect(isRequestLogEnabled()).toBe(true);
	});

	it("can be disabled with REQUEST_LOG=0", () => {
		process.env.REQUEST_LOG = "0";
		expect(isRequestLogEnabled()).toBe(false);
	});

	it("formats structured JSON log lines", () => {
		const line = formatRequestLog({
			ts: "2026-06-26T00:00:00.000Z",
			method: "GET",
			path: "/health",
			status: 200,
			durationMs: 1.23,
			clientIp: "127.0.0.1",
		});
		expect(JSON.parse(line)).toEqual({
			ts: "2026-06-26T00:00:00.000Z",
			method: "GET",
			path: "/health",
			status: 200,
			durationMs: 1.23,
			clientIp: "127.0.0.1",
		});
	});

	it("logs when enabled", () => {
		const spy = spyOn(console, "log").mockImplementation(() => {});
		logRequest({
			ts: "2026-06-26T00:00:00.000Z",
			method: "POST",
			path: "/api/ratings/refresh",
			status: 202,
			durationMs: 42,
			clientIp: "10.0.0.1",
		});
		expect(spy).toHaveBeenCalledTimes(1);
		spy.mockRestore();
	});

	it("extracts client IP from x-forwarded-for", () => {
		const req = new Request("http://localhost/health", {
			headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
		});
		expect(clientIp(req)).toBe("203.0.113.1");
	});
});
