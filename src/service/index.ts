import { Layer } from "effect";
import { BTComputeLive } from "./bt-compute.js";
import { ConfigLive } from "./config.js";
import { MasseyClientLive } from "./massey-client.js";
import { RatingsDBLive } from "./ratings-db.js";

export const AppLive = Layer.mergeAll(
	ConfigLive,
	MasseyClientLive.pipe(Layer.provide(ConfigLive)),
	RatingsDBLive.pipe(Layer.provide(ConfigLive)),
	BTComputeLive,
);

export * from "../secrets/index.js";
export * from "./bt-compute.js";
export * from "./config.js";
export * from "./errors.js";
export * from "./massey-client.js";
export * from "./ratings-db.js";
export * from "./schemas.js";
