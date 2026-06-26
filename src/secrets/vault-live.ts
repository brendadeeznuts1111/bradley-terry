import { Effect, Layer } from "effect";
import { secretError, SecretClient } from "./client.js";

const vaultPath = (namespace: string, name: string) =>
  `${namespace.replace(/\./g, "/")}/${name}`;

const vaultHeaders = () => {
  const token = process.env.VAULT_TOKEN;
  if (!token) {
    throw new Error("VAULT_TOKEN required");
  }
  return { "X-Vault-Token": token };
};

const vaultBase = () => {
  const addr = process.env.VAULT_ADDR;
  if (!addr) {
    throw new Error("VAULT_ADDR required");
  }
  return addr.replace(/\/$/, "");
};

const vaultGet = (namespace: string, name: string) =>
  Effect.gen(function* () {
    let base: string;
    try {
      base = vaultBase();
    } catch (e) {
      return yield* Effect.fail(secretError(e, namespace, name));
    }

    const url = `${base}/v1/secret/data/${vaultPath(namespace, name)}`;
    const response = yield* Effect.tryPromise({
      try: () => fetch(url, { headers: vaultHeaders() }),
      catch: (e) => secretError(e, namespace, name),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        secretError(new Error(`Vault HTTP ${response.status}`), namespace, name)
      );
    }

    const body = (yield* Effect.tryPromise({
      try: () =>
        response.json() as Promise<{ data?: { data?: { value?: string } } }>,
      catch: (e) => secretError(e, namespace, name),
    })) as { data?: { data?: { value?: string } } };

    const value = body.data?.data?.value;
    if (!value) {
      return yield* Effect.fail(
        secretError(new Error("secret not found"), namespace, name)
      );
    }
    return value;
  });

const vaultSet = (namespace: string, name: string, value: string) =>
  Effect.gen(function* () {
    let base: string;
    try {
      base = vaultBase();
    } catch (e) {
      return yield* Effect.fail(secretError(e, namespace, name));
    }

    const url = `${base}/v1/secret/data/${vaultPath(namespace, name)}`;
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: "POST",
          headers: { ...vaultHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ data: { value } }),
        }),
      catch: (e) => secretError(e, namespace, name),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        secretError(new Error(`Vault HTTP ${response.status}`), namespace, name)
      );
    }
  });

const vaultDelete = (namespace: string, name: string) =>
  Effect.gen(function* () {
    let base: string;
    try {
      base = vaultBase();
    } catch (e) {
      return yield* Effect.fail(secretError(e, namespace, name));
    }

    const url = `${base}/v1/secret/data/${vaultPath(namespace, name)}`;
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          method: "DELETE",
          headers: vaultHeaders(),
        }),
      catch: (e) => secretError(e, namespace, name),
    });

    return response.ok;
  });

/** Production: Vault / AWS Secrets Manager style HTTPS API */
export const VaultSecretsLive = Layer.effect(
  SecretClient,
  Effect.sync(() => ({
    get: vaultGet,
    set: vaultSet,
    delete: vaultDelete,
  }))
);
