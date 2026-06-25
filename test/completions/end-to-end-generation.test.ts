import { describe, expect, test } from "bun:test";
import {
	classifyFlag,
	type FlagCategory,
	makeTable,
} from "../../src/completions/completion-matrix";
import { makeMockCompletionData } from "./support/fixtures";

const FIXTURE_PATH = "completions/bun-cli.json";

describe("end-to-end generation", () => {
	test("mock completion data round-trips through JSON with Bun.deepEquals", () => {
		const original = makeMockCompletionData();
		const serialized = JSON.stringify(original);
		const parsed = JSON.parse(serialized);

		expect(Bun.deepEquals(parsed, original)).toBe(true);
	});

	test("flag categorization works on the real fixture", async () => {
		const raw = await Bun.file(FIXTURE_PATH).text();
		const data = JSON.parse(raw);

		const allFlagNames = new Set<string>();
		for (const cmd of Object.values(data.commands)) {
			for (const flag of (cmd as { flags: { name: string }[] }).flags) {
				allFlagNames.add(flag.name);
			}
		}
		for (const flag of data.globalFlags) {
			allFlagNames.add(flag.name);
		}

		expect(allFlagNames.size).toBeGreaterThan(0);

		const categorized = Array.from(allFlagNames).map((name) => ({
			name,
			categories: classifyFlag(name),
		}));

		// Verify well-known flags are categorized as expected.
		const expectations: { name: string; categories: FlagCategory[] }[] = [
			{ name: "outfile", categories: ["fileIO"] },
			{ name: "watch", categories: ["runtime"] },
			{ name: "timeout", categories: ["network"] },
			{ name: "verbose", categories: ["debug"] },
			{ name: "frozen-lockfile", categories: ["pm"] },
			{ name: "env-file", categories: ["fileIO", "runtime"] },
		];

		for (const { name, categories } of expectations) {
			const found = categorized.find((c) => c.name === name);
			expect(found).toBeDefined();
			expect(found?.categories).toEqual(categories);
		}

		// Sanity check that the table builder can render the categorization.
		const sampleRows = categorized.slice(0, 5).map((c) => ({
			Flag: c.name,
			Categories: c.categories.join(", ") || "—",
		}));
		expect(makeTable(sampleRows)).toContain("| Flag | Categories |");
	});
});
