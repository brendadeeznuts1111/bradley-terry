import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { envVarName, lookupEnv } from "../src/secrets/env-key.js";
import { AutoSecretsLive, SecretClient } from "../src/secrets/index.js";
import {
  DB_NAMESPACE,
  DB_SECRET_NAME,
  MASSEY_NAMESPACE,
  MASSEY_SECRET_NAME,
} from "../src/secrets/namespaces.js";

describe("secrets env-key", () => {
  it("builds SECRET_* env var names from namespace", () => {
    expect(envVarName(MASSEY_NAMESPACE, MASSEY_SECRET_NAME)).toBe(
      "SECRET_COM_BRADLEY_TERRY_MASSEY_API_TOKEN",
    );
  });

  it("resolves known aliases before slug env keys", () => {
    process.env.MASSEY_API_TOKEN = "alias-token";
    expect(lookupEnv(MASSEY_NAMESPACE, MASSEY_SECRET_NAME)).toBe("alias-token");
    delete process.env.MASSEY_API_TOKEN;
  });

  it("resolves slug env keys for arbitrary namespaces", () => {
    const key = envVarName(DB_NAMESPACE, DB_SECRET_NAME);
    process.env[key] = "slug-key";
    expect(lookupEnv(DB_NAMESPACE, DB_SECRET_NAME)).toBe("slug-key");
    delete process.env[key];
  });
});

describe("AutoSecretsLive", () => {
  it("reads from env without touching Bun.secrets", async () => {
    process.env.SECRETS_BACKEND = "auto";
    process.env.MASSEY_API_TOKEN = "auto-env-token";

    const value = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* SecretClient;
        return yield* client.get(MASSEY_NAMESPACE, MASSEY_SECRET_NAME);
      }).pipe(Effect.provide(AutoSecretsLive)),
    );

    expect(value).toBe("auto-env-token");
    delete process.env.MASSEY_API_TOKEN;
    delete process.env.SECRETS_BACKEND;
  });
});
