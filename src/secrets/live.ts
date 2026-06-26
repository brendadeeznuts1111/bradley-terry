import { Effect, Layer } from "effect";
import { BunSecretsLive, bunDelete, bunGet, bunSet } from "./bun-live.js";
import { SecretClient, type SecretClientApi, secretError } from "./client.js";
import { decodeSecretEntry } from "./entry.js";
import { lookupEnv } from "./env-key.js";
import { EnvSecretsLive } from "./env-live.js";
import { VaultSecretsLive } from "./vault-live.js";

const autoGet: SecretClientApi["get"] = (namespace, name) =>
  Effect.gen(function* () {
    const raw = lookupEnv(namespace, name);
    if (raw !== undefined) {
      const decoded = decodeSecretEntry(raw);
      if (decoded === null) {
        return yield* Effect.fail(secretError(new Error("secret expired"), namespace, name));
      }
      return decoded;
    }
    return yield* bunGet(namespace, name);
  });

const autoClient: SecretClientApi = {
  get: autoGet,
  set: bunSet,
  delete: bunDelete,
};

/** auto: env read → Bun.secrets fallback; writes always use Bun.secrets */
export const AutoSecretsLive = Layer.effect(
  SecretClient,
  Effect.sync(() => autoClient),
);

export const resolveSecretClientLive = (): Layer.Layer<SecretClient> => {
  const backend = process.env.SECRETS_BACKEND ?? "auto";
  if (backend === "vault") return VaultSecretsLive;
  if (backend === "env") return EnvSecretsLive;
  if (backend === "bun") return BunSecretsLive;
  return AutoSecretsLive;
};
