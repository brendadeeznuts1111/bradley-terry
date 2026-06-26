# @platform/bradley-terry

Effect TS + Bun ratings service with Bradley-Terry MLE, Massey ingestion, and SQLite persistence.

![Bun](https://img.shields.io/badge/Bun-1.3+-brightgreen) ![Effect](https://img.shields.io/badge/Effect-3.21-blue) ![Tests](https://img.shields.io/badge/Tests-26%20passing-brightgreen)

## Quick start

```bash
bun install
bun test
bun run start          # http://localhost:3000
```

### API routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health, DB stats, secrets backend |
| `GET` | `/api/ratings/bt` | Current BT ratings (`?sport=&season=`) |
| `GET` | `/api/ratings/history` | Historical snapshots with `snapshotAt` |
| `POST` | `/api/ratings/refresh` | Fetch Massey → compute BT → store |

Full reference with curl examples: [docs/API.md](docs/API.md). Copy [`.env.example`](.env.example) for local config.

### Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP listen port |
| `DB_PATH` | `./data/ratings.db` | SQLite file path |
| `MASSEY_URL` | Massey JSON endpoint | Upstream data source |
| `MASSEY_API_TOKEN` | — | Bearer token (env secret backend) |
| `SECRETS_BACKEND` | `auto` | `auto` \| `env` \| `bun` \| `vault` |
| `REFRESH_INTERVAL` | `3600` | Auto-refresh seconds (`0` = off) |
| `CORS_ORIGIN` | `*` | CORS allow-origin header |

See [`.env.example`](.env.example) for all variables. Secrets use reverse-domain namespaces (`com.bradley-terry.massey/api-token`). See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [AGENTS.md](AGENTS.md), and [docs/MERGE.md](docs/MERGE.md) for architecture, agent conventions, and merge order.

### Secret CLI

```bash
bun run secret set com.bradley-terry.massey api-token "token" --ttl 3600
bun run secret get com.bradley-terry.massey api-token
```

## Package layout

```
src/
  bradley-terry/   # iterative MLE fit
  secrets/         # SecretClient + Bun/env/vault backends
  service/         # Effect layers (MasseyClient, RatingsDB, BTCompute)
  server/          # Bun.serve HTTP handlers + shared runtime
docs/
  ARCHITECTURE.md  # deep matrix architecture reference
tests/             # unit + TTL + refresh integration tests
```

## Development

```bash
bun run dev          # watch mode
bun run lint         # biome check
```
