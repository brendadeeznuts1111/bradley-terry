export type ServerMetrics = {
	readonly pendingRequests: number;
	readonly pendingWebSockets: number;
};

type CounterKey =
	| "http_requests_total"
	| "refresh_success_total"
	| "refresh_failure_total"
	| "rate_limit_hits_total"
	| "refresh_conflict_total";

const counters: Record<CounterKey, number> = {
	http_requests_total: 0,
	refresh_success_total: 0,
	refresh_failure_total: 0,
	rate_limit_hits_total: 0,
	refresh_conflict_total: 0,
};

let serverMetrics: ServerMetrics | undefined;

/** Bind Bun.serve built-in counters — https://bun.com/docs/runtime/http/metrics */
export const bindServerMetrics = (server: ServerMetrics): void => {
	serverMetrics = server;
};

export const incrementMetric = (key: CounterKey, by = 1): void => {
	counters[key] += by;
};

export const renderMetrics = (): string => {
	const lines = [
		"# HELP bradley_terry_http_requests_total Total HTTP requests handled",
		"# TYPE bradley_terry_http_requests_total counter",
		`bradley_terry_http_requests_total ${counters.http_requests_total}`,
		"# HELP bradley_terry_http_pending_requests Active in-flight HTTP requests (Bun.serve)",
		"# TYPE bradley_terry_http_pending_requests gauge",
		`bradley_terry_http_pending_requests ${serverMetrics?.pendingRequests ?? 0}`,
		"# HELP bradley_terry_websocket_pending Active WebSocket connections (Bun.serve)",
		"# TYPE bradley_terry_websocket_pending gauge",
		`bradley_terry_websocket_pending ${serverMetrics?.pendingWebSockets ?? 0}`,
		"# HELP bradley_terry_refresh_success_total Successful rating refreshes",
		"# TYPE bradley_terry_refresh_success_total counter",
		`bradley_terry_refresh_success_total ${counters.refresh_success_total}`,
		"# HELP bradley_terry_refresh_failure_total Failed rating refreshes",
		"# TYPE bradley_terry_refresh_failure_total counter",
		`bradley_terry_refresh_failure_total ${counters.refresh_failure_total}`,
		"# HELP bradley_terry_rate_limit_hits_total Refresh rate limit rejections",
		"# TYPE bradley_terry_rate_limit_hits_total counter",
		`bradley_terry_rate_limit_hits_total ${counters.rate_limit_hits_total}`,
		"# HELP bradley_terry_refresh_conflict_total Refresh rejected due to in-flight lock",
		"# TYPE bradley_terry_refresh_conflict_total counter",
		`bradley_terry_refresh_conflict_total ${counters.refresh_conflict_total}`,
	];
	return `${lines.join("\n")}\n`;
};

/** Test helper */
export const resetMetrics = (): void => {
	for (const key of Object.keys(counters) as CounterKey[]) {
		counters[key] = 0;
	}
	serverMetrics = undefined;
};
