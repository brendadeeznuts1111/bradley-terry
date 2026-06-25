import { describe, expect, test } from "bun:test";
import { makeTable } from "../../src/completions/completion-matrix";

const MATRIX_PATH = "completions/COMPLETION_MATRIX.md";
const DYNAMIC_SOURCES_PATH = "completions/DYNAMIC_SOURCES.json";

interface HeaderParts {
	source: string;
	schema: string;
	bunVersion: string;
	revision: string;
	hash: string;
}

function parseMatrixHeader(content: string): HeaderParts {
	const line = content.split("\n")[2] ?? "";
	const match = line.match(
		/Generated from `([^`]+)` \(schema v([^,]+), Bun ([^,]+), revision ([^,]+), hash `([^`]+)`\)\./,
	);

	if (!match) {
		throw new Error(`Unable to parse matrix header: ${line}`);
	}

	return {
		source: match[1],
		schema: match[2],
		bunVersion: match[3],
		revision: match[4],
		hash: match[5],
	};
}

describe("Snapshot contracts", () => {
	test("makeTable produces stable markdown", () => {
		const rows = [
			{ Command: "install", Flags: 41, "Value flags": 15 },
			{ Command: "build", Flags: 57, "Value flags": 27 },
		];

		expect(makeTable(rows)).toMatchInlineSnapshot(`
"| Command | Flags | Value flags |
| --- | --- | --- |
| install | 41 | 15 |
| build | 57 | 27 |"
`);
	});

	test("DYNAMIC_SOURCES.json has stable schema with dynamic values", async () => {
		const raw = await Bun.file(DYNAMIC_SOURCES_PATH).text();
		const dynamicSources = JSON.parse(raw);

		expect(dynamicSources).toMatchSnapshot({
			schema: "1.1.0",
			bunVersion: expect.any(String),
			revision: expect.any(String),
			jsonHash: expect.any(String),
			sha256: expect.any(String),
			sha512: expect.any(String),
			blake2b256: expect.any(String),
			hmac: expect.any(String),
			generatedAt: expect.any(String),
			sources: {
				bare_bun: {
					completes: ["files", "scripts", "binaries"],
					provider: null,
					providerArgs: null,
				},
				run: {
					completes: ["scripts", "files", "binaries"],
					provider: "getcompletes",
					providerArgs: ["s", "b", "j"],
				},
				add: {
					completes: ["registry_packages"],
					provider: "getcompletes",
					providerArgs: ["a"],
				},
				remove: {
					completes: ["installed_packages"],
					provider: "getcompletes",
					providerArgs: ["a"],
				},
				create: {
					completes: ["templates"],
					provider: null,
					templateDir: "$BUN_INSTALL/create",
				},
				test: {
					completes: ["files"],
					provider: "getcompletes",
					providerArgs: ["j"],
				},
				build: {
					completes: ["files"],
					provider: "getcompletes",
					providerArgs: ["j"],
				},
			},
		});
	});

	test("COMPLETION_MATRIX.md header has stable format with dynamic values", async () => {
		const matrixContent = await Bun.file(MATRIX_PATH).text();
		const header = parseMatrixHeader(matrixContent);

		expect(header).toMatchSnapshot({
			source: "completions/bun-cli.json",
			schema: "1.1.0",
			bunVersion: expect.any(String),
			revision: expect.any(String),
			hash: expect.any(String),
		});
	});
});
