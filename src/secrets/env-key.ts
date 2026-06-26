import {
	DB_NAMESPACE,
	DB_SECRET_NAME,
	MASSEY_NAMESPACE,
	MASSEY_SECRET_NAME,
} from "./namespaces.js";

const KNOWN_ENV_ALIASES: Record<string, string> = {
	[`${MASSEY_NAMESPACE}/${MASSEY_SECRET_NAME}`]: "MASSEY_API_TOKEN",
	[`${DB_NAMESPACE}/${DB_SECRET_NAME}`]: "DB_ENCRYPTION_KEY",
};

/** PR #2 style: `SECRETCLIENT_TEST_API_KEY` */
export const envVarName = (namespace: string, name: string): string =>
	`${namespace.toUpperCase().replace(/-/g, "_")}_${name.toUpperCase().replace(/-/g, "_")}`;

/** Explicit prefix style: `SECRET_COM_BRADLEY_TERRY_MASSEY_API_TOKEN` */
export const secretEnvVarName = (namespace: string, name: string): string =>
	`SECRET_${namespace.replace(/[.-]/g, "_").toUpperCase()}_${name.replace(/-/g, "_").toUpperCase()}`;

export const lookupEnv = (namespace: string, name: string): string | undefined => {
	const key = `${namespace}/${name}`;
	const alias = KNOWN_ENV_ALIASES[key];
	if (alias && process.env[alias]) return process.env[alias];
	return process.env[envVarName(namespace, name)] ?? process.env[secretEnvVarName(namespace, name)];
};
