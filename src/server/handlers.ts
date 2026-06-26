import { Effect, Schema } from "effect";
import {
	BTCompute,
	isServiceError,
	MasseyClient,
	RatingsDB,
	serviceErrorBody,
	serviceErrorStatus,
} from "../service/index.js";
import {
	BTRatingHistoryListSchema,
	BTRatingsSchema,
	ErrorResponseSchema,
	type HealthResponse,
	HealthResponseSchema,
	RefreshSummarySchema,
} from "../service/schemas.js";
import {
	allowedMethods,
	corsHeaders,
	jsonHeaders,
	methodNotAllowedResponse,
	optionsResponse,
	rateLimitResponse,
} from "./middleware.js";
import { getOpenApiYaml, openApiDocument } from "./openapi.js";
import { checkRateLimit, parseRateLimitConfig } from "./rate-limit.js";
import { clientIp, withRequestLog } from "./request-log.js";
import { getAppRuntime } from "./runtime.js";

const encodeJsonResponse = <A, I, R>(schema: Schema.Schema<A, I, R>, value: A, status = 200) =>
	Schema.encode(schema)(value).pipe(
		Effect.map(
			(encoded) =>
				new Response(JSON.stringify(encoded), {
					status,
					headers: jsonHeaders(),
				}),
		),
	);

const errorResponse = (error: unknown) =>
	Effect.gen(function* () {
		if (isServiceError(error)) {
			return yield* encodeJsonResponse(
				ErrorResponseSchema,
				serviceErrorBody(error),
				serviceErrorStatus(error),
			);
		}
		return yield* encodeJsonResponse(
			ErrorResponseSchema,
			{ error: "UnknownError", message: "Internal server error" },
			500,
		);
	});

const runHandler = <A, E, R>(
	effect: Effect.Effect<A, E, R>,
	encode: (value: A) => Effect.Effect<Response, never, never>,
) =>
	getAppRuntime().runPromise(
		effect.pipe(
			Effect.flatMap(encode),
			Effect.catchAll((error) => errorResponse(error)),
		),
	) as Promise<Response>;

export const handleHealth = () =>
	runHandler(
		Effect.gen(function* () {
			const db = yield* RatingsDB;
			const stats = yield* db.getStats().pipe(
				Effect.map((s) => ({
					db: "ok" as const,
					secretsBackend: process.env.SECRETS_BACKEND ?? "auto",
					lastUpdated: s.lastUpdated ?? undefined,
					teamCount: s.teamCount,
				})),
				Effect.catchAll(() =>
					Effect.succeed({
						db: "error" as const,
						secretsBackend: process.env.SECRETS_BACKEND ?? "auto",
					}),
				),
			);

			return {
				status: "ok" as const,
				version: Bun.version,
				timestamp: Date.now(),
				checks: stats,
			} satisfies HealthResponse;
		}),
		(body) => encodeJsonResponse(HealthResponseSchema, body),
	);

export const handleGetRatings = (sport?: string, season?: string) =>
	runHandler(
		Effect.gen(function* () {
			const db = yield* RatingsDB;
			return yield* db.getBT(sport, season);
		}),
		(ratings) => encodeJsonResponse(BTRatingsSchema, [...ratings]),
	);

export const handleGetHistory = (sport?: string, season?: string) =>
	runHandler(
		Effect.gen(function* () {
			const db = yield* RatingsDB;
			return yield* db.getHistory(sport, season);
		}),
		(history) => encodeJsonResponse(BTRatingHistoryListSchema, [...history]),
	);

export const handleRefresh = () =>
	runHandler(
		Effect.gen(function* () {
			const massey = yield* MasseyClient;
			const compute = yield* BTCompute;
			const db = yield* RatingsDB;

			const data = yield* massey.fetch();
			yield* db.storeMassey(data);
			const ratings = yield* compute.compute(data);
			yield* db.storeBT(ratings, data.sport, data.season);

			return {
				stored: ratings.length,
				sport: data.sport ?? "default",
				season: data.season ?? "default",
			};
		}),
		(summary) => encodeJsonResponse(RefreshSummarySchema, summary, 202),
	);

export const handleRequest = (req: Request): Promise<Response> =>
	withRequestLog(req, () => dispatchRequest(req));

const dispatchRequest = (req: Request): Promise<Response> => {
	if (req.method === "OPTIONS") {
		return Promise.resolve(optionsResponse());
	}

	const url = new URL(req.url);
	const sport = url.searchParams.get("sport") ?? undefined;
	const season = url.searchParams.get("season") ?? undefined;
	const methods = allowedMethods(url.pathname);

	if (methods && !methods.includes(req.method)) {
		return Promise.resolve(methodNotAllowedResponse(methods));
	}

	if (req.method === "GET" && url.pathname === "/health") {
		return handleHealth();
	}
	if (req.method === "GET" && url.pathname === "/openapi.json") {
		return Promise.resolve(
			new Response(JSON.stringify(openApiDocument), { status: 200, headers: jsonHeaders() }),
		);
	}
	if (req.method === "GET" && url.pathname === "/openapi.yaml") {
		return getOpenApiYaml().then(
			(yaml) =>
				new Response(yaml, {
					status: 200,
					headers: { "Content-Type": "application/yaml", ...corsHeaders() },
				}),
		);
	}
	if (req.method === "GET" && url.pathname === "/api/ratings/bt") {
		return handleGetRatings(sport, season);
	}
	if (req.method === "GET" && url.pathname === "/api/ratings/history") {
		return handleGetHistory(sport, season);
	}
	if (req.method === "POST" && url.pathname === "/api/ratings/refresh") {
		const rateLimit = parseRateLimitConfig();
		if (rateLimit) {
			const result = checkRateLimit(`refresh:${clientIp(req)}`, rateLimit);
			if (!result.allowed) {
				return Promise.resolve(rateLimitResponse(result.retryAfterSeconds));
			}
		}
		return handleRefresh();
	}

	return getAppRuntime().runPromise(
		encodeJsonResponse(ErrorResponseSchema, { error: "NotFound", message: "Route not found" }, 404),
	);
};
