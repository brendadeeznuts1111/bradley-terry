/**
 * SecretClient — namespace-based, channel-agnostic secret access.
 *
 * The service contract exposes `get`, `set`, and `delete` against a
 * `(namespace, name)` pair. Different backends implement the same contract:
 *
 * | Environment | Backend            | `get` implementation          | `set`/`delete`    |
 * | ----------- | ------------------ | ----------------------------- | ----------------- |
 * | Local dev   | `Bun.secrets`      | OS keychain IPC               | Same              |
 * | CI/CD       | `Bun.env` fallback | `process.env[NAMESPACE_NAME]` | No-op (read-only) |
 * | Production  | Vault/AWS SM       | HTTPS API call                | HTTPS API call    |
 */
import { Context, Data, Effect, Layer } from "effect";

export class SecretError extends Data.TaggedError("SecretError")<{
	readonly cause: unknown;
	readonly namespace: string;
	readonly name: string;
}> {}

export class SecretClient extends Context.Tag("SecretClient")<
	SecretClient,
	{
		readonly get: (
			namespace: string,
			name: string,
		) => Effect.Effect<string, SecretError>;
		readonly set: (
			namespace: string,
			name: string,
			value: string,
		) => Effect.Effect<void, SecretError>;
		readonly delete: (
			namespace: string,
			name: string,
		) => Effect.Effect<boolean, SecretError>;
	}
>() {}

export const BunSecretsLive = Layer.effect(
	SecretClient,
	Effect.sync(() => ({
		get: (namespace, name) =>
			Effect.tryPromise({
				try: async () => {
					const value = await Bun.secrets?.get({ service: namespace, name });
					if (value === null) {
						throw new Error(`Secret not found: ${namespace}:${name}`);
					}
					return value;
				},
				catch: (cause) => new SecretError({ cause, namespace, name }),
			}),
		set: (namespace, name, value) =>
			Effect.tryPromise({
				try: () =>
					Bun.secrets?.set({ service: namespace, name }, value) ??
					Promise.reject(new Error("Bun.secrets unavailable")),
				catch: (cause) => new SecretError({ cause, namespace, name }),
			}),
		delete: (namespace, name) =>
			Effect.tryPromise({
				try: () =>
					Bun.secrets?.delete({ service: namespace, name }) ??
					Promise.reject(new Error("Bun.secrets unavailable")),
				catch: (cause) => new SecretError({ cause, namespace, name }),
			}),
	})),
);

export const EnvSecretsLive = Layer.succeed(SecretClient, {
	get: (namespace, name) =>
		Effect.gen(function* () {
			const key = `${namespace.toUpperCase().replace(/-/g, "_")}_${name
				.toUpperCase()
				.replace(/-/g, "_")}`;
			const value = Bun.env[key];
			if (!value) {
				return yield* Effect.fail(
					new SecretError({
						namespace,
						name,
						cause: `Missing env var ${key}`,
					}),
				);
			}
			return value;
		}),
	set: (_namespace, _name, _value) =>
		Effect.fail(
			new SecretError({
				namespace: _namespace,
				name: _name,
				cause: "EnvSecretsLive is read-only",
			}),
		),
	delete: (_namespace, _name) =>
		Effect.fail(
			new SecretError({
				namespace: _namespace,
				name: _name,
				cause: "EnvSecretsLive is read-only",
			}),
		),
});

export const VaultSecretsLive = Layer.succeed(SecretClient, {
	get: (_namespace, _name) =>
		Effect.fail(
			new SecretError({
				namespace: _namespace,
				name: _name,
				cause: "VaultSecretsLive is a stub — provide real fetch implementation",
			}),
		),
	set: (_namespace, _name, _value) =>
		Effect.fail(
			new SecretError({
				namespace: _namespace,
				name: _name,
				cause: "VaultSecretsLive is a stub — provide real fetch implementation",
			}),
		),
	delete: (_namespace, _name) =>
		Effect.fail(
			new SecretError({
				namespace: _namespace,
				name: _name,
				cause: "VaultSecretsLive is a stub — provide real fetch implementation",
			}),
		),
});
