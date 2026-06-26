import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import { RatingsConfig, RatingsConfigLive } from "../src/ratings/config";
import { SecretClient, SecretError } from "../src/secrets";

// Test double that returns predictable secrets for each service/name pair.
const TestSecretsLive = Layer.succeed(SecretClient, {
	get: (service: string, name: string) => {
		const secrets: Record<string, string> = {
			"bradley-ratings.messy-client:api-key": "test-api-key-123",
			"bradley-ratings.db:sqlite-path": "/tmp/test-ratings.sqlite",
		};
		const value = secrets[`${service}:${name}`];
		if (value) return Effect.succeed(value);
		return Effect.fail(
			new SecretError({
				service,
				name,
				cause: "missing in test double",
			}),
		);
	},
});

describe("RatingsConfig Layer", () => {
	it("resolves config values from the SecretClient", async () => {
		const program = Effect.gen(function* () {
			const config = yield* RatingsConfig;
			return config;
		}).pipe(Effect.provide(RatingsConfigLive), Effect.provide(TestSecretsLive));

		const result = await Effect.runPromise(program);
		expect(result.apiKey).toBe("test-api-key-123");
		expect(result.dbPath).toBe("/tmp/test-ratings.sqlite");
		expect(result.masseyUrl).toBe("https://api.masseyratings.com");
		expect(result.interval).toBe(3600000);
	});

	it("fails with SecretError when a secret is missing", async () => {
		const EmptySecretsLive = Layer.succeed(SecretClient, {
			get: (service: string, name: string) =>
				Effect.fail(
					new SecretError({
						service,
						name,
						cause: "missing",
					}),
				),
		});

		const program = Effect.gen(function* () {
			return yield* RatingsConfig;
		}).pipe(
			Effect.provide(RatingsConfigLive),
			Effect.provide(EmptySecretsLive),
		);

		await expect(Effect.runPromise(program)).rejects.toBeInstanceOf(Error);
	});
});
