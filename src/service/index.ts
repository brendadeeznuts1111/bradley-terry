import { Layer } from "effect";
import { RatingsConfigLive } from "./config.js";
import { MasseyClientLive } from "./massey-client.js";
import { RatingsDBLive } from "./ratings-db.js";
import { BTComputeLive } from "./bt-compute.js";

export const AppLive = Layer.mergeAll(
  RatingsConfigLive,
  MasseyClientLive.pipe(Layer.provide(RatingsConfigLive)),
  RatingsDBLive.pipe(Layer.provide(RatingsConfigLive)),
  BTComputeLive
);

export * from "./config.js";
export * from "./errors.js";
export * from "./schemas.js";
export * from "./massey-client.js";
export * from "./ratings-db.js";
export * from "./bt-compute.js";
