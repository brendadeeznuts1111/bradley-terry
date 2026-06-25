import { describe, expect, test } from "bun:test";
import { makeTable } from "../../src/completions/completion-matrix";

describe("table builder", () => {
	test("generates a markdown table with headers and separator", () => {
		const rows = [{ Command: "install", Flags: 41 }];
		const table = makeTable(rows);
		const lines = table.split("\n");

		expect(lines[0]).toBe("| Command | Flags |");
		expect(lines[1]).toBe("| --- | --- |");
		expect(lines[2]).toBe("| install | 41 |");
	});

	test("returns an empty string for empty rows", () => {
		expect(makeTable([])).toBe("");
	});

	test("coerces numbers to strings in cells", () => {
		const rows = [{ Metric: "Count", Value: 42 }];
		expect(makeTable(rows)).toContain("| 42 |");
	});

	test("handles multiple rows", () => {
		const rows = [
			{ Command: "add", Flags: 40 },
			{ Command: "build", Flags: 57 },
		];
		const table = makeTable(rows);
		expect(table).toContain("| add | 40 |");
		expect(table).toContain("| build | 57 |");
	});
});
