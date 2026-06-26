import { Effect, Layer } from "effect";
import { secretError, SecretClient } from "./client.js";
import { decodeSecretEntry } from "./entry.js";
import { bunSecretsOptions } from "./namespaces.js";

const decodeRaw = (namespace: string, name: string, raw: string) =>
  Effect.gen(function* () {
    const decoded = decodeSecretEntry(raw);
    if (decoded === null) {
      return yield* Effect.fail(
        secretError(new Error("secret expired"), namespace, name)
      );
    }
    return decoded;
  });

export const bunGet = (namespace: string, name: string) =>
  Effect.gen(function* () {
    if (typeof Bun === "undefined" || !Bun.secrets) {
      return yield* Effect.fail(
        secretError(new Error("Bun.secrets is not available"), namespace, name)
      );
    }
    const raw = yield* Effect.tryPromise({
      try: () => Bun.secrets.get(bunSecretsOptions(namespace, name)),
      catch: (e) => secretError(e, namespace, name),
    });
    if (raw === null || raw === "") {
      return yield* Effect.fail(
        secretError(new Error("secret not found"), namespace, name)
      );
    }
    return yield* decodeRaw(namespace, name, raw);
  });

export const bunSet = (namespace: string, name: string, value: string) =>
  Effect.gen(function* () {
    if (typeof Bun === "undefined" || !Bun.secrets) {
      return yield* Effect.fail(
        secretError(new Error("Bun.secrets is not available"), namespace, name)
      );
    }
    yield* Effect.tryPromise({
      try: () => Bun.secrets.set(bunSecretsOptions(namespace, name), value),
      catch: (e) => secretError(e, namespace, name),
    });
  });

export const bunDelete = (namespace: string, name: string) =>
  Effect.gen(function* () {
    if (typeof Bun === "undefined" || !Bun.secrets) {
      return yield* Effect.fail(
        secretError(new Error("Bun.secrets is not available"), namespace, name)
      );
    }
    return yield* Effect.tryPromise({
      try: () => Bun.secrets.delete(bunSecretsOptions(namespace, name)),
      catch: (e) => secretError(e, namespace, name),
    });
  });

/** Local dev: OS keychain IPC via `Bun.secrets` */
export const BunSecretsLive = Layer.effect(
  SecretClient,
  Effect.sync(() => ({
    get: bunGet,
    set: bunSet,
    delete: bunDelete,
  }))
);
