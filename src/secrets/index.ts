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
