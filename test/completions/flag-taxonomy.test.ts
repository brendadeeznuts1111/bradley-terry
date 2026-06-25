import { describe, expect, test } from "bun:test";
import { classifyFlag } from "../../src/completions/completion-matrix";

describe("flag taxonomy", () => {
	test("classifies a fileIO flag as fileIO", () => {
		expect(classifyFlag("outfile")).toEqual(["fileIO"]);
	});

	test("classifies a PM flag as pm", () => {
		expect(classifyFlag("frozen-lockfile")).toEqual(["pm"]);
	});

	test("classifies a runtime flag as runtime", () => {
		expect(classifyFlag("watch")).toEqual(["runtime"]);
	});

	test("classifies a debug flag as debug", () => {
		expect(classifyFlag("verbose")).toEqual(["debug"]);
	});

	test("classifies a network flag as network", () => {
		expect(classifyFlag("timeout")).toEqual(["network"]);
	});

	test("classifies a multi-category flag into all applicable categories", () => {
		expect(classifyFlag("env-file")).toEqual(["fileIO", "runtime"]);
	});

	test("classifies an unknown flag as uncategorized", () => {
		expect(classifyFlag("totally-unknown-flag")).toEqual(["uncategorized"]);
	});
});
