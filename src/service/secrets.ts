import { Context, Data, Effect, Layer } from "effect";

export class SecretError extends Data.TaggedError("SecretError")<{
  readonly cause: unknown;
  readonly service: string;
  readonly name: string;
}> {}

export class SecretNotFoundError extends Data.TaggedError("SecretNotFoundError")<{
  readonly service: string;
  readonly name: string;
}> {}

export interface SecretClientApi {
  readonly get: (
    service: string,
    name: string
  ) => Effect.Effect<string, SecretError | SecretNotFoundError>;
}

export class SecretClient extends Context.Tag("SecretClient")<
  SecretClient,
  SecretClientApi
>() {}

export const MASSEY_SECRET_SERVICE = "com.bradley-terry.massey";
export const MASSEY_SECRET_NAME = "api-token";
export const DB_SECRET_SERVICE = "com.bradley-terry.db";
export const DB_SECRET_NAME = "encryption-passphrase";

const envLookup = (service: string, name: string): string | undefined => {
  const known: Record<string, string | undefined> = {
    [`${MASSEY_SECRET_SERVICE}:${MASSEY_SECRET_NAME}`]: process.env.MASSEY_API_TOKEN,
    [`${DB_SECRET_SERVICE}:${DB_SECRET_NAME}`]: process.env.DB_ENCRYPTION_KEY,
  };
  if (known[`${service}:${name}`]) return known[`${service}:${name}`];
  const slug = `SECRET_${service.replace(/\./g, "_").toUpperCase()}_${name.replace(/-/g, "_").toUpperCase()}`;
  return process.env[slug];
};

const getFromBun = (service: string, name: string) =>
  Effect.gen(function* () {
    if (typeof Bun === "undefined" || !Bun.secrets) {
      return yield* Effect.fail(new SecretNotFoundError({ service, name }));
    }
    const value = yield* Effect.tryPromise({
      try: () => Bun.secrets.get({ service, name }),
      catch: (cause) => new SecretError({ cause, service, name }),
    });
    if (value === null || value === "") {
      return yield* Effect.fail(new SecretNotFoundError({ service, name }));
    }
    return value;
  });

const getFromEnv = (service: string, name: string) =>
  Effect.gen(function* () {
    const value = envLookup(service, name);
    if (!value) {
      return yield* Effect.fail(new SecretNotFoundError({ service, name }));
    }
    return value;
  });

const getFromVault = (service: string, name: string) =>
  Effect.gen(function* () {
    const addr = process.env.VAULT_ADDR;
    const token = process.env.VAULT_TOKEN;
    if (!addr || !token) {
      return yield* Effect.fail(
        new SecretError({
          cause: new Error("VAULT_ADDR and VAULT_TOKEN required"),
          service,
          name,
        })
      );
    }

    const url = `${addr.replace(/\/$/, "")}/v1/secret/data/${service}/${name}`;
    const response = yield* Effect.tryPromise({
      try: () => fetch(url, { headers: { "X-Vault-Token": token } }),
      catch: (cause) => new SecretError({ cause, service, name }),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new SecretError({
          cause: new Error(`Vault HTTP ${response.status}`),
          service,
          name,
        })
      );
    }

    const body = (yield* Effect.tryPromise({
      try: () =>
        response.json() as Promise<{ data?: { data?: { value?: string } } }>,
      catch: (cause) => new SecretError({ cause, service, name }),
    })) as { data?: { data?: { value?: string } } };

    const value = body.data?.data?.value;
    if (!value) {
      return yield* Effect.fail(new SecretNotFoundError({ service, name }));
    }
    return value;
  });

/** Local dev: OS IPC (Keychain / libsecret / Credential Manager) */
export const BunSecretsLive = Layer.succeed(SecretClient, {
  get: getFromBun,
});

/** CI/CD: process environment (ephemeral, per-job isolation) */
export const EnvSecretsLive = Layer.succeed(SecretClient, {
  get: getFromEnv,
});

/** Production: HTTPS to Vault */
export const VaultSecretsLive = Layer.succeed(SecretClient, {
  get: getFromVault,
});

/** auto: env → bun.secrets; vault/ci/bun forced via SECRETS_BACKEND */
export const SecretClientAutoLive = Layer.succeed(SecretClient, {
  get: (service, name) => {
    const backend = process.env.SECRETS_BACKEND ?? "auto";
    if (backend === "vault") return getFromVault(service, name);
    if (backend === "env") return getFromEnv(service, name);
    if (backend === "bun") return getFromBun(service, name);
    return getFromEnv(service, name).pipe(
      Effect.catchTag("SecretNotFoundError", () => getFromBun(service, name))
    );
  },
});

export const resolveSecretClientLive = (): Layer.Layer<SecretClient> => {
  const backend = process.env.SECRETS_BACKEND ?? "auto";
  if (backend === "vault") return VaultSecretsLive;
  if (backend === "env") return EnvSecretsLive;
  if (backend === "bun") return BunSecretsLive;
  return SecretClientAutoLive;
};
