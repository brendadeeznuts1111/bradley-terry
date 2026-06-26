export type RequestLogEntry = {
	readonly ts: string;
	readonly method: string;
	readonly path: string;
	readonly status: number;
	readonly durationMs: number;
	readonly clientIp: string;
};

export const isRequestLogEnabled = (): boolean => {
	const value = process.env.REQUEST_LOG;
	if (value === undefined || value === "") return true;
	return value !== "0" && value.toLowerCase() !== "false";
};

export const clientIp = (req: Request): string => {
	const forwarded = req.headers.get("x-forwarded-for");
	if (forwarded) {
		const first = forwarded.split(",")[0]?.trim();
		if (first) return first;
	}
	const realIp = req.headers.get("x-real-ip")?.trim();
	if (realIp) return realIp;
	return "unknown";
};

export const formatRequestLog = (entry: RequestLogEntry): string => JSON.stringify(entry);

export const logRequest = (entry: RequestLogEntry): void => {
	if (isRequestLogEnabled()) {
		console.log(formatRequestLog(entry));
	}
};

export const withRequestLog = async (
	req: Request,
	handler: () => Promise<Response>,
): Promise<Response> => {
	const url = new URL(req.url);
	const started = performance.now();
	const res = await handler();
	const durationMs = Math.round((performance.now() - started) * 100) / 100;

	logRequest({
		ts: new Date().toISOString(),
		method: req.method,
		path: url.pathname,
		status: res.status,
		durationMs,
		clientIp: clientIp(req),
	});

	return res;
};
