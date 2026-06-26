import { describe, expect, it } from "bun:test";
import { Effect, Layer } from "effect";
import {
  EnvSecretsLive,
  MASSEY_SECRET_NAME,
  MASSEY_SECRET_SERVICE,
  SecretClient,
} from "../src/service/secrets.js";
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
          .get(MASSEY_SECRET_SERVICE, MASSEY_SECRET_NAME)
          .pipe(Effect.catchTag("SecretNotFoundError", () => Effect.succeed(null)));
        return {
          masseyUrl: "http://localhost",
          dbPath: ":memory:",
          interval: 60,
          port: 0,
          masseyApiKey,
          dbEncryptionKey: null,
        };
      })
    ).pipe(Layer.provide(EnvSecretsLive));

    const config = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* RatingsConfigTag;
      }).pipe(Effect.provide(ConfigTestLive))
    );

    expect(config.masseyApiKey).toBe("test-token-123");
    delete process.env.MASSEY_API_TOKEN;
    delete process.env.SECRETS_BACKEND;
  });
});
