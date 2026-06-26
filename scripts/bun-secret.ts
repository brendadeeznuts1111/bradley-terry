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
import { decodeSecretEntry, encodeSecretEntry } from "../src/service/secret-entry.js";

const [command, service, name, value, ...rest] = process.argv.slice(2);

if (!command || !service || !name) {
  console.error(
    "Usage: bun-secret.ts <set|get|delete> <service> <name> [value] [--ttl seconds]"
  );
  process.exit(1);
}

const ttlFlag = rest.indexOf("--ttl");
const ttlSeconds =
  ttlFlag >= 0 && rest[ttlFlag + 1] ? Number(rest[ttlFlag + 1]) : undefined;

async function main() {
  if (command === "set") {
    if (!value) {
      console.error("set requires a value argument");
      process.exit(1);
    }
    const payload = encodeSecretEntry(value, ttlSeconds);
    await Bun.secrets.set({ service, name }, payload);
    console.log(`set ${service}/${name}${ttlSeconds ? ` (ttl ${ttlSeconds}s)` : ""}`);
    return;
  }

  if (command === "get") {
    const raw = await Bun.secrets.get({ service, name });
    if (raw === null) {
      console.log("(not found)");
      process.exit(1);
    }
    const decoded = decodeSecretEntry(raw);
    if (decoded === null) {
      console.log("(expired)");
      await Bun.secrets.delete({ service, name });
      process.exit(1);
    }
    console.log(decoded);
    return;
  }

  if (command === "delete") {
    const deleted = await Bun.secrets.delete({ service, name });
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
