/**
 * Secrets module — barrel export.
 *
 * - `client.ts` — SecretClient tag + SecretError
 * - `bun-live.ts`, `env-live.ts`, `vault-live.ts`, `live.ts` — backends
 * - `entry.ts` — TTL JSON encode/decode for Bun.secrets values
 * - `store.ts` — in-memory TTL store for tests (from PR #2)
 */

export * from "./bun-live.js";
export * from "./client.js";
export * from "./entry.js";
export * from "./env-key.js";
export * from "./env-live.js";
export * from "./live.js";
export * from "./namespaces.js";
export * from "./store.js";
export * from "./vault-live.js";
