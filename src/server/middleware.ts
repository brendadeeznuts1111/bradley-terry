export const ROUTE_METHODS: Readonly<Record<string, readonly string[]>> = {
	"/health": ["GET"],
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
