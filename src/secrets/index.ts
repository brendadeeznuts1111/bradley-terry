/**
 * SecretClient — channel-agnostic secret retrieval for RatingsConfig.
 *
 * Abstracts over Bun.secrets (local), HashiCorp Vault (production),
 * and env vars (CI) so the Effect Layer never knows which backend
 * supplied the secret.
 *
 * Inspired by the Effect service pattern used by BradleyTerry:
 *   Context.Tag → Layer.succeed / Layer.effect → Effect.gen pipeline
 */
import { Context, Data, Effect, Layer } from "effect";

interface BunSecretsAPI {
	secrets?: {
		get: (opts: { service: string; name: string }) => Promise<string>;
	};
}

// ── Error type ────────────────────────────────────────────────────
export class SecretError extends Data.TaggedError("SecretError")<{
	readonly service: string;
	readonly name: string;
	readonly cause: unknown;
}> {}

// ── Service tag ───────────────────────────────────────────────────
export class SecretClient extends Context.Tag("SecretClient")<
	SecretClient,
	{
		readonly get: (
			service: string,
			name: string,
		) => Effect.Effect<string, SecretError>;
	}
>() {}

// ── Bun.secrets implementation (local dev) ────────────────────────
export const BunSecretsLive = Layer.succeed(SecretClient, {
	get: (service, name) =>
		Effect.tryPromise({
			try: () =>
				// Bun.secrets returns Promise<string>, throws on missing key
				(Bun as unknown as BunSecretsAPI).secrets?.get({ service, name }) ??
				Promise.reject(new Error("Bun.secrets unavailable")),
			catch: (cause) => new SecretError({ service, name, cause }),
		}),
});

// ── Env-var fallback (CI / env-based config) ──────────────────────
export const EnvSecretsLive = Layer.succeed(SecretClient, {
	get: (service, name) =>
		Effect.gen(function* () {
			const key = `${service.toUpperCase().replace(/-/g, "_")}_${name
				.toUpperCase()
				.replace(/-/g, "_")}`;
			const value = Bun.env[key];
			if (!value) {
				return yield* Effect.fail(
					new SecretError({
						service,
						name,
						cause: `Missing env var ${key}`,
					}),
				);
			}
			return value;
		}),
});

// ── Vault stub (production — swap in real fetch) ──────────────────
export const VaultSecretsLive = Layer.succeed(SecretClient, {
	get: (_service, _name) =>
		Effect.fail(
			new SecretError({
				service: _service,
				name: _name,
				cause: "VaultSecretsLive is a stub — provide real fetch implementation",
			}),
		),
});

// ═══════════════════════════════════════════════════════════════════
// TTL-aware secret store (for setSecret / getSecret with expiry)
// ═══════════════════════════════════════════════════════════════════

export interface SecretEntry {
	value: string;
	expiresAt?: number; // Unix timestamp in milliseconds
}

export class SecretStoreError extends Data.TaggedError("SecretStoreError")<{
	readonly domain: string;
	readonly name: string;
	readonly cause: unknown;
}> {}

export class SecretStore extends Context.Tag("SecretStore")<
	SecretStore,
	{
		readonly get: (
			domain: string,
			name: string,
		) => Effect.Effect<SecretEntry | null, SecretStoreError>;
		readonly set: (
			domain: string,
			name: string,
			entry: SecretEntry,
		) => Effect.Effect<void, SecretStoreError>;
		readonly delete: (
			domain: string,
			name: string,
		) => Effect.Effect<void, SecretStoreError>;
	}
>() {}

// In-memory store for testing (setSystemTime-safe)
const inMemorySecretStore = new Map<string, SecretEntry>();

export const InMemorySecretStoreLive = Layer.succeed(SecretStore, {
	get: (_domain: string, _name: string) =>
		Effect.sync(() => {
			const key = `${_domain}:${_name}`;
			const entry = inMemorySecretStore.get(key) ?? null;
			if (entry?.expiresAt && Date.now() > entry.expiresAt) {
				inMemorySecretStore.delete(key);
				return null;
			}
			return entry;
		}),
	set: (_domain: string, _name: string, entry: SecretEntry) =>
		Effect.sync(() => {
			const key = `${_domain}:${_name}`;
			inMemorySecretStore.set(key, entry);
		}),
	delete: (_domain: string, _name: string) =>
		Effect.sync(() => {
			const key = `${_domain}:${_name}`;
			inMemorySecretStore.delete(key);
		}),
});

// ── High-level TTL helpers (use SecretStore) ───────────────────────

export function setSecret(
	domain: string,
	name: string,
	value: string,
	ttlSeconds?: number,
): Effect.Effect<void, SecretStoreError> {
	return Effect.gen(function* () {
		const store = yield* SecretStore;
		const entry: SecretEntry = {
			value,
			expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
		};
		yield* store.set(domain, name, entry);
	});
}

export function getSecret(
	domain: string,
	name: string,
): Effect.Effect<string | null, SecretStoreError> {
	return Effect.gen(function* () {
		const store = yield* SecretStore;
		const entry = yield* store.get(domain, name);
		if (!entry) return null;
		return entry.value;
	});
}

export function deleteSecret(
	domain: string,
	name: string,
): Effect.Effect<void, SecretStoreError> {
	return Effect.gen(function* () {
		const store = yield* SecretStore;
		yield* store.delete(domain, name);
	});
}
