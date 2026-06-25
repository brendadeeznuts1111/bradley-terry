import { describe, expect, test } from "bun:test";

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
});
