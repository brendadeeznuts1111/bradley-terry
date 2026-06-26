import { afterEach, describe, expect, it } from "bun:test";
import {
	releaseRefreshLock,
	resetRefreshLock,
	tryAcquireRefreshLock,
} from "../src/server/refresh-lock.js";

describe("refresh-lock", () => {
	afterEach(() => resetRefreshLock());

	it("allows single acquire", () => {
		expect(tryAcquireRefreshLock()).toBe(true);
		expect(tryAcquireRefreshLock()).toBe(false);
		releaseRefreshLock();
		expect(tryAcquireRefreshLock()).toBe(true);
	});
});
