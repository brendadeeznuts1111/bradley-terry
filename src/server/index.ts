import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Effect } from "effect";
import { ConfigLive, RatingsConfigTag } from "../service/config.js";
import { handleRequest } from "./handlers.js";

const config = Effect.runSync(
  Effect.gen(function* () {
    return yield* RatingsConfigTag;
  }).pipe(Effect.provide(ConfigLive)),
);

mkdirSync(dirname(config.dbPath), { recursive: true });

const server = Bun.serve({
  port: config.port,
  fetch: handleRequest,
});

console.log(`Bradley-Terry ratings service listening on http://localhost:${server.port}`);
