import { describe, expect, test } from "bun:test";

const JSON_PATH = "completions/bun-cli.json";
const MATRIX_PATH = "completions/COMPLETION_MATRIX.md";
const DYNAMIC_SOURCES_PATH = "completions/DYNAMIC_SOURCES.json";

function computeJsonHash(raw: string): string {
	return new Bun.CryptoHasher("sha256").update(raw).digest("hex").slice(0, 12);
}

describe("drift detection contract", () => {
	test("embeds the JSON hash in the matrix output", async () => {
		const rawJson = await Bun.file(JSON_PATH).text();
		const jsonHash = computeJsonHash(rawJson);
		const matrixContent = await Bun.file(MATRIX_PATH).text();

		expect(matrixContent).toContain(jsonHash);
	});

	test("DYNAMIC_SOURCES.json serializes the matching JSON hash", async () => {
		const rawJson = await Bun.file(JSON_PATH).text();
		const jsonHash = computeJsonHash(rawJson);
		const dynamicSources = JSON.parse(
			await Bun.file(DYNAMIC_SOURCES_PATH).text(),
		);

		expect(dynamicSources.jsonHash).toBe(jsonHash);
	});
});
