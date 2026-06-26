# Bradley-Terry ratings service — deployment runbook

## Quick start (Docker)

```bash
docker build -t bradley-terry:latest .
docker run --rm -p 3000:3000 \
  -v bt-data:/data \
  -e MASSEY_API_TOKEN=your-token \
  -e REFRESH_TOKEN=your-refresh-secret \
  bradley-terry:latest
```

Verify:

```bash
curl -s localhost:3000/health | jq
curl -s localhost:3000/ready | jq
curl -s localhost:3000/metrics
```

## Health probes

| Endpoint | Use | Success | Failure |
|----------|-----|---------|---------|
| `GET /health` | **Liveness** — process up | Always `200` | N/A (process dead) |
| `GET /ready` | **Readiness** — DB reachable | `200` + `status: ready` | `503` + `status: not_ready` |

Kubernetes example:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  periodSeconds: 10
```

## Environment

See [`.env.example`](../.env.example). Production essentials:

| Variable | Notes |
|----------|-------|
| `PORT` | Listen port (default `3000`) |
| `DB_PATH` | SQLite file — mount a persistent volume |
| `SECRETS_BACKEND` | `vault` in prod; `bun` for local keychain |
| `MASSEY_API_TOKEN` | Upstream bearer token (or Bun.secrets namespace) |
| `REFRESH_TOKEN` | **Recommended** — protects `POST /api/ratings/refresh` |
| `REFRESH_RATE_LIMIT` | Per-IP limit (in-memory; single replica only) |
| `MASSEY_TIMEOUT_MS` | Upstream fetch timeout (default `30000`) |
| `MASSEY_RETRY_ATTEMPTS` | Retries on transient fetch errors (default `2`) |
| `SHUTDOWN_TIMEOUT_MS` | Drain in-flight requests on SIGTERM (default `10000`) |

## Secrets (production)

Prefer `SECRETS_BACKEND=vault` with `VAULT_ADDR` + `VAULT_TOKEN`, or Bun.secrets on the host:

```bash
bun run secret set com.bradley-terry.massey api-token "$MASSEY_TOKEN"
```

Namespaces: `com.bradley-terry.massey/api-token`, `com.bradley-terry.db/encryption-passphrase`.

## Scaling caveats

- **SQLite** is a single-writer database — run **one replica** per `DB_PATH`, or use a shared filesystem with care.
- **Rate limits** are in-process (`Map`) — use edge rate limiting or Redis for multi-replica refresh protection.
- **Refresh lock** is in-process — concurrent refreshes across replicas are not coordinated.

## Observability

- **Request logs:** JSON lines to stdout (`REQUEST_LOG=true`). Fields: `requestId`, `method`, `path`, `status`, `durationMs`, `clientIp`.
- **Metrics:** `GET /metrics` — Prometheus text format counters.
- **OpenAPI:** `GET /openapi.json`

## Backup

```bash
# Stop writes or use SQLite backup API; simplest approach:
cp "$DB_PATH" "./ratings-$(date +%Y%m%d).db"
```

## Graceful shutdown

On `SIGINT` / `SIGTERM` the server:

1. Stops the refresh scheduler
2. Stops accepting new connections
3. Waits up to `SHUTDOWN_TIMEOUT_MS` for in-flight HTTP requests
4. Disposes the Effect runtime and SQLite connection

## CI smoke (local)

```bash
bun install && bun test tests/
bun run start &
sleep 2
curl -sf localhost:3000/ready
kill %1
```
