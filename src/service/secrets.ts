import { Context, Data, Effect, Layer } from "effect";
import { decodeSecretEntry, encodeSecretEntry } from "./secret-entry.js";
import { formatSecretKey, type SecretKey, secretKey } from "./secret-key.js";

export type { SecretKey } from "./secret-key.js";
export { secretKey, formatSecretKey } from "./secret-key.js";

export class SecretError extends Data.TaggedError("SecretError")<{
  readonly cause: unknown;
  readonly service: string;
  readonly name: string;
}> {}

export class SecretNotFoundError extends Data.TaggedError("SecretNotFoundError")<{
  readonly service: string;
  readonly name: string;
}> {}

export class SecretExpiredError extends Data.TaggedError("SecretExpiredError")<{
  readonly service: string;
  readonly name: string;
}> {}

export class SecretUnsupportedError extends Data.TaggedError("SecretUnsupportedError")<{
  readonly operation: "set" | "delete";
  readonly backend: string;
}> {}

export interface SecretClientApi {
  /** `Bun.secrets.get` — returns decoded plaintext; TTL JSON entries honored. */
  readonly get: (
    service: string,
    name: string
  ) => Effect.Effect<string, SecretError | SecretNotFoundError | SecretExpiredError>;
  /** `Bun.secrets.set` — stores value (optionally TTL-wrapped JSON). Bun backend only. */
  readonly set: (
    service: string,
    name: string,
    value: string,
    ttlSeconds?: number
  ) => Effect.Effect<void, SecretError | SecretUnsupportedError>;
  /** `Bun.secrets.delete` — returns whether a key existed. Bun backend only. */
  readonly delete: (
    service: string,
    name: string
  ) => Effect.Effect<boolean, SecretError | SecretUnsupportedError>;
}

export class SecretClient extends Context.Tag("SecretClient")<
  SecretClient,
  SecretClientApi
>() {}

export const MASSEY_SECRET_SERVICE = "com.bradley-terry.massey";
export const MASSEY_SECRET_NAME = "api-token";
export const DB_SECRET_SERVICE = "com.bradley-terry.db";
export const DB_SECRET_NAME = "encryption-passphrase";

export const MASSEY_SECRET_KEY = secretKey(MASSEY_SECRET_SERVICE, MASSEY_SECRET_NAME);
export const DB_SECRET_KEY = secretKey(DB_SECRET_SERVICE, DB_SECRET_NAME);

const toKey = (service: string, name: string): SecretKey => ({ service, name });

const envLookup = (key: SecretKey): string | undefined => {
  const known: Record<string, string | undefined> = {
    [formatSecretKey(MASSEY_SECRET_KEY)]: process.env.MASSEY_API_TOKEN,
    [formatSecretKey(DB_SECRET_KEY)]: process.env.DB_ENCRYPTION_KEY,
  };
  const slug = `SECRET_${key.service.replace(/\./g, "_").toUpperCase()}_${key.name.replace(/-/g, "_").toUpperCase()}`;
  return known[formatSecretKey(key)] ?? process.env[slug];
};

const decodeOrFail = (key: SecretKey, raw: string) =>
  Effect.gen(function* () {
    const decoded = decodeSecretEntry(raw);
    if (decoded === null) {
      return yield* Effect.fail(
        new SecretExpiredError({ service: key.service, name: key.name })
      );
    }
    return decoded;
  });

const getFromBun = (key: SecretKey) =>
  Effect.gen(function* () {
    if (typeof Bun === "undefined" || !Bun.secrets) {
      return yield* Effect.fail(
        new SecretNotFoundError({ service: key.service, name: key.name })
      );
    }
    const value = yield* Effect.tryPromise({
      try: () => Bun.secrets.get(key),
      catch: (cause) =>
        new SecretError({ cause, service: key.service, name: key.name }),
    });
    if (value === null || value === "") {
      return yield* Effect.fail(
        new SecretNotFoundError({ service: key.service, name: key.name })
      );
    }
    return yield* decodeOrFail(key, value);
  });

const setInBun = (key: SecretKey, value: string, ttlSeconds?: number) =>
  Effect.gen(function* () {
    if (typeof Bun === "undefined" || !Bun.secrets) {
      return yield* Effect.fail(
        new SecretError({
          cause: new Error("Bun.secrets is not available"),
          service: key.service,
          name: key.name,
        })
      );
    }
    const payload = encodeSecretEntry(value, ttlSeconds);
    yield* Effect.tryPromise({
      try: () => Bun.secrets.set(key, payload),
      catch: (cause) =>
        new SecretError({ cause, service: key.service, name: key.name }),
    });
  });

const deleteFromBun = (key: SecretKey) =>
  Effect.gen(function* () {
    if (typeof Bun === "undefined" || !Bun.secrets) {
      return yield* Effect.fail(
        new SecretError({
          cause: new Error("Bun.secrets is not available"),
          service: key.service,
          name: key.name,
        })
      );
    }
    return yield* Effect.tryPromise({
      try: () => Bun.secrets.delete(key),
      catch: (cause) =>
        new SecretError({ cause, service: key.service, name: key.name }),
    });
  });

const getFromEnv = (key: SecretKey) =>
  Effect.gen(function* () {
    const value = envLookup(key);
    if (!value) {
      return yield* Effect.fail(
        new SecretNotFoundError({ service: key.service, name: key.name })
      );
    }
    return yield* decodeOrFail(key, value);
  });

const unsupported =
  (operation: "set" | "delete", backend: string) =>
  Effect.fail(new SecretUnsupportedError({ operation, backend }));

const getFromVault = (key: SecretKey) =>
  Effect.gen(function* () {
    const addr = process.env.VAULT_ADDR;
    const token = process.env.VAULT_TOKEN;
    if (!addr || !token) {
      return yield* Effect.fail(
        new SecretError({
          cause: new Error("VAULT_ADDR and VAULT_TOKEN required"),
          service: key.service,
          name: key.name,
        })
      );
    }

    const url = `${addr.replace(/\/$/, "")}/v1/secret/data/${key.service}/${key.name}`;
    const response = yield* Effect.tryPromise({
      try: () => fetch(url, { headers: { "X-Vault-Token": token } }),
      catch: (cause) =>
        new SecretError({ cause, service: key.service, name: key.name }),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new SecretError({
          cause: new Error(`Vault HTTP ${response.status}`),
          service: key.service,
          name: key.name,
        })
      );
    }

    const body = (yield* Effect.tryPromise({
      try: () =>
        response.json() as Promise<{ data?: { data?: { value?: string } } }>,
      catch: (cause) =>
        new SecretError({ cause, service: key.service, name: key.name }),
    })) as { data?: { data?: { value?: string } } };

    const value = body.data?.data?.value;
    if (!value) {
      return yield* Effect.fail(
        new SecretNotFoundError({ service: key.service, name: key.name })
      );
    }
    return value;
  });

const bunClient: SecretClientApi = {
  get: (service, name) => getFromBun(toKey(service, name)),
  set: (service, name, value, ttlSeconds) =>
    setInBun(toKey(service, name), value, ttlSeconds),
  delete: (service, name) => deleteFromBun(toKey(service, name)),
};

const envClient: SecretClientApi = {
  get: (service, name) => getFromEnv(toKey(service, name)),
  set: () => unsupported("set", "env"),
  delete: () => unsupported("delete", "env"),
};

const vaultClient: SecretClientApi = {
  get: (service, name) => getFromVault(toKey(service, name)),
  set: () => unsupported("set", "vault"),
  delete: () => unsupported("delete", "vault"),
};

const autoClient: SecretClientApi = {
  get: (service, name) =>
    getFromEnv(toKey(service, name)).pipe(
      Effect.catchTag("SecretNotFoundError", () =>
        getFromBun(toKey(service, name))
      )
    ),
  set: (service, name, value, ttlSeconds) =>
    setInBun(toKey(service, name), value, ttlSeconds),
  delete: (service, name) => deleteFromBun(toKey(service, name)),
};

/** Local dev: OS IPC (Keychain / libsecret / Credential Manager) */
export const BunSecretsLive = Layer.succeed(SecretClient, bunClient);

/** CI/CD: process environment (ephemeral, per-job isolation) */
export const EnvSecretsLive = Layer.succeed(SecretClient, envClient);

/** Production: HTTPS to Vault */
export const VaultSecretsLive = Layer.succeed(SecretClient, vaultClient);

/** auto: env → bun.secrets; vault/ci/bun forced via SECRETS_BACKEND */
export const SecretClientAutoLive = Layer.succeed(SecretClient, autoClient);

const clientForBackend = (backend: string): SecretClientApi => {
  if (backend === "vault") return vaultClient;
  if (backend === "env") return envClient;
  if (backend === "bun") return bunClient;
  return autoClient;
};

export const resolveSecretClientLive = (): Layer.Layer<SecretClient> => {
  const backend = process.env.SECRETS_BACKEND ?? "auto";
  return Layer.succeed(SecretClient, clientForBackend(backend));
};
