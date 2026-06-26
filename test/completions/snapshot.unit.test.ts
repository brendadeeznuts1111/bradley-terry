#!/usr/bin/env bun
// test/completions/snapshot.unit.test.ts
// Snapshot contracts for generated artifacts
// Uses bun:test snapshot matching with property matchers for dynamic values

import { describe, expect, test } from "bun:test";
import {
	classifyFlag,
	cleanAliases,
	inheritsGlobals,
	makeCSV,
	makeTable,
} from "../../src/completions/completion-matrix";

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
	// ── 1. makeTable inline snapshot ────────────────────────────────
	describe("makeTable markdown generation", () => {
		test("produces stable 2-column markdown", () => {
			const rows = [
				{ Command: "install", Flags: 41 },
				{ Command: "build", Flags: 57 },
			];

			expect(makeTable(rows)).toMatchInlineSnapshot(`
"| Command | Flags |
|---------|-------|
| install | 41    |
| build   | 57    |"
`);
		});

		test("produces stable 5-column markdown with categories", () => {
			const rows = [
				{
					Command: "install (i)",
					Flags: 41,
					"Value flags": 15,
					"File I/O": 2,
					PM: 18,
				},
				{
					Command: "build",
					Flags: 57,
					"Value flags": 27,
					"File I/O": 8,
					PM: 0,
				},
			];

			expect(makeTable(rows)).toMatchInlineSnapshot(`
"| Command     | Flags | Value flags | File I/O | PM |
|-------------|-------|-------------|----------|----|
| install (i) | 41    | 15          | 2        | 18 |
| build       | 57    | 27          | 8        | 0  |"
`);
		});

		test("handles empty rows gracefully", () => {
			expect(makeTable([])).toBe("");
		});

		test("renders pipe characters literally in cell content", () => {
			const rows = [{ Description: "a | b", Value: 1 }];

			expect(makeTable(rows)).toMatchInlineSnapshot(`
"| Description | Value |
|-------------|-------|
| a | b       | 1     |"
`);
		});
	});

	// ── 2. Pure helper inline snapshots ─────────────────────────────
	describe("completion-matrix helpers", () => {
		test("classifyFlag categorizes known flags", () => {
			expect(classifyFlag("outfile")).toMatchInlineSnapshot(`
[
  "fileIO",
]
`);
			expect(classifyFlag("save")).toMatchInlineSnapshot(`
[
  "pm",
]
`);
			expect(classifyFlag("watch")).toMatchInlineSnapshot(`
[
  "runtime",
]
`);
			expect(classifyFlag("env-file")).toMatchInlineSnapshot(`
[
  "fileIO",
  "runtime",
]
`);
			expect(classifyFlag("unknown-flag")).toMatchInlineSnapshot(`
[
  "uncategorized",
]
`);
		});

		test("cleanAliases removes bun/bunx and empty aliases", () => {
			expect(cleanAliases(["bun", "i", "bunx", ""])).toMatchInlineSnapshot(`
[
  "i",
]
`);
			expect(cleanAliases(undefined)).toMatchInlineSnapshot(`[]`);
		});

		test("inheritsGlobals is false only for pm top command", () => {
			expect(inheritsGlobals("install")).toBe(true);
			expect(inheritsGlobals("pm")).toBe(false);
		});
	});

	// ── 3. DYNAMIC_SOURCES.json snapshot ──────────────────────────
	describe("DYNAMIC_SOURCES.json schema contract", () => {
		test("full schema with dynamic value matchers", async () => {
			const raw = await Bun.file(DYNAMIC_SOURCES_PATH).text();
			const dynamicSources = JSON.parse(raw);

			expect(dynamicSources).toMatchSnapshot({
				// Dynamic: any string is acceptable
				jsonHash: expect.any(String),
				sha256: expect.any(String),
				sha512: expect.any(String),
				blake2b256: expect.any(String),
				hmac: expect.any(String),
				generatedAt: expect.any(String),

				// Locked: must match exactly
				schema: "1.1.0",
				bunVersion: "1.4.0",
				revision: "1.4.0-canary.1+452139e36",
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

		test("schema version must not drift without explicit update", async () => {
			const raw = await Bun.file(DYNAMIC_SOURCES_PATH).text();
			const dynamicSources = JSON.parse(raw);

			// This will fail if schema changes, forcing explicit snapshot update
			expect(dynamicSources.schema).toMatchInlineSnapshot(`"1.1.0"`);
		});
	});

	// ── 4. COMPLETION_MATRIX.md header snapshot ───────────────────
	describe("COMPLETION_MATRIX.md header format", () => {
		test("header object with dynamic value matchers", async () => {
			const matrixContent = await Bun.file(MATRIX_PATH).text();
			const header = parseMatrixHeader(matrixContent);

			expect(header).toMatchSnapshot({
				source: "completions/bun-cli.json",
				schema: "1.1.0",
				bunVersion: "1.4.0",
				revision: "1.4.0-canary.1+452139e36",
				hash: expect.any(String),
			});
		});

		test("header format regex is stable", async () => {
			const matrixContent = await Bun.file(MATRIX_PATH).text();
			const line = matrixContent.split("\n")[2] ?? "";
			const headerPattern =
				/^Generated from `completions\/bun-cli\.json` \(schema v([\d.]+), Bun ([\d.]+), revision ([^,]+), hash `([a-f0-9]{12})`\)\./;

			expect(line).toMatch(headerPattern);

			const match = line.match(headerPattern);
			expect(match).not.toBeNull();
			if (!match) {
				throw new Error("Expected header pattern to match");
			}
			expect(match[1]).toBe("1.1.0"); // schema
			expect(match[2]).toBe("1.4.0"); // bunVersion
			expect(match[3]).toBe("1.4.0-canary.1+452139e36"); // revision
			expect(match[4]).toBe("909ceece8ae5"); // hash (12 chars)
		});

		test("header rejects malformed formats", () => {
			const badHeaders = [
				"Generated from completions/bun-cli.json (schema v1.1.0, Bun 1.4.0)", // missing backticks, revision, hash
				"Generated from `completions/bun-cli.json` (schema v1.1.0, Bun 1.4.0, revision 452139e36)", // missing hash
				"Generated from `completions/bun-cli.json` (schema v1.1.0, Bun 1.4.0, hash `909ceece8ae5`).", // missing revision
			];

			const headerPattern =
				/^Generated from `completions\/bun-cli\.json` \(schema v([\d.]+), Bun ([\d.]+), revision ([^,]+), hash `([a-f0-9]{12})`\)\./;

			badHeaders.forEach((h) => {
				expect(h).not.toMatch(headerPattern);
			});
		});

		test("matrix is valid Markdown with at least one GFM table", async () => {
			const matrixContent = await Bun.file(MATRIX_PATH).text();

			// Bun.markdown is an unstable native API; this test guards the
			// matrix structure without affecting the committed markdown output.
			const html = Bun.markdown.html(matrixContent, { tables: true });
			expect(html).toContain("<table");
			expect(html).toContain("<h1");
		});
	});

	// ── 5. Cross-cutting integration snapshot ─────────────────────
	describe("End-to-end artifact consistency", () => {
		test("all generated artifacts share the same hash", async () => {
			const matrixContent = await Bun.file(MATRIX_PATH).text();
			const raw = await Bun.file(DYNAMIC_SOURCES_PATH).text();
			const dynamicSources = JSON.parse(raw);
			const header = parseMatrixHeader(matrixContent);

			// All artifacts reference the same hash
			expect(header.hash).toBe(dynamicSources.jsonHash);

			// Every matrix row embeds the same drift hash
			const rowHashes = [
				...matrixContent.matchAll(/^\|.*\|\s*([a-f0-9]{12})\s*\|$/gm),
			].map((m) => m[1]);
			const uniqueRowHashes = new Set(rowHashes);
			expect(rowHashes.length).toBeGreaterThan(0);
			expect(uniqueRowHashes.size).toBe(1);
			expect([...uniqueRowHashes][0]).toBe(dynamicSources.jsonHash);
		});

		test("schema version is consistent across all artifacts", async () => {
			const matrixContent = await Bun.file(MATRIX_PATH).text();
			const raw = await Bun.file(DYNAMIC_SOURCES_PATH).text();
			const dynamicSources = JSON.parse(raw);
			const header = parseMatrixHeader(matrixContent);

			expect(header.schema).toBe(dynamicSources.schema);
			expect(header.schema).toBe("1.1.0");
		});

		test("running Bun version is at least the artifact bunVersion", async () => {
			const raw = await Bun.file(DYNAMIC_SOURCES_PATH).text();
			const dynamicSources = JSON.parse(raw);

			// semver.order throws on invalid versions, validating the format
			expect(
				Bun.semver.order(Bun.version, dynamicSources.bunVersion),
			).toBeGreaterThanOrEqual(0);
		});
	});

	// ── 1b. makeCSV inline snapshot ─────────────────────────────────
	describe("makeCSV generation", () => {
		test("produces stable 2-column CSV", () => {
			const rows = [
				{ Command: "install", Flags: 41 },
				{ Command: "build", Flags: 57 },
			];

			expect(makeCSV(rows)).toMatchInlineSnapshot(`
"Command,Flags
install,41
build,57"
`);
		});

		test("quotes cells with commas and escapes embedded quotes", () => {
			const rows = [
				{ Description: "fast, reliable", Value: 1 },
				{ Description: 'say "hello"', Value: 2 },
			];

			expect(makeCSV(rows)).toMatchInlineSnapshot(`
"Description,Value
"fast, reliable",1
"say ""hello""",2"
`);
		});

		test("handles empty rows gracefully", () => {
			expect(makeCSV([])).toBe("");
		});

		test("coerces numbers to strings", () => {
			const rows = [{ Metric: "Count", Value: 42 }];
			expect(makeCSV(rows)).toContain("42");
		});
	});
});
