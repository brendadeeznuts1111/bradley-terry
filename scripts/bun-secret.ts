#!/usr/bin/env bun
/**
 * CLI for Bun.secrets with optional TTL (JSON entry format).
 *
 * Usage:
 *   bun scripts/bun-secret.ts set com.bradley-terry.massey api-token "my-key"
 *   bun scripts/bun-secret.ts set com.bradley-terry.massey api-token "my-key" --ttl 3600
 *   bun scripts/bun-secret.ts get com.bradley-terry.massey api-token
 *   bun scripts/bun-secret.ts delete com.bradley-terry.massey api-token
 */
import { decodeSecretEntry, encodeSecretEntry } from "../src/secrets/entry.js";
import { bunSecretsOptions, formatNamespace } from "../src/secrets/namespaces.js";

const [command, namespace, name, value, ...rest] = process.argv.slice(2);

if (!command || !namespace || !name) {
	console.error("Usage: bun-secret.ts <set|get|delete> <namespace> <name> [value] [--ttl seconds]");
	process.exit(1);
}

const key = bunSecretsOptions(namespace, name);

const ttlFlag = rest.indexOf("--ttl");
const ttlSeconds = ttlFlag >= 0 && rest[ttlFlag + 1] ? Number(rest[ttlFlag + 1]) : undefined;

async function main() {
	if (command === "set") {
		if (!value) {
			console.error("set requires a value argument");
			process.exit(1);
		}
		const payload = encodeSecretEntry(value, ttlSeconds);
		await Bun.secrets.set(key, payload);
		console.log(
			`set ${formatNamespace(namespace, name)}${ttlSeconds ? ` (ttl ${ttlSeconds}s)` : ""}`,
		);
		return;
	}

	if (command === "get") {
		const raw = await Bun.secrets.get(key);
		if (raw === null) {
			console.log("(not found)");
			process.exit(1);
		}
		const decoded = decodeSecretEntry(raw);
		if (decoded === null) {
			console.log("(expired)");
			await Bun.secrets.delete(key);
			process.exit(1);
		}
		console.log(decoded);
		return;
	}

	if (command === "delete") {
		const deleted = await Bun.secrets.delete(key);
		console.log(deleted ? "deleted" : "not found");
		return;
	}

	console.error(`unknown command: ${command}`);
	process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
