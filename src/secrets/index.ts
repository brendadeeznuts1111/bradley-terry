/**
 * Secrets module — barrel export.
 *
 * - `src/secrets/client.ts` — low-level, namespace-based `SecretClient`
 *   (get/set/delete) backed by Bun.secrets, env vars, or Vault.
 * - `src/secrets/store.ts` — TTL-aware in-memory store helpers
 *   (`setSecret`, `getSecret`, `deleteSecret`) for tests and short-lived caches.
 */
export * from "./client";
export * from "./store";
