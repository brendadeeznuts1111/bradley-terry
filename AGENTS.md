# AGENTS.md — @platform/bradley-terry

Guide for agents working on this repo. Stack: **Bun 1.4+**, **Effect 3.21**, **bun:sqlite**.

## Bun version

Pin: `packageManager: bun@1.4.0` in `package.json`. Verify before `completions:regen` or `check:full`:

```bash
bun --version   # must be >= 1.4.0
```

**Canary vs stable** ([upgrade guide](https://bun.com/docs/guides/util/upgrade#switch-back-to-stable)):

```bash
bun upgrade --canary   # back to 1.4.0 for this repo
bun upgrade --stable   # when you're done with canary-only work elsewhere
```

Until stable reaches 1.4.0, `--stable` downgrades below this pin (e.g. 1.3.14). Stay on canary for `completions:regen` and `check:full`.

## Commands

```bash
bun install
bun test                    # 174 tests across 23 files
bun run ci                  # test + lint
bun run start               # HTTP server :3000
bun run dev                 # watch mode
bun run secret set <ns> <name> <value> [--ttl N]
bun run lint                # biome
bun run completions:audit   # compare bun --help vs bun-cli.json (before regen)
bun run completions:audit:docs  # run docs examples + key flags vs JSON
bun run completions:regen   # full regen: CLI + bunfig + matrix + shell (Bun 1.4.0+)
bun run completions:bunfig  # bunfig.toml settings (console.depth, etc.)
bun run check:completions   # drift hash + matrix + bunfig alignment
```

## Completions pipeline

Global CLI flags come from **`bun --help`** (parsed by `scripts/generate-cli-completions.ts`), not from manual `llms.txt` edits.

| Step | Command | Notes |
|------|---------|-------|
| Audit | `bun run completions:audit` | Fails if `--help` has flags missing from JSON or build flags leak into globals |
| Regenerate | `bun run completions:regen` | **Use Bun 1.4.0+** (`packageManager` pin); 1.3.x drifts snapshots |
| Bunfig only | `bun run completions:bunfig` | Writes `completions/bunfig-settings.json` for TOML-only settings |
| Upstream parity | `bun run completions:audit:upstream` | Cross-check vs [oven-sh/bun test/cli](https://github.com/oven-sh/bun/tree/82688896d7c0e5078d44d64b93d1dfdcf2e0152c/test/cli) |
| Matrix + drift | `bun run matrix && bun run check:completions` | Updates `COMPLETION_MATRIX.md` hashes (cli + bunfig) |
| Shell scripts | `bun run completions:shell` | bash/zsh/fish from JSON |

`--console-depth` is a **CLI flag**; `[console] depth` in `bunfig.toml` is the config equivalent (CLI wins on conflict — see `test/integration/console-depth.test.ts`, mirrored from upstream `test/cli/console-depth.test.ts`).

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
| Historical matches | External `wager.db` / Buckeye DB (`matches` table) | `SqliteLoader.initSchema` / `getMatches` / `countMatches` → `match-adapter.ts` → `Match` |
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

## TypeScript Discipline

6 strict flags are **compiler-enforced** in `tsconfig.json`:

| Flag | Violations | Fix pattern |
|------|-----------|-------------|
| `noUncheckedIndexedAccess` | Array/Record access returns `T \| undefined` | Guard with `if (!v) throw`, `??` defaults |
| `exactOptionalPropertyTypes` | `{ prop: undefined }` ≠ `{ prop?: T }` | Conditional spreads `...(v ? {prop: v} : {})` |
| `noPropertyAccessFromIndexSignature` | `record.key` on index-signature types | Bracket notation `record['key']` |
| `noUnusedLocals` | Unused imports/variables | Remove or prefix with `_` |
| `noUnusedParameters` | Unused function params | Remove or prefix with `_` |
| `strict` | All strict-mode checks | Enabled |

### Escape gates (zero-tolerance)
- **`as any`** — forbidden, caught by grep hook
- **`as unknown as`** — forbidden, caught by grep hook  
- **Bare `catch (e)`** — forbidden, must be `catch (e: unknown)`
- **`!` non-null assertion** — forbidden on index access

### Pre-commit hook
```bash
bash scripts/setup-hooks.sh  # Install once after clone
```
Runs `check:types` (strict tsc) + `bun test` (377 tests) on every commit.

### Build
```bash
bun run build  # → dist/index.js (624 modules, ~1.25MB)
```
