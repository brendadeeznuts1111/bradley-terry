import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { handleGetRatings, handleRequest } from "../src/server/handlers.js";
import { disposeAppRuntime } from "../src/server/runtime.js";

describe("HTTP handleRequest", () => {
  beforeEach(async () => {
    process.env.DB_PATH = `/tmp/bt-handlers-${Date.now()}.db`;
    process.env.SECRETS_BACKEND = "env";
    await disposeAppRuntime();
  });

  afterEach(async () => {
    await disposeAppRuntime();
  });

  it("returns 404 for unknown routes", async () => {
    const res = await handleRequest(new Request("http://localhost/unknown"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("NotFound");
  });

  it("GET /api/ratings/bt returns empty array when no data", async () => {
    const res = await handleGetRatings("empty", "2026");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("routes GET /health through handleRequest", async () => {
    const res = await handleRequest(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
