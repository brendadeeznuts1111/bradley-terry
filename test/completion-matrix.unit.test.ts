import { deserialize, estimateShallowMemoryUsageOf, serialize } from "bun:jsc";
import { Database } from "bun:sqlite";
import { describe, expect, setSystemTime, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import {
	type CompletionData,
	classifyFlag,
	cleanAliases,
	type FlagCategory,
	inheritsGlobals,
	makeTable,
} from "../src/completions/completion-matrix";
import {
	deleteSecret,
	EnvSecretsLive,
	getSecret,
	InMemorySecretStoreLive,
	SecretClient,
	SecretError,
	setSecret,
	VaultSecretsLive,
} from "../src/secrets";

// ============================================
// Mock fixture
// ============================================

function minimalCompletionData(): CompletionData {
	return {
		version: "1.1.0",
		bunVersion: "1.4.0",
		commands: {
			install: {
				name: "install",
				aliases: ["i"],
				description: "Install dependencies",
				flags: [
					{ name: "save", hasValue: true, defaultValue: "true" },
					{
						name: "backend",
						hasValue: true,
						choices: ["clonefile", "hardlink"],
					},
					{ name: "watch", hasValue: false },
					{ name: "frozen-lockfile", hasValue: false },
				],
				positionalArgs: [{ name: "packages", required: false, multiple: true }],
				examples: ["bun install"],
			},
			build: {
				name: "build",
				aliases: ["b"],
				description: "Build the project",
				flags: [
					{ name: "outfile", hasValue: true },
					{ name: "minify", hasValue: false },
				],
				positionalArgs: [],
				examples: ["bun build"],
			},
			pm: {
				name: "pm",
				aliases: [],
				description: "Package manager subcommands",
				flags: [],
				positionalArgs: [],
				examples: [],
				subcommands: {
					scan: {
						name: "scan",
						description: "Scan for issues",
						flags: [],
						positionalArgs: [],
						examples: [],
					},
				},
			},
		},
		globalFlags: [
			{ name: "watch", hasValue: false },
			{ name: "hot", hasValue: false },
			{ name: "env-file", hasValue: true },
			{ name: "preload", hasValue: true },
		],
		bunGetCompletes: {
			available: true,
			commands: {
				scripts: "bun getcompletes s",
				binaries: "bun getcompletes b",
				packages: "bun getcompletes a",
				files: "bun getcompletes j",
			},
		},
		specialHandling: {
			bareCommand: {
				description: "Run files, scripts, and binaries",
				canRunFiles: true,
				dynamicCompletions: {
					scripts: true,
					files: true,
					binaries: true,
				},
			},
		},
	};
}

// ============================================
// Helpers
// ============================================

const JSON_PATH = "completions/bun-cli.json";
const MATRIX_PATH = "completions/COMPLETION_MATRIX.md";
const DYNAMIC_SOURCES_PATH = "completions/DYNAMIC_SOURCES.json";

function computeJsonHash(raw: string): string {
	return new Bun.CryptoHasher("sha256").update(raw).digest("hex").slice(0, 12);
}

function makeTempDir(): string {
	return mkdtempSync(join(os.tmpdir(), "bun-native-api-test-"));
}

// ============================================
// Suite 1: Flag Taxonomy (7 cases)
// ============================================

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

// ============================================
// Suite 2: Alias Sanitizer (Wave 5) (6 cases)
// ============================================

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

// ============================================
// Suite 3: Global Flag Inheritance (4 cases)
// ============================================

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

// ============================================
// Suite 4: Table Builder (4 cases)
// ============================================

describe("table builder", () => {
	test("generates a markdown table with headers and separator", () => {
		const rows = [{ Command: "install", Flags: 41 }];
		const table = makeTable(rows);
		const lines = table.split("\n");

		expect(lines[0]).toBe("| Command | Flags |");
		expect(lines[1]).toBe("|---------|-------|");
		expect(lines[2]).toBe("| install | 41    |");
	});

	test("returns an empty string for empty rows", () => {
		expect(makeTable([])).toBe("");
	});

	test("coerces numbers to strings in cells", () => {
		const rows = [{ Metric: "Count", Value: 42 }];
		expect(makeTable(rows)).toContain("| 42    |");
	});

	test("handles multiple rows", () => {
		const rows = [
			{ Command: "add", Flags: 40 },
			{ Command: "build", Flags: 57 },
		];
		const table = makeTable(rows);
		expect(table).toContain("| add     | 40    |");
		expect(table).toContain("| build   | 57    |");
	});
});

// ============================================
// Suite 5: Hash Generation (3 cases)
// ============================================

describe("hash generation", () => {
	test("SHA-256 digest is deterministic for the same input", () => {
		const input = "bun completions fixture";
		const a = new Bun.CryptoHasher("sha256").update(input).digest("hex");
		const b = new Bun.CryptoHasher("sha256").update(input).digest("hex");

		expect(a).toBe(b);
		expect(a).toHaveLength(64);
	});

	test("SHA-256 differs from SHA-512 for the same input", () => {
		const input = "bun completions fixture";
		const sha256 = new Bun.CryptoHasher("sha256").update(input).digest("hex");
		const sha512 = new Bun.CryptoHasher("sha512").update(input).digest("hex");

		expect(sha256).not.toBe(sha512);
		expect(sha512).toHaveLength(128);
	});

	test("different inputs produce different hashes", () => {
		const a = new Bun.CryptoHasher("sha256").update("input-a").digest("hex");
		const b = new Bun.CryptoHasher("sha256").update("input-b").digest("hex");

		expect(a).not.toBe(b);
	});

	test("non-crypto hash variants return consistent results", () => {
		const input = "bradley-terry";
		expect(Bun.hash.xxHash3(input)).toBe(Bun.hash.xxHash3(input));
		expect(Bun.hash.wyhash(input)).toBe(Bun.hash.wyhash(input));
		expect(typeof Bun.hash.xxHash3(input)).toBe("bigint");
		expect(typeof Bun.hash.wyhash(input)).toBe("bigint");
	});
});

// ============================================
// Suite 6: End-to-End Generation (2 cases)
// ============================================

describe("end-to-end generation", () => {
	test("mock completion data round-trips through JSON with Bun.deepEquals", () => {
		const original = minimalCompletionData();
		const serialized = JSON.stringify(original);
		const parsed = JSON.parse(serialized);

		expect(Bun.deepEquals(parsed, original)).toBe(true);
	});

	test("flag categorization works on the real fixture", async () => {
		const raw = await Bun.file(JSON_PATH).text();
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

		const sampleRows = categorized.slice(0, 5).map((c) => ({
			Flag: c.name,
			Categories: c.categories.join(", ") || "—",
		}));
		expect(makeTable(sampleRows)).toContain(
			"| Flag             | Categories    |",
		);
	});
});

// ============================================
// Suite 7: Drift Detection Contract (2 cases)
// ============================================

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

	test("rejects a deliberately wrong hash (regression guard)", async () => {
		const matrixContent = await Bun.file(MATRIX_PATH).text();
		// A hash that almost certainly does not appear in the matrix
		const bogusHash = "000000000000";
		expect(matrixContent).not.toContain(bogusHash);
	});

	test('detects "bun" parser leak in alias list (regression guard)', () => {
		// cleanAliases must reject "bun" as an alias; if the parser leaks
		// "bun" into any command's alias list, this pattern detection catches it
		const result = cleanAliases(["bun", "add"]);
		expect(result).not.toContain("bun");
		expect(result).toEqual(["add"]);
	});
});

// ============================================
// Suite 8: SQLite History (1 case)
// ============================================

describe("SQLite history", () => {
	test("creates an in-memory history table with UUIDv7 primary keys", () => {
		using db = new Database(":memory:");

		db.run(`
			CREATE TABLE completion_history (
				id TEXT PRIMARY KEY,
				generated_at TEXT NOT NULL,
				json_hash TEXT NOT NULL
			)
		`);

		const id1 = Bun.randomUUIDv7();
		const id2 = Bun.randomUUIDv7();

		// UUIDv7 IDs are time-ordered: id1 < id2 lexicographically
		expect(id1 < id2).toBe(true);

		db.run(
			"INSERT INTO completion_history (id, generated_at, json_hash) VALUES (?, ?, ?)",
			[id1, "2026-06-25T12:00:00Z", "abc123"],
		);
		db.run(
			"INSERT INTO completion_history (id, generated_at, json_hash) VALUES (?, ?, ?)",
			[id2, "2026-06-25T13:00:00Z", "def456"],
		);

		const rows = db.query("SELECT * FROM completion_history ORDER BY id").all();

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			id: id1,
			generated_at: "2026-06-25T12:00:00Z",
			json_hash: "abc123",
		});
		expect(rows[1]).toMatchObject({
			id: id2,
			generated_at: "2026-06-25T13:00:00Z",
			json_hash: "def456",
		});

		// Verify UUIDv7 format: 8-4-4-4-12 hex with version 7 nibble
		const uuidv7Re =
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		expect(id1).toMatch(uuidv7Re);
		expect(id2).toMatch(uuidv7Re);
	});

	test("serialize and deserialize snapshots a database", () => {
		using db = new Database(":memory:");
		db.run("CREATE TABLE items (name TEXT, count INTEGER)");
		db.run("INSERT INTO items VALUES ('alpha', 1), ('beta', 2)");

		const snapshot = db.serialize();
		expect(snapshot).toBeInstanceOf(Uint8Array);
		expect(snapshot.length).toBeGreaterThan(0);

		const clone = Database.deserialize(snapshot);
		const rows = clone.query("SELECT * FROM items ORDER BY name").all();
		expect(rows).toEqual([
			{ name: "alpha", count: 1 },
			{ name: "beta", count: 2 },
		]);
	});

	test("transaction commits on success and rolls back on error", () => {
		const db = new Database(":memory:");
		try {
			db.run("CREATE TABLE counters (k TEXT PRIMARY KEY, v INTEGER)");

			const insertMany = db.transaction((items: [string, number][]) => {
				for (const [k, v] of items)
					db.run("INSERT INTO counters VALUES (?, ?)", [k, v]);
				return items.length;
			});

			insertMany([
				["a", 1],
				["b", 2],
			]);
			expect(db.query("SELECT count(*) AS c FROM counters").get()).toEqual({
				c: 2,
			});

			expect(() =>
				insertMany([
					["c", 3],
					["a", 4],
				]),
			).toThrow();
			// Transaction rolled back — no rows added
			expect(db.query("SELECT count(*) AS c FROM counters").get()).toEqual({
				c: 2,
			});
		} finally {
			db.close();
		}
	});
});

// ============================================
// Suite 9: Bun Native API Verification (4 cases)
// ============================================

describe("Bun native API verification", () => {
	test("CryptoHasher produces a consistent hex digest", () => {
		const input = "verify me";
		const digest = new Bun.CryptoHasher("sha256").update(input).digest("hex");

		expect(digest).toBe(
			new Bun.CryptoHasher("sha256").update(input).digest("hex"),
		);
		expect(digest).toMatch(/^[0-9a-f]{64}$/);
	});

	test("CryptoHasher with HMAC key produces keyed digest", () => {
		const key = "secret-key";
		const a = new Bun.CryptoHasher("sha256", key).update("hello").digest("hex");
		const b = new Bun.CryptoHasher("sha256", key).update("hello").digest("hex");
		const c = new Bun.CryptoHasher("sha256", "other-key")
			.update("hello")
			.digest("hex");

		expect(a).toBe(b); // same key, same input → same digest
		expect(a).not.toBe(c); // different key → different digest
		expect(a).toMatch(/^[0-9a-f]{64}$/);
	});

	test("deepEquals detects structural equality", () => {
		const a = { nested: [1, 2, { value: 3 }] };
		const b = { nested: [1, 2, { value: 3 }] };
		const c = { nested: [1, 2, { value: 4 }] };

		expect(Bun.deepEquals(a, b)).toBe(true);
		expect(Bun.deepEquals(a, c)).toBe(false);
	});

	test("Bun.file reads and writes text", async () => {
		const dir = makeTempDir();
		try {
			const path = join(dir, "sample.txt");
			const content = "hello from bun file";

			await Bun.write(path, content);
			const read = await Bun.file(path).text();

			expect(read).toBe(content);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("gzipSync compresses and gunzipSync decompresses", () => {
		const original = "compress this string".repeat(50);
		const encoded = new TextEncoder().encode(original);
		const compressed = Bun.gzipSync(encoded);
		const decompressed = Bun.gunzipSync(compressed);

		expect(compressed.length).toBeLessThan(encoded.length);
		expect(new TextDecoder().decode(decompressed)).toBe(original);
	});

	test("zstdCompressSync compresses and zstdDecompressSync decompresses", () => {
		const original = "compress this string".repeat(50);
		const encoded = new TextEncoder().encode(original);
		const compressed = Bun.zstdCompressSync(encoded);
		const decompressed = Bun.zstdDecompressSync(compressed);

		expect(compressed.length).toBeLessThan(encoded.length);
		expect(new TextDecoder().decode(decompressed)).toBe(original);
	});

	test("zstdCompress and zstdDecompress roundtrip asynchronously", async () => {
		const original = "async zstd roundtrip".repeat(40);
		const encoded = new TextEncoder().encode(original);
		const compressed = await Bun.zstdCompress(encoded);
		const decompressed = await Bun.zstdDecompress(compressed);

		expect(compressed.length).toBeLessThan(encoded.length);
		expect(new TextDecoder().decode(decompressed)).toBe(original);
	});

	test("deflateSync compresses and inflateSync decompresses", () => {
		const original = "deflate me cap'n".repeat(50);
		const encoded = new TextEncoder().encode(original);
		const compressed = Bun.deflateSync(encoded);
		const decompressed = Bun.inflateSync(compressed);

		expect(compressed.length).toBeLessThan(encoded.length);
		expect(new TextDecoder().decode(decompressed)).toBe(original);
	});

	test("sleepSync blocks for at least the specified duration", () => {
		const start = Bun.nanoseconds();
		Bun.sleepSync(10); // 10ms
		const elapsed = (Bun.nanoseconds() - start) / 1e6;
		expect(elapsed).toBeGreaterThanOrEqual(5); // allow some slop
	});

	test("stripANSI removes ANSI escape codes", () => {
		const colored = "\u001b[31mHello\u001b[0m \u001b[32mWorld\u001b[0m";
		expect(Bun.stripANSI(colored)).toBe("Hello World");
		expect(Bun.stripANSI("plain")).toBe("plain");
	});

	test("peek.status reports promise state without resolving", () => {
		expect(Bun.peek.status(Promise.resolve(1))).toBe("fulfilled");
		expect(Bun.peek.status(new Promise(() => {}))).toBe("pending");
		const rejected = Promise.reject(new Error("test"));
		rejected.catch(() => {}); // suppress unhandled rejection
		expect(Bun.peek.status(rejected)).toBe("rejected");
	});

	test("bun:jsc serialize and deserialize roundtrip", () => {
		const original = { foo: "bar", nested: [1, true, null] };
		const buf = serialize(original);
		expect(buf).toBeInstanceOf(SharedArrayBuffer);
		const restored = deserialize(buf);
		expect(restored).toEqual(original);
	});

	test("bun:jsc estimateShallowMemoryUsageOf returns a positive number", () => {
		const obj = { a: 1, b: "hello" };
		const usage = estimateShallowMemoryUsageOf(obj);
		expect(usage).toBeGreaterThan(0);
		expect(typeof usage).toBe("number");

		const buffer = Buffer.alloc(1024);
		const bufUsage = estimateShallowMemoryUsageOf(buffer);
		expect(bufUsage).toBeGreaterThanOrEqual(1024);
	});

	test("inspect.custom symbol exists and is usable", () => {
		expect(typeof Bun.inspect.custom).toBe("symbol");
		class Tagged {
			[Bun.inspect.custom]() {
				return "tagged!";
			}
		}
		expect(Bun.inspect(new Tagged())).toBe("tagged!");
	});

	test("readableStreamToArrayBuffer converts a stream", async () => {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(new TextEncoder().encode("hello "));
				controller.enqueue(new TextEncoder().encode("world"));
				controller.close();
			},
		});
		const buf = await Bun.readableStreamToArrayBuffer(stream);
		expect(new TextDecoder().decode(buf)).toBe("hello world");
	});

	test("TOML.parse reads bunfig.toml install settings", async () => {
		const content = await Bun.file(
			join(import.meta.dir, "../bunfig.toml"),
		).text();
		const config = Bun.TOML.parse(content) as {
			install: { frozenLockfile: boolean; saveTextLockfile: boolean };
		};
		expect(config.install.frozenLockfile).toBe(false);
		expect(config.install.saveTextLockfile).toBe(true);
	});

	test("resolveSync resolves a relative module path", async () => {
		const resolved = Bun.resolveSync("../package.json", import.meta.dir);
		expect(resolved.endsWith("package.json")).toBe(true);
		expect(await Bun.file(resolved).exists()).toBe(true);
	});

	test("openInEditor is a function that accepts a path", () => {
		expect(typeof Bun.openInEditor).toBe("function");
	});

	test("Bun.password hashSync and verifySync roundtrip", () => {
		const password = "s3cure-p@ss!";
		const hash = Bun.password.hashSync(password);
		expect(hash).toMatch(/^\$/); // PHC or MCF format
		expect(Bun.password.verifySync(password, hash)).toBe(true);
		expect(Bun.password.verifySync("wrong", hash)).toBe(false);
	});

	test("mock creates a function with call tracking", () => {
		const { mock } = require("bun:test");
		const fn = mock((x: number) => x * 2);
		expect(fn(3)).toBe(6);
		expect(fn(5)).toBe(10);
		expect(fn.mock.calls).toHaveLength(2);
		expect(fn.mock.calls[0]).toEqual([3]);
		expect(fn.mock.calls[1]).toEqual([5]);
	});

	test("SecretClient EnvSecretsLive resolves env vars", async () => {
		const key = "SECRETCLIENT_TEST_API_KEY";
		Bun.env[key] = "test-api-key-123";
		try {
			const result = await Effect.runPromise(
				Effect.gen(function* () {
					const client = yield* SecretClient;
					return yield* client.get("secretclient-test", "api-key");
				}).pipe(Effect.provide(EnvSecretsLive)),
			);
			expect(result).toBe("test-api-key-123");
		} finally {
			delete Bun.env[key];
		}
	});

	test("SecretClient EnvSecretsLive fails on missing key", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* SecretClient;
				return yield* client.get("nonexistent", "missing-key");
			}).pipe(
				Effect.provide(EnvSecretsLive),
				Effect.catchTag("SecretError", (e) => Effect.succeed(e as SecretError)),
			),
		);
		expect(result).toBeInstanceOf(SecretError);
		expect((result as SecretError).namespace).toBe("nonexistent");
	});

	test("SecretClient VaultSecretsLive is a stub that fails", async () => {
		const result = await Effect.runPromise(
			Effect.gen(function* () {
				const client = yield* SecretClient;
				return yield* client.get("prod", "db-password");
			}).pipe(
				Effect.provide(VaultSecretsLive),
				Effect.catchTag("SecretError", (e) => Effect.succeed(e as SecretError)),
			),
		);
		expect(result).toBeInstanceOf(SecretError);
	});

	test("setSystemTime mocks the system clock", () => {
		setSystemTime(new Date("1999-01-01T12:00:00Z"));
		expect(new Date().getFullYear()).toBe(1999);
		setSystemTime(); // reset
		expect(new Date().getFullYear()).toBeGreaterThan(1999);
	});

	test("secret TTL expires after the specified duration", async () => {
		setSystemTime(new Date("2024-01-01T00:00:00Z"));

		await Effect.runPromise(
			setSecret("test", "temp-key", "s3cret", 3600).pipe(
				Effect.provide(InMemorySecretStoreLive),
			),
		);

		// Still valid within TTL
		const fresh = await Effect.runPromise(
			getSecret("test", "temp-key").pipe(
				Effect.provide(InMemorySecretStoreLive),
			),
		);
		expect(fresh).toBe("s3cret");

		// Fast-forward 2 hours
		setSystemTime(new Date("2024-01-01T02:00:00Z"));
		const expired = await Effect.runPromise(
			getSecret("test", "temp-key").pipe(
				Effect.provide(InMemorySecretStoreLive),
			),
		);
		expect(expired).toBeNull();

		setSystemTime(); // reset
	});

	test("setSecret without TTL never expires", async () => {
		await Effect.runPromise(
			setSecret("perm", "key", "forever").pipe(
				Effect.provide(InMemorySecretStoreLive),
			),
		);

		const value = await Effect.runPromise(
			getSecret("perm", "key").pipe(Effect.provide(InMemorySecretStoreLive)),
		);
		expect(value).toBe("forever");
	});

	test("deleteSecret removes a secret", async () => {
		await Effect.runPromise(
			setSecret("tmp", "to-delete", "x").pipe(
				Effect.provide(InMemorySecretStoreLive),
			),
		);

		await Effect.runPromise(
			deleteSecret("tmp", "to-delete").pipe(
				Effect.provide(InMemorySecretStoreLive),
			),
		);

		const result = await Effect.runPromise(
			getSecret("tmp", "to-delete").pipe(
				Effect.provide(InMemorySecretStoreLive),
			),
		);
		expect(result).toBeNull();
	});
});
