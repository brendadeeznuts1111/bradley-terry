import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { RatingsConfigLive, RatingsConfigTag } from "../service/config.js";
import { Effect } from "effect";
import { handleRequest } from "./handlers.js";

const config = Effect.runSync(
  Effect.gen(function* () {
    return yield* RatingsConfigTag;
  }).pipe(Effect.provide(RatingsConfigLive))
);

mkdirSync(dirname(config.dbPath), { recursive: true });

const server = Bun.serve({
  port: config.port,
  fetch: handleRequest,
});

console.log(
  `Bradley-Terry ratings service listening on http://localhost:${server.port}`
);
