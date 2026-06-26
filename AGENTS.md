# AGENTS.md — @platform/bradley-terry

Guide for agents working on this repo. Stack: **Bun 1.4+**, **Effect 3.21**, **bun:sqlite**.

## Commands

```bash
bun install
bun test                    # 46 tests in tests/ (154+ total)
bun run ci                  # test + lint
bun run start               # HTTP server :3000
bun run dev                 # watch mode
bun run secret set <ns> <name> <value> [--ttl N]
bun run lint                # biome
bun run completions:audit   # compare bun --help vs bun-cli.json (before regen)
bun run completions         # regenerate bun-cli.json (requires Bun 1.4.0+)
bun run check:completions   # drift hash + matrix alignment
```

## Completions pipeline

Global CLI flags come from **`bun --help`** (parsed by `scripts/generate-cli-completions.ts`), not from manual `llms.txt` edits.

| Step | Command | Notes |
|------|---------|-------|
| Audit | `bun run completions:audit` | Fails if `--help` has flags missing from JSON |
| Regenerate | `bun run completions` | **Use Bun 1.4.0+** (`packageManager` pin); 1.3.x drifts snapshots |
| Matrix + drift | `bun run matrix && bun run check:completions` | Updates `COMPLETION_MATRIX.md` hashes |
| Shell scripts | `bun run completions:shell` | bash/zsh/fish from JSON |

`--console-depth` and `--smol` are **CLI flags** (confirmed in `bun --help`). Some JSX/build flags may appear only under `bun build --help` as per-command flags, not globals.

Do **not** batch-add ~40 flags from `llms.txt` manually — run audit first; proposed flags are already in `completions/bun-cli.json` (84 global + per-command).

## Layout

```
src/
  bradley-terry/     # Production MM fitter — BradleyTerry + BradleyTerryLive
  data/              # massey-loader.ts — streaming Massey CSV
  repository/        # sqlite-loader.ts — historical match DB (wager.db / Buckeye)
  match-adapter.ts   # MatchRow → Match pipeline for library consumers
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

## Library data paths

Three ingestion paths — do not conflate the SQLite files:

| Path | Source | Module chain |
|------|--------|--------------|
| Massey CSV | Local `.csv` file | `data/massey-loader.ts` → `MatchRow` |
| Historical matches | External `wager.db` / Buckeye DB (`matches` table) | `repository/sqlite-loader.ts` → `match-adapter.ts` → `Match` |
| HTTP service | Massey JSON upstream | `MasseyClient` → `RatingsDB` (`massey_raw`, `bt_ratings`) |

Cascade Mover integration lives in an external repository; consume via `BradleyTerry.predictWinProbability` and `FitResult.ratings`.

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
| GET | `/health` | Liveness (always 200) |
| GET | `/ready` | Readiness — DB checks (503 when not ready) |
| GET | `/metrics` | Prometheus counters |
| GET | `/openapi.json` | OpenAPI 3.1 JSON |
| GET | `/openapi.yaml` | OpenAPI 3.1 YAML |
| GET | `/api/ratings/bt` | Current BT ratings (`?sport=&season=`) |
| GET | `/api/ratings/history` | Snapshots with `snapshotAt` |
| POST | `/api/ratings/refresh` | Massey → BT → SQLite; **rate-limited per IP** |

**Logging:** JSON lines with `requestId` per request (`REQUEST_LOG`, default on).  
**Rate limit:** `REFRESH_RATE_LIMIT=5`, `REFRESH_RATE_WINDOW=60` (per client IP on refresh only).  
**Refresh auth:** `REFRESH_TOKEN` (Bearer or `X-Refresh-Token`).  
**Deploy:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), `Dockerfile`.

## Testing conventions

- Use unique `DB_PATH=/tmp/bt-*` per test; call `disposeAppRuntime()` when handlers need fresh config
- Call `resetRateLimits()` after rate-limit handler tests
- Mock `globalThis.fetch` for Massey refresh integration tests
- `SECRETS_BACKEND=env` in tests; set `MASSEY_API_TOKEN` as needed

## Do not

- Store credentials in `RatingsConfig` fields directly — use `SecretClient`
- Call `Effect.provide(AppLive)` per HTTP request — use `getAppRuntime()`
- Add duplicate BT MLE — use `BradleyTerry` + `BradleyTerryLive` from `src/bradley-terry/`

See [docs/BUN_RUNTIME.md](docs/BUN_RUNTIME.md) for Bun API mapping ([bun.com/docs/runtime](https://bun.com/docs/runtime)).
