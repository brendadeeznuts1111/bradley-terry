import { describe, expect, test } from "bun:test";
import { inheritsGlobals } from "../../src/completions/completion-matrix";

describe("global flag inheritance", () => {
	test("the pm command does not inherit global flags", () => {
		expect(inheritsGlobals("pm")).toBe(false);
	});

	test("the install command inherits global flags", () => {
		expect(inheritsGlobals("install")).toBe(true);
	});

	test("the build command inherits global flags", () => {
		expect(inheritsGlobals("build")).toBe(true);
	});

	test("an unknown command inherits global flags by default", () => {
		expect(inheritsGlobals("future-command")).toBe(true);
	});
});
