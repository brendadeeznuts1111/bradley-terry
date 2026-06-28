import { Context, Effect, Layer } from "effect";
import {
	DB_NAMESPACE,
	DB_SECRET_NAME,
	MASSEY_NAMESPACE,
	MASSEY_SECRET_NAME,
	resolveSecretClientLive,
	SecretClient,
} from "../secrets/index.js";

export interface RatingsConfig {
	readonly masseyUrl: string;
	readonly dbPath: string;
	readonly interval: number;
	readonly port: number;
	/** Resolved at bootstrap via SecretClient (channel-agnostic) */
	readonly masseyApiKey: string | null;
	/** Optional sqlite encryption passphrase from isolated DB namespace */
	readonly dbEncryptionKey: string | null;
}

export class RatingsConfigTag extends Context.Tag("RatingsConfig")<
	RatingsConfigTag,
	RatingsConfig
>() {}

export const RatingsConfigLive = Layer.effect(
	RatingsConfigTag,
	Effect.gen(function* () {
		const secrets = yield* SecretClient;

		const masseyApiKey = yield* secrets
			.get(MASSEY_NAMESPACE, MASSEY_SECRET_NAME)
			.pipe(Effect.catchTag("SecretError", () => Effect.succeed(null)));

		const dbEncryptionKey = yield* secrets
			.get(DB_NAMESPACE, DB_SECRET_NAME)
			.pipe(Effect.catchTag("SecretError", () => Effect.succeed(null)));

		return {
			masseyUrl: process.env["MASSEY_URL"] ?? "https://masseyratings.com/data/json",
			dbPath: process.env["DB_PATH"] ?? "./data/ratings.db",
			interval: Number(process.env["REFRESH_INTERVAL"] ?? "3600"),
			port: Number(process.env["PORT"] ?? "3000"),
			masseyApiKey,
			dbEncryptionKey,
		} satisfies RatingsConfig;
	}),
);

export const ConfigLive = Layer.provide(RatingsConfigLive, resolveSecretClientLive());
