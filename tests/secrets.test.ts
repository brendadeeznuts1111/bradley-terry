import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import {
  EnvSecretsLive,
  MASSEY_NAMESPACE,
  MASSEY_SECRET_NAME,
  SecretClient,
} from "../src/secrets/index.js";
import { RatingsConfigTag } from "../src/service/config.js";

describe("SecretClient", () => {
  it("reads massey api token from env backend", async () => {
    process.env.SECRETS_BACKEND = "env";
    process.env.MASSEY_API_TOKEN = "test-token-123";

    const ConfigTestLive = Layer.effect(
      RatingsConfigTag,
      Effect.gen(function* () {
        const secrets = yield* SecretClient;
        const masseyApiKey = yield* secrets
          .get(MASSEY_NAMESPACE, MASSEY_SECRET_NAME)
          .pipe(Effect.catchTag("SecretError", () => Effect.succeed(null)));
        return {
          masseyUrl: "http://localhost",
          dbPath: ":memory:",
          interval: 60,
          port: 0,
          masseyApiKey,
          dbEncryptionKey: null,
        };
      }),
    ).pipe(Layer.provide(EnvSecretsLive));

    const config = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* RatingsConfigTag;
      }).pipe(Effect.provide(ConfigTestLive)),
    );

    expect(config.masseyApiKey).toBe("test-token-123");
    delete process.env.MASSEY_API_TOKEN;
    delete process.env.SECRETS_BACKEND;
  });

  it("no-ops set/delete on env backend (read-only CI)", async () => {
    process.env.SECRETS_BACKEND = "env";

    await Effect.runPromise(
      Effect.gen(function* () {
        const secrets = yield* SecretClient;
        yield* secrets.set(MASSEY_NAMESPACE, MASSEY_SECRET_NAME, "x");
        const deleted = yield* secrets.delete(MASSEY_NAMESPACE, MASSEY_SECRET_NAME);
        expect(deleted).toBe(false);
      }).pipe(Effect.provide(EnvSecretsLive)),
    );

    delete process.env.SECRETS_BACKEND;
  });
});
