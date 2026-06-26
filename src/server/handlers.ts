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
	type HealthChecks,
	LivenessResponseSchema,
	ReadinessResponseSchema,
	RefreshSummarySchema,
} from "../service/schemas.js";
import { incrementMetric, renderMetrics } from "./metrics.js";
import {
	allowedMethods,
	conflictResponse,
	corsHeaders,
	jsonHeaders,
	methodNotAllowedResponse,
	optionsResponse,
	rateLimitResponse,
	unauthorizedResponse,
} from "./middleware.js";
import { getOpenApiYaml, openApiDocument } from "./openapi.js";
import { checkRateLimit, parseRateLimitConfig } from "./rate-limit.js";
import { isRefreshAuthorized } from "./refresh-auth.js";
import { releaseRefreshLock, tryAcquireRefreshLock } from "./refresh-lock.js";
import { clientIp, withRequestLog } from "./request-log.js";
import { getAppRuntime } from "./runtime.js";
import { trackInFlight } from "./shutdown.js";
import { APP_VERSION, GIT_COMMIT, RUNTIME_VERSION } from "./version.js";

const encodeJsonResponse = <A, I, R>(
	schema: Schema.Schema<A, I, R>,
	value: A,
	status = 200,
	extraHeaders?: Record<string, string>,
) =>
	Schema.encode(schema)(value).pipe(
		Effect.map(
			(encoded) =>
				new Response(JSON.stringify(encoded), {
					status,
					headers: { ...jsonHeaders(), ...extraHeaders },
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

const collectHealthChecks = Effect.gen(function* () {
	const db = yield* RatingsDB;
	return yield* db.getStats().pipe(
		Effect.map(
			(s) =>
				({
					db: "ok" as const,
					secretsBackend: process.env.SECRETS_BACKEND ?? "auto",
					lastUpdated: s.lastUpdated ?? undefined,
					teamCount: s.teamCount,
				}) satisfies HealthChecks,
		),
		Effect.catchAll(() =>
			Effect.succeed({
				db: "error" as const,
				secretsBackend: process.env.SECRETS_BACKEND ?? "auto",
			} satisfies HealthChecks),
		),
	);
});

export const handleHealth = () =>
	runHandler(
		Effect.succeed({
			status: "ok" as const,
			appVersion: APP_VERSION,
			runtimeVersion: RUNTIME_VERSION,
			commit: GIT_COMMIT,
			timestamp: Date.now(),
		}),
		(body) => encodeJsonResponse(LivenessResponseSchema, body),
	);

export const handleReady = () =>
	runHandler(
		Effect.gen(function* () {
			const checks = yield* collectHealthChecks;
			const ready = checks.db === "ok";
			return {
				body: {
					status: ready ? ("ready" as const) : ("not_ready" as const),
					checks,
					timestamp: Date.now(),
				},
				status: ready ? 200 : 503,
			};
		}),
		({ body, status }) => encodeJsonResponse(ReadinessResponseSchema, body, status),
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

const refreshEffect = Effect.gen(function* () {
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
});

export const handleRefresh = (): Promise<Response> => {
	if (!tryAcquireRefreshLock()) {
		incrementMetric("refresh_conflict_total");
		return Promise.resolve(conflictResponse());
	}

	return runHandler(refreshEffect, (summary) =>
		encodeJsonResponse(RefreshSummarySchema, summary, 202),
	)
		.then((res) => {
			if (res.status === 202) incrementMetric("refresh_success_total");
			else incrementMetric("refresh_failure_total");
			return res;
		})
		.catch((err) => {
			incrementMetric("refresh_failure_total");
			throw err;
		})
		.finally(() => releaseRefreshLock());
};

export const handleRequest = (req: Request): Promise<Response> =>
	trackInFlight(() =>
		withRequestLog(req, () => {
			incrementMetric("http_requests_total");
			return dispatchRequest(req);
		}),
	);

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
	if (req.method === "GET" && url.pathname === "/ready") {
		return handleReady();
	}
	if (req.method === "GET" && url.pathname === "/metrics") {
		return Promise.resolve(
			new Response(renderMetrics(), {
				status: 200,
				headers: { "Content-Type": "text/plain; version=0.0.4", ...corsHeaders() },
			}),
		);
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
		if (!isRefreshAuthorized(req)) {
			return Promise.resolve(unauthorizedResponse());
		}
		const rateLimit = parseRateLimitConfig();
		if (rateLimit) {
			const result = checkRateLimit(`refresh:${clientIp(req)}`, rateLimit);
			if (!result.allowed) {
				incrementMetric("rate_limit_hits_total");
				return Promise.resolve(rateLimitResponse(result.retryAfterSeconds));
			}
		}
		return handleRefresh();
	}

	return getAppRuntime().runPromise(
		encodeJsonResponse(ErrorResponseSchema, { error: "NotFound", message: "Route not found" }, 404),
	);
};
