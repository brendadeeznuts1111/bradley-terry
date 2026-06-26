import { envNumber } from "../env.js";

export type RateLimitConfig = {
	readonly limit: number;
	readonly windowMs: number;
};

export type RateLimitResult = {
	readonly allowed: boolean;
	readonly retryAfterSeconds: number;
	readonly remaining: number;
};

type Bucket = {
	timestamps: number[];
};

const buckets = new Map<string, Bucket>();

export const parseRateLimitConfig = (): RateLimitConfig | null => {
	const limit = envNumber("REFRESH_RATE_LIMIT", 5);
	const windowSeconds = envNumber("REFRESH_RATE_WINDOW", 60);

	if (!Number.isFinite(limit) || limit <= 0) return null;
	if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) return null;

	return { limit, windowMs: windowSeconds * 1000 };
};

export const checkRateLimit = (
	key: string,
	config: RateLimitConfig,
	now = Date.now(),
): RateLimitResult => {
	const bucket = buckets.get(key) ?? { timestamps: [] };
	const windowStart = now - config.windowMs;
	const recent = bucket.timestamps.filter((ts) => ts > windowStart);

	if (recent.length >= config.limit) {
		const oldest = recent[0] ?? now;
		const retryAfterMs = Math.max(0, oldest + config.windowMs - now);
		buckets.set(key, { timestamps: recent });
		return {
			allowed: false,
			retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
			remaining: 0,
		};
	}

	recent.push(now);
	buckets.set(key, { timestamps: recent });

	return {
		allowed: true,
		retryAfterSeconds: 0,
		remaining: Math.max(0, config.limit - recent.length),
	};
};

/** Test helper — clears in-memory rate limit state. */
export const resetRateLimits = (): void => {
	buckets.clear();
};
