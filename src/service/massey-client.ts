import { Context, Effect, Layer, Schema } from "effect";
import { RatingsConfigTag } from "./config.js";
import { MasseyFetchError, SchemaDecodeError } from "./errors.js";
import { type MasseyData, MasseyDataSchema } from "./schemas.js";

export interface MasseyClientApi {
	readonly fetch: () => Effect.Effect<MasseyData, MasseyFetchError | SchemaDecodeError>;
}

export class MasseyClient extends Context.Tag("MasseyClient")<MasseyClient, MasseyClientApi>() {}

export const MasseyClientLive = Layer.effect(
	MasseyClient,
	Effect.gen(function* () {
		const config = yield* RatingsConfigTag;

		const fetch = () =>
			Effect.gen(function* () {
				const token = config.masseyApiKey;

				const response = yield* Effect.tryPromise({
					try: () =>
						globalThis.fetch(config.masseyUrl, {
							headers: {
								Accept: "application/json",
								...(token ? { Authorization: `Bearer ${token}` } : {}),
							},
						}),
					catch: (cause) => new MasseyFetchError({ cause, url: config.masseyUrl }),
				});

				if (!response.ok) {
					return yield* Effect.fail(
						new MasseyFetchError({
							cause: new Error(`HTTP ${response.status}`),
							url: config.masseyUrl,
						}),
					);
				}

				const json = yield* Effect.tryPromise({
					try: () => response.json(),
					catch: (cause) => new MasseyFetchError({ cause, url: config.masseyUrl }),
				});

				return yield* Schema.decodeUnknown(MasseyDataSchema)(json).pipe(
					Effect.mapError((cause) => new SchemaDecodeError({ cause, input: json })),
				);
			});

		return { fetch } satisfies MasseyClientApi;
	}),
);
