import { describe, expect, it } from "bun:test";
import { startRefreshScheduler } from "../src/server/scheduler.js";

describe("startRefreshScheduler", () => {
  it("does not schedule when interval is zero", () => {
    let calls = 0;
    const stop = startRefreshScheduler(0, async () => {
      calls++;
    });
    stop();
    expect(calls).toBe(0);
  });

  it("invokes callback on interval", async () => {
    let calls = 0;
    const stop = startRefreshScheduler(0.05, async () => {
      calls++;
    });

    await Bun.sleep(120);
    stop();

    expect(calls).toBeGreaterThanOrEqual(1);
  });
});
