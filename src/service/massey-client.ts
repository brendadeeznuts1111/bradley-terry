import { Context, Effect, Layer, Schedule, Schema } from "effect";
import { envNumber } from "../env.js";
import { RatingsConfigTag } from "./config.js";
import { MasseyFetchError, SchemaDecodeError } from "./errors.js";
import { type MasseyData, MasseyDataSchema } from "./schemas.js";

export interface MasseyClientApi {
	readonly fetch: () => Effect.Effect<MasseyData, MasseyFetchError | SchemaDecodeError>;
}

export class MasseyClient extends Context.Tag("MasseyClient")<MasseyClient, MasseyClientApi>() {}

const parseTimeoutMs = (): number => envNumber("MASSEY_TIMEOUT_MS", 30_000);

const parseRetryAttempts = (): number => envNumber("MASSEY_RETRY_ATTEMPTS", 2);

const fetchWithTimeout = (url: string, headers: Record<string, string>, timeoutMs: number) =>
	Effect.tryPromise({
		try: () => {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			return globalThis
				.fetch(url, { headers, signal: controller.signal })
				.finally(() => clearTimeout(timer));
		},
		catch: (cause) => new MasseyFetchError({ cause, url }),
	});

export const MasseyClientLive = Layer.effect(
	MasseyClient,
	Effect.gen(function* () {
		const config = yield* RatingsConfigTag;
		const timeoutMs = parseTimeoutMs();
		const retryAttempts = parseRetryAttempts();

		const fetch = () =>
			Effect.gen(function* () {
				const token = config.masseyApiKey;
				const headers: Record<string, string> = {
					Accept: "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				};

				const response = yield* fetchWithTimeout(config.masseyUrl, headers, timeoutMs).pipe(
					Effect.retry({
						times: retryAttempts,
						schedule: Schedule.exponential("200 millis"),
						while: (error) => error._tag === "MasseyFetchError",
					}),
				);

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
