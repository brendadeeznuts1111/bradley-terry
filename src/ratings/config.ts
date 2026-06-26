/**
 * RatingsConfig — Effect layer for application configuration.
 *
 * Reads secrets from the channel-agnostic SecretClient, so the same
 * configuration layer works in local dev (Bun.secrets), CI (env vars),
 * and production (Vault/Secrets Manager) without changing the call sites.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  LAYER 0: CONFIGURATION (RatingsConfig)                          │
 * │  ┌─────────────────────────────────────────────────────────┐    │
 * │  │  SecretClient.get(service, name)                         │    │
 * │  │  ─────────────────────────────────────────────────────  │    │
 * │  │  Channel: OS IPC / HTTPS / env                         │    │
 * │  │  Isolation: Data namespace (service + name)            │    │
 * │  └─────────────────────────────────────────────────────────┘    │
 * │         ↓ SecretClient returns plaintext to Effect.gen           │
 * └─────────────────────────────────────────────────────────────────┘
 */
import { Context, Effect, Layer } from "effect";
import { SecretClient } from "../secrets";

export const NAMESPACE = {
	ratings: {
		massey: "com.bradley-terry.ratings.massey",
		db: "com.bradley-terry.ratings.db",
	},
} as const;

export interface RatingsConfigShape {
	readonly masseyUrl: string;
	readonly apiKey: string;
	readonly dbPath: string;
	readonly dbPassphrase: string;
	readonly interval: number;
	readonly port: number;
}

export class RatingsConfig extends Context.Tag("RatingsConfig")<
	RatingsConfig,
	RatingsConfigShape
>() {}

export const RatingsConfigLive = Layer.effect(
	RatingsConfig,
	Effect.gen(function* () {
		const secrets = yield* SecretClient;
		const apiKey = yield* secrets.get(NAMESPACE.ratings.massey, "api-key");
		const dbPath = yield* secrets.get(NAMESPACE.ratings.db, "sqlite-path");
		const dbPassphrase = yield* secrets.get(
			NAMESPACE.ratings.db,
			"encryption-passphrase",
		);
		return {
			masseyUrl: "https://masseyratings.com/api",
			apiKey,
			dbPath,
			dbPassphrase,
			interval: 3600000, // 1 hour
			port: 3000,
		};
	}),
);
