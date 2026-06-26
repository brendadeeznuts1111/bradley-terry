import { describe, expect, it, setSystemTime } from "bun:test";
import { seedDeterministicClock } from "./helpers.js";

describe("setSystemTime", () => {
	it("mocks the system clock deterministically", () => {
		const reset = seedDeterministicClock(new Date("1999-01-01T00:00:00.000Z"));

		expect(new Date().getFullYear()).toBe(1999);
		expect(new Date().getMonth()).toBe(0);
		expect(new Date().getDate()).toBe(1);

		reset();
		expect(new Date().getFullYear()).toBeGreaterThan(1999);
	});

	it("resets with bare setSystemTime()", () => {
		setSystemTime(new Date("2020-06-15T12:00:00Z"));
		expect(new Date().getFullYear()).toBe(2020);
		setSystemTime();
		expect(new Date().getFullYear()).toBeGreaterThan(2020);
	});
});
