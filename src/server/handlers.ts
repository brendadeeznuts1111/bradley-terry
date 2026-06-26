import { Effect } from "effect";
import {
  AppLive,
  BTCompute,
  MasseyClient,
  RatingsDB,
  type ServiceError,
} from "../service/index.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const errorStatus = (error: ServiceError): number => {
  if (error._tag === "MasseyFetchError") return 502;
  if (error._tag === "DBError") return 500;
  if (error._tag === "BTComputationError") return 422;
  if (error._tag === "SchemaDecodeError") return 400;
  return 500;
};

const runHandler = <A, E>(effect: Effect.Effect<A, E>, onSuccess: (a: A) => Response) =>
  Effect.runPromise(
    effect.pipe(
      Effect.map(onSuccess),
      Effect.catchAll((e) =>
        Effect.succeed(
          json(
            { error: (e as { _tag: string })._tag, message: String(e) },
            errorStatus(e as ServiceError)
          )
        )
      )
    )
  ) as Promise<Response>;

export const handleHealth = () =>
  runHandler(
    Effect.sync(() => ({
      status: "ok" as const,
      version: Bun.version,
      timestamp: Date.now(),
    })),
    (body) => json(body)
  );

export const handleGetRatings = (sport?: string, season?: string) =>
  runHandler(
    Effect.gen(function* () {
      const db = yield* RatingsDB;
      return yield* db.getBT(sport, season);
    }).pipe(Effect.provide(AppLive)),
    (ratings) => json(ratings)
  );

export const handleGetHistory = (sport?: string, season?: string) =>
  runHandler(
    Effect.gen(function* () {
      const db = yield* RatingsDB;
      return yield* db.getHistory(sport, season);
    }).pipe(Effect.provide(AppLive)),
    (ratings) => json(ratings)
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
    }).pipe(Effect.provide(AppLive)),
    (summary) => json(summary, 202)
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

  return Promise.resolve(json({ error: "Not Found" }, 404));
};
