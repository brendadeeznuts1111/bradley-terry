import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

function makeTempDir(): string {
	return mkdtempSync(join(os.tmpdir(), "bun-native-api-test-"));
}

describe("Bun native API verification", () => {
	test("CryptoHasher produces a consistent hex digest", () => {
		const input = "verify me";
		const digest = new Bun.CryptoHasher("sha256").update(input).digest("hex");

		expect(digest).toBe(
			new Bun.CryptoHasher("sha256").update(input).digest("hex"),
		);
		expect(digest).toMatch(/^[0-9a-f]{64}$/);
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
});
