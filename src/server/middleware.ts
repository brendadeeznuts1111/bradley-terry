export const ROUTE_METHODS: Readonly<Record<string, readonly string[]>> = {
	"/health": ["GET"],
	"/ready": ["GET"],
	"/metrics": ["GET"],
	"/openapi.json": ["GET"],
	"/openapi.yaml": ["GET"],
	"/api/ratings/bt": ["GET"],
	"/api/ratings/history": ["GET"],
	"/api/ratings/refresh": ["POST"],
};

export const corsHeaders = (): Record<string, string> => ({
	"Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
});

export const jsonHeaders = (): Record<string, string> => ({
	"Content-Type": "application/json",
	...corsHeaders(),
});

export const allowedMethods = (pathname: string): readonly string[] | undefined =>
	ROUTE_METHODS[pathname];

export const methodNotAllowedResponse = (allowed: readonly string[]) =>
	new Response(
		JSON.stringify({
			error: "MethodNotAllowed",
			message: `Allowed methods: ${allowed.join(", ")}`,
		}),
		{ status: 405, headers: { ...jsonHeaders(), Allow: allowed.join(", ") } },
	);

export const optionsResponse = () => new Response(null, { status: 204, headers: corsHeaders() });

export const rateLimitResponse = (retryAfterSeconds: number) =>
	new Response(
		JSON.stringify({
			error: "RateLimitExceeded",
			message: `Too many refresh requests. Retry after ${retryAfterSeconds}s.`,
		}),
		{
			status: 429,
			headers: {
				...jsonHeaders(),
				"Retry-After": String(retryAfterSeconds),
			},
		},
	);

export const conflictResponse = () =>
	new Response(
		JSON.stringify({
			error: "RefreshInProgress",
			message: "A ratings refresh is already in progress",
		}),
		{ status: 409, headers: jsonHeaders() },
	);

export const unauthorizedResponse = () =>
	new Response(
		JSON.stringify({
			error: "Unauthorized",
			message: "Valid REFRESH_TOKEN required (Bearer or X-Refresh-Token header)",
		}),
		{ status: 401, headers: jsonHeaders() },
	);
