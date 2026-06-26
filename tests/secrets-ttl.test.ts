import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { Effect } from "effect";
import {
  decodeSecretEntry,
  encodeSecretEntry,
  isSecretEntryExpired,
} from "../src/service/secret-entry.js";
import { EnvSecretsLive, SecretClient } from "../src/service/secrets.js";
import { seedDeterministicClock } from "./helpers.js";

describe("secret TTL entries", () => {
  let resetClock: (() => void) | undefined;

  afterEach(() => {
    resetClock?.();
    resetClock = undefined;
    delete process.env.MASSEY_API_TOKEN;
    delete process.env.SECRETS_BACKEND;
  });

  it("encode/decode round-trips plain values", () => {
    resetClock = seedDeterministicClock(new Date("2024-01-01T00:00:00Z"));
    const raw = encodeSecretEntry("plain-token");
    expect(decodeSecretEntry(raw)).toBe("plain-token");
    expect(isSecretEntryExpired(raw)).toBe(false);
  });

  it("expires after TTL window with deterministic clock", () => {
    resetClock = seedDeterministicClock(new Date("2024-01-01T00:00:00Z"));

    const raw = encodeSecretEntry("temp-key", 3600);
    expect(decodeSecretEntry(raw)).toBe("temp-key");

    setSystemTime(new Date("2024-01-01T02:00:00Z"));
    expect(decodeSecretEntry(raw)).toBeNull();
    expect(isSecretEntryExpired(raw)).toBe(true);
  });

  it("SecretClient env backend treats expired JSON entry as SecretExpiredError", async () => {
    resetClock = seedDeterministicClock(new Date("2024-06-01T00:00:00Z"));
    process.env.SECRETS_BACKEND = "env";
    process.env.MASSEY_API_TOKEN = encodeSecretEntry("ttl-token", 60);

    const before = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* SecretClient;
        return yield* client.get("com.bradley-terry.massey", "api-token");
      }).pipe(Effect.provide(EnvSecretsLive))
    );
    expect(before).toBe("ttl-token");

    setSystemTime(new Date("2024-06-01T00:02:00Z"));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* SecretClient;
        return yield* client.get("com.bradley-terry.massey", "api-token");
      }).pipe(
        Effect.provide(EnvSecretsLive),
        Effect.catchTag("SecretExpiredError", () => Effect.succeed("expired"))
      )
    );
    expect(result).toBe("expired");
  });
});
