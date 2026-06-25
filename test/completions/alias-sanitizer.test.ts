import { describe, expect, test } from "bun:test";
import { cleanAliases } from "../../src/completions/completion-matrix";

describe("alias sanitizer (wave 5)", () => {
	test("filters the 'bun' parser artifact", () => {
		expect(cleanAliases(["bun", "i", "install"])).toEqual(["i", "install"]);
	});

	test("filters the 'bunx' parser artifact", () => {
		expect(cleanAliases(["bunx", "x", "exec"])).toEqual(["x", "exec"]);
	});

	test("filters empty strings", () => {
		expect(cleanAliases(["i", "", "install"])).toEqual(["i", "install"]);
	});

	test("preserves valid aliases", () => {
		expect(cleanAliases(["i", "install", "add", "a"])).toEqual([
			"i",
			"install",
			"add",
			"a",
		]);
	});

	test("returns an empty array for undefined input", () => {
		expect(cleanAliases(undefined)).toEqual([]);
	});

	test("returns an empty array when all aliases are filtered out", () => {
		expect(cleanAliases(["bun", "bunx", ""])).toEqual([]);
	});
});
