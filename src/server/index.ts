import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Effect } from "effect";
import { ConfigLive, RatingsConfigTag } from "../service/config.js";
import { handleRefresh, handleRequest } from "./handlers.js";
import { disposeAppRuntime } from "./runtime.js";
import { startRefreshScheduler } from "./scheduler.js";

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

const stopScheduler = startRefreshScheduler(config.interval, () => handleRefresh());

const shutdown = async (signal: string) => {
	console.log(`\n${signal} received — shutting down`);
	stopScheduler();
	server.stop();
	await disposeAppRuntime();
	process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log(`Bradley-Terry ratings service listening on http://localhost:${server.port}`);
if (config.interval > 0) {
	console.log(`Auto-refresh scheduled every ${config.interval}s (REFRESH_INTERVAL)`);
}
