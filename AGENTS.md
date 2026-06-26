# AGENTS.md — @platform/bradley-terry

Guide for agents working on this repo. Stack: **Bun 1.3+**, **Effect 3.21**, **bun:sqlite**.

## Commands

```bash
bun install
bun test                    # 19 tests
bun run start               # HTTP server :3000
bun run dev                 # watch mode
bun run secret set <ns> <name> <value> [--ttl N]
bun run lint                # biome (if configured)
```

## Layout

```
src/
  bradley-terry/     # BradleyTerry.fit() — iterative MLE (simpler than PR #2 core)
  secrets/           # SecretClient — namespace API, Bun/env/vault backends
  service/           # Effect layers: MasseyClient, RatingsDB, BTCompute, config
  server/            # Bun.serve handlers + ManagedRuntime (AppLive)
  schema.ts          # re-exports root schema.ts
schema.ts            # Match, FitResult, BradleyTerryConfig, errors
docs/ARCHITECTURE.md   # 6-layer deep matrix reference
tests/               # unit + integration (refresh flow, TTL, secrets)
```

## Architecture (6 layers)

| Layer | Location | Notes |
|-------|----------|-------|
| 0 Config | `service/config.ts` | `RatingsConfig`; credentials via `SecretClient` |
| 1 Services | `service/*-client.ts`, `ratings-db.ts`, `bt-compute.ts` | `AppLive` composition |
| 2 Runtime | Effect `gen`, `Layer.provide`, `ManagedRuntime` | Handlers reuse runtime |
| 3 Errors | `service/errors.ts`, `secrets/client.ts` | Tagged errors, `catchTag` |
| 4 HTTP | `server/handlers.ts` | 4 routes; Schema encode on egress |
| 5 Schema | `service/schemas.ts`, `schema.ts` | decode ingress, encode egress |

## Secrets

- **API:** `SecretClient.get(namespace, name)` — `namespace` maps to `Bun.secrets` `service`
- **Namespaces:** `com.bradley-terry.massey/api-token`, `com.bradley-terry.db/encryption-passphrase`
- **Backends:** `SECRETS_BACKEND=auto|bun|env|vault` (default `auto`)
- **CI:** `EnvSecretsLive` — read-only; `set`/`delete` are no-ops
- **TTL:** JSON entries via `secrets/entry.ts`; tests use `setSystemTime`

Config fields (`masseyUrl`, `dbPath`, `port`) stay in env — not in keychain.

## HTTP routes

| Method | Path | Handler |
|--------|------|---------|
| GET | `/health` | status, Bun.version, timestamp |
| GET | `/api/ratings/bt?sport=&season=` | current BT ratings |
| GET | `/api/ratings/history` | snapshots with `snapshotAt` |
| POST | `/api/ratings/refresh` | Massey → BT → SQLite |

## Testing conventions

- Use unique `DB_PATH=/tmp/bt-*` per test; call `disposeAppRuntime()` when handlers need fresh config
- Mock `globalThis.fetch` for Massey refresh integration tests
- `SECRETS_BACKEND=env` in tests; set `MASSEY_API_TOKEN` as needed

## Cross-PR context

| PR | Branch | Notes |
|----|--------|-------|
| #2 | `feature/v0.3.2-testing` | Production BT core — **merge first**, then rebase this branch |
| #3 | `cursor/setup-dev-environment-fae3` | Stale; superseded by this AGENTS.md |
| #4 | `cursor/effect-architecture-docs-d821` | Architecture + service skeleton |

After #2 merges: replace `src/bradley-terry/index.ts` with #2's implementation; resolve conflicts in `schema.ts`, `package.json`, `ci.yml`.

## Do not

- Store credentials in `RatingsConfig` fields directly — use `SecretClient`
- Call `Effect.provide(AppLive)` per HTTP request — use `getAppRuntime()`
- Re-export stub modules (`repository/`, `cascade-mover/`, `data/massey-loader/`) — they are placeholders
