import { envString } from "../env.js";

/** Returns configured bearer token for POST /api/ratings/refresh, or null when auth is disabled. */
export const parseRefreshToken = (): string | null => envString("REFRESH_TOKEN") ?? null;

export const isRefreshAuthorized = (req: Request): boolean => {
	const expected = parseRefreshToken();
	if (!expected) return true;

	const auth = req.headers.get("authorization");
	if (auth?.startsWith("Bearer ")) {
		return auth.slice("Bearer ".length) === expected;
	}

	return req.headers.get("x-refresh-token") === expected;
};
