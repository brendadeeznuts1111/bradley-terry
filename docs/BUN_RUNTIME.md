# Bun runtime map

How **@platform/bradley-terry** uses the [Bun runtime](https://bun.com/docs/runtime). Pin: `packageManager: bun@1.4.0`.

## HTTP server

| Bun API | Our usage | Doc |
|---------|-----------|-----|
| [`Bun.serve`](https://bun.com/docs/runtime/http/server) | Entry `src/server/index.ts` — `hostname: "0.0.0.0"`, `fetch(req, server)` | [Server](https://bun.com/docs/runtime/http/server) |
| `server.url` | Startup log (resolved host + port) | [Server](https://bun.com/docs/runtime/http/server) |
| `server.stop()` | Graceful shutdown on SIGTERM (does not kill in-flight by default) | [Server](https://bun.com/docs/runtime/http/server) |
| `server.pendingRequests` | Exposed on `GET /metrics` as gauge | [HTTP metrics](https://bun.com/docs/runtime/http/metrics) |
| [`fetch`](https://bun.com/docs/runtime/networking/fetch) | `MasseyClient` upstream JSON; `AbortSignal` timeout | [Fetch](https://bun.com/docs/runtime/networking/fetch) |

Port resolution: `PORT` env (also `BUN_PORT`, `NODE_PORT` per Bun defaults) via `RatingsConfig`.

## Environment

| Bun API | Our usage | Doc |
|---------|-----------|-----|
| [`Bun.env`](https://bun.com/docs/runtime/environment-variables) | `src/env.ts` helpers; auto `.env` load | [Environment variables](https://bun.com/docs/runtime/environment-variables) |
| `.env` / `.env.local` | Local dev; see `.env.example` | [Read env guide](https://bun.com/docs/guides/runtime/read-env) |

## Secrets & SQLite

| Bun API | Our usage | Doc |
|---------|-----------|-----|
| [`Bun.secrets`](https://bun.com/docs/runtime/secrets) | `src/secrets/bun-live.ts`, `scripts/bun-secret.ts` | [Secrets](https://bun.com/docs/runtime/secrets) |
| [`bun:sqlite`](https://bun.com/docs/runtime/sqlite) | `RatingsDB` — `Database`, `db.transaction()` | [SQLite](https://bun.com/docs/runtime/sqlite) |

## Utils & I/O

| Bun API | Our usage | Doc |
|---------|-----------|-----|
| [`Bun.version`](https://bun.com/docs/runtime/utils) | `/health` → `runtimeVersion` | [Utils](https://bun.com/docs/runtime/utils) |
| [`Bun.revision`](https://bun.com/docs/runtime/utils) | `/health` → `runtimeRevision` | [Utils](https://bun.com/docs/runtime/utils) |
| [`Bun.file`](https://bun.com/docs/runtime/file-io) | `package.json` version, `docs/openapi.yaml` | [File I/O](https://bun.com/docs/runtime/file-io) |
| [`Bun.spawnSync`](https://bun.com/docs/runtime/child-process) | Git short commit in `/health` (fallback) | [Spawn](https://bun.com/docs/runtime/child-process) |
| [`Bun.sleep`](https://bun.com/docs/runtime/utils) | Shutdown drain polling | [Utils](https://bun.com/docs/runtime/utils) |
| `import.meta.url` / `import.meta.dir` | Path resolution for files | [Module resolution](https://bun.com/docs/runtime/module-resolution) |

## Test runtime

| Bun API | Our usage | Doc |
|---------|-----------|-----|
| [`bun test`](https://bun.com/docs/test) | `tests/` + `test/` suites | [Test runner](https://bun.com/docs/test) |
| `bunfig.toml` | JUnit reporter, coverage ignores | [bunfig.toml](https://bun.com/docs/runtime/bunfig) |

## Effect layer on top

Bun handles I/O primitives; [Effect](https://effect.website) composes services:

```
Bun.serve → handleRequest → getAppRuntime() → AppLive
                                              ├── MasseyClient (fetch)
                                              ├── RatingsDB (sqlite)
                                              └── BTCompute (BradleyTerry)
```

## Future Bun-native options

- **`Bun.serve({ routes })`** — declarative routing ([Routing](https://bun.com/docs/runtime/http/routing)) instead of manual `dispatchRequest`
- **`Bun.serve` TLS** — terminate HTTPS in-process ([TLS](https://bun.com/docs/runtime/http/tls))
- **`bun build --compile`** — single-binary deploy ([Runtime](https://bun.com/docs/runtime/index))
