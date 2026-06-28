import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Effect } from "effect";
import { envNumber } from "../env.js";
import { ConfigLive, RatingsConfigTag } from "../service/config.js";
import { handleRefresh, handleRequest } from "./handlers.js";
import { isRefreshInFlight } from "./refresh-lock.js";
import { disposeAppRuntime } from "./runtime.js";
import { startRefreshScheduler } from "./scheduler.js";
import { waitForInFlight } from "./shutdown.js";
import { APP_VERSION, GIT_COMMIT } from "./version.js";

const config = Effect.runSync(
	Effect.gen(function* () {
		return yield* RatingsConfigTag;
	}).pipe(Effect.provide(ConfigLive)),
);

mkdirSync(dirname(config.dbPath), { recursive: true });

const server = Bun.serve({
	hostname: "0.0.0.0",
	port: config.port,
	fetch(req: Request, srv: { port: number; hostname: string }) {
		return handleRequest(req, srv);
	},
});

const stopScheduler = startRefreshScheduler(config.interval, () => {
	if (isRefreshInFlight()) {
		console.warn("[scheduler] refresh skipped: already in progress");
		return Promise.resolve();
	}
	return handleRefresh();
});

const shutdown = async (signal: string) => {
	console.log(`\n${signal} received — shutting down`);
	stopScheduler();
	await server.stop();

	const drained = await waitForInFlight(envNumber("SHUTDOWN_TIMEOUT_MS", 10_000));
	if (!drained) {
		console.warn(`[shutdown] ${signal}: timed out waiting for in-flight requests`);
	}

	await disposeAppRuntime();
	process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log(`Bradley-Terry v${APP_VERSION} (${GIT_COMMIT}) listening on ${server.url}`);
if (config.interval > 0) {
	console.log(`Auto-refresh scheduled every ${config.interval}s (REFRESH_INTERVAL)`);
}
