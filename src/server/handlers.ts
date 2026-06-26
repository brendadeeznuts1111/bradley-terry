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
import { getAppRuntime } from "./runtime.js";

const encodeJsonResponse = <A, I, R>(schema: Schema.Schema<A, I, R>, value: A, status = 200) =>
  Schema.encode(schema)(value).pipe(
    Effect.map(
      (encoded) =>
        new Response(JSON.stringify(encoded), {
          status,
          headers: { "Content-Type": "application/json" },
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
    Effect.sync(
      (): HealthResponse => ({
        status: "ok",
        version: Bun.version,
        timestamp: Date.now(),
      }),
    ),
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

export const handleRequest = (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const sport = url.searchParams.get("sport") ?? undefined;
  const season = url.searchParams.get("season") ?? undefined;

  if (req.method === "GET" && url.pathname === "/health") {
    return handleHealth();
  }
  if (req.method === "GET" && url.pathname === "/api/ratings/bt") {
    return handleGetRatings(sport, season);
  }
  if (req.method === "GET" && url.pathname === "/api/ratings/history") {
    return handleGetHistory(sport, season);
  }
  if (req.method === "POST" && url.pathname === "/api/ratings/refresh") {
    return handleRefresh();
  }

  return getAppRuntime().runPromise(
    encodeJsonResponse(ErrorResponseSchema, { error: "NotFound", message: "Route not found" }, 404),
  );
};
