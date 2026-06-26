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

export interface RatingsConfigShape {
	readonly masseyUrl: string;
	readonly apiKey: string;
	readonly dbPath: string;
	readonly interval: number;
}

export class RatingsConfig extends Context.Tag("RatingsConfig")<
	RatingsConfig,
	RatingsConfigShape
>() {}

export const RatingsConfigLive = Layer.effect(
	RatingsConfig,
	Effect.gen(function* () {
		const secrets = yield* SecretClient;
		const apiKey = yield* secrets.get(
			"bradley-ratings.messy-client",
			"api-key",
		);
		const dbPath = yield* secrets.get("bradley-ratings.db", "sqlite-path");
		return {
			masseyUrl: "https://api.masseyratings.com",
			apiKey,
			dbPath,
			interval: 3600000,
		};
	}),
);
