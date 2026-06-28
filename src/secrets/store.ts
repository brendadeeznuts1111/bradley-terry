/**
 * TTL-aware secret store helpers.
 *
 * These sit on top of `SecretClient` conceptually, but the default
 * `InMemorySecretStoreLive` is a test-only, in-memory cache. It is useful for
 * deterministic TTL tests with `setSystemTime` because `Date.now()` is
 * controlled by the test runner.
 */
import { Context, Data, Effect, Layer } from "effect";

export interface SecretStoreEntry {
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
		) => Effect.Effect<SecretStoreEntry | null, SecretStoreError>;
		readonly set: (
			domain: string,
			name: string,
			entry: SecretStoreEntry,
		) => Effect.Effect<void, SecretStoreError>;
		readonly delete: (domain: string, name: string) => Effect.Effect<void, SecretStoreError>;
	}
>() {}

// In-memory store for testing (setSystemTime-safe)
const inMemorySecretStore = new Map<string, SecretStoreEntry>();

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
	set: (_domain: string, _name: string, entry: SecretStoreEntry) =>
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

export function setSecret(
	domain: string,
	name: string,
	value: string,
	ttlSeconds?: number,
): Effect.Effect<void, SecretStoreError, SecretStore> {
	return Effect.gen(function* () {
		const store = yield* SecretStore;
		const entry: SecretStoreEntry = {
			value,
			...(ttlSeconds ? { expiresAt: Date.now() + ttlSeconds * 1000 } : {}),
		};
		yield* store.set(domain, name, entry);
	});
}

export function getSecret(
	domain: string,
	name: string,
): Effect.Effect<string | null, SecretStoreError, SecretStore> {
	return Effect.gen(function* () {
		const store = yield* SecretStore;
		const entry = yield* store.get(domain, name);
		if (!entry) return null;
		return entry.value;
	});
}

export function deleteSecret(domain: string, name: string): Effect.Effect<void, SecretStoreError, SecretStore> {
	return Effect.gen(function* () {
		const store = yield* SecretStore;
		yield* store.delete(domain, name);
	});
}
