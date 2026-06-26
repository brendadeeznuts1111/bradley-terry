# AGENTS.md — @platform/bradley-terry

Guide for agents working on this repo. Stack: **Bun 1.4+**, **Effect 3.21**, **bun:sqlite**.

## Commands

```bash
bun install
bun test                    # 154 tests (40 in tests/, 114 in test/)
bun run ci                  # test + lint
bun run start               # HTTP server :3000
bun run dev                 # watch mode
bun run secret set <ns> <name> <value> [--ttl N]
bun run lint                # biome
```

## Layout

```
src/
  bradley-terry/     # Production MM fitter — BradleyTerry + BradleyTerryLive
  secrets/           # SecretClient — namespace API, Bun/env/vault backends
  service/           # Effect layers: MasseyClient, RatingsDB, BTCompute, config
  server/            # Bun.serve handlers, logging, rate limits, ManagedRuntime
  schema.ts          # EntityId, Match, FitResult, errors (SSOT)
docs/
  ARCHITECTURE.md    # 6-layer matrix reference
  API.md             # HTTP route reference
  openapi.yaml       # OpenAPI 3.1 source
tests/               # HTTP service, secrets TTL, rate limits, refresh integration
test/                # Property tests, benchmarks, completion matrix
```

## Architecture (6 layers)

| Layer | Location | Notes |
|-------|----------|-------|
| 0 Config | `service/config.ts` | `RatingsConfig`; credentials via `SecretClient` |
| 1 Services | `service/*` | `MasseyClient`, `RatingsDB`, `BTCompute` |
| 2 Runtime | `server/runtime.ts` | `ManagedRuntime` + `AppLive` |
| 3 Errors | `service/errors.ts`, `secrets/client.ts` | Tagged errors, `catchTag` |
| 4 HTTP | `server/handlers.ts` | Routes + request logging + refresh rate limit |
| 5 Schema | `service/schemas.ts`, `schema.ts` | decode ingress, encode egress |

## Secrets

- **API:** `SecretClient.get(namespace, name)` — `namespace` maps to `Bun.secrets` `service`
- **Namespaces:** `com.bradley-terry.massey/api-token`, `com.bradley-terry.db/encryption-passphrase`
- **Backends:** `SECRETS_BACKEND=auto|bun|env|vault` (default `auto`)
- **TTL:** JSON entries via `secrets/entry.ts`; tests use `setSystemTime`

Config fields (`masseyUrl`, `dbPath`, `port`) stay in env — not in keychain.

## HTTP routes

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Liveness + DB checks |
| GET | `/openapi.json` | OpenAPI 3.1 JSON |
| GET | `/openapi.yaml` | OpenAPI 3.1 YAML |
| GET | `/api/ratings/bt` | Current BT ratings (`?sport=&season=`) |
| GET | `/api/ratings/history` | Snapshots with `snapshotAt` |
| POST | `/api/ratings/refresh` | Massey → BT → SQLite; **rate-limited per IP** |

**Logging:** JSON lines to stdout per request (`REQUEST_LOG`, default on).  
**Rate limit:** `REFRESH_RATE_LIMIT=5`, `REFRESH_RATE_WINDOW=60` (per client IP on refresh only).

## Testing conventions

- Use unique `DB_PATH=/tmp/bt-*` per test; call `disposeAppRuntime()` when handlers need fresh config
- Call `resetRateLimits()` after rate-limit handler tests
- Mock `globalThis.fetch` for Massey refresh integration tests
- `SECRETS_BACKEND=env` in tests; set `MASSEY_API_TOKEN` as needed

## Do not

- Store credentials in `RatingsConfig` fields directly — use `SecretClient`
- Call `Effect.provide(AppLive)` per HTTP request — use `getAppRuntime()`
- Add duplicate BT MLE — use `BradleyTerry` + `BradleyTerryLive` from `src/bradley-terry/`

See [docs/MERGE.md](docs/MERGE.md) for completed PR merge history.
