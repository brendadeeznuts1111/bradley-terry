import { Effect, Layer } from "effect";
import { secretError, SecretClient } from "./client.js";
import { decodeSecretEntry } from "./entry.js";
import { lookupEnv } from "./env-key.js";

const envGet = (namespace: string, name: string) =>
  Effect.gen(function* () {
    const raw = lookupEnv(namespace, name);
    if (!raw) {
      return yield* Effect.fail(
        secretError(new Error("secret not found"), namespace, name)
      );
    }
    const decoded = decodeSecretEntry(raw);
    if (decoded === null) {
      return yield* Effect.fail(
        secretError(new Error("secret expired"), namespace, name)
      );
    }
    return decoded;
  });

/** CI/CD: `process.env` read-only; set/delete are no-ops */
export const EnvSecretsLive = Layer.effect(
  SecretClient,
  Effect.sync(() => ({
    get: envGet,
    set: () => Effect.void,
    delete: () => Effect.succeed(false),
  }))
);

export { envGet };
