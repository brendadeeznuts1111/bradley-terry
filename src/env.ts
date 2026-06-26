/** Bun-native env access (`Bun.env` ≡ `process.env`). See https://bun.com/docs/runtime/environment-variables */
export const env = Bun.env;

export const envString = (key: string, fallback?: string): string | undefined => {
	const value = env[key]?.trim();
	if (value) return value;
	return fallback;
};

export const envNumber = (key: string, fallback: number): number => {
	const raw = env[key];
	if (raw === undefined || raw === "") return fallback;
	const value = Number(raw);
	return Number.isFinite(value) ? value : fallback;
};

export const envFlag = (key: string, defaultEnabled = true): boolean => {
	const value = env[key];
	if (value === undefined || value === "") return defaultEnabled;
	return value !== "0" && value.toLowerCase() !== "false";
};
