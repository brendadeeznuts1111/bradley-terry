# HTTP API reference

Base URL: `http://localhost:3000` (default `PORT`).

OpenAPI: [`GET /openapi.json`](http://localhost:3000/openapi.json) · [`GET /openapi.yaml`](http://localhost:3000/openapi.yaml) · source [`docs/openapi.yaml`](openapi.yaml)

All JSON responses use `Content-Type: application/json`. CORS is enabled (`CORS_ORIGIN`, default `*`).

## Endpoints

### `GET /health`

**Liveness** — process is running. Always returns `200`.

```json
{
  "status": "ok",
  "appVersion": "0.3.33",
  "runtimeVersion": "1.4.0",
  "runtimeRevision": "f02561530fda1ee9396f51c8bc99b38716e38296",
  "commit": "c1ef070",
  "timestamp": 1719398400000
}
```

### `GET /ready`

**Readiness** — dependency checks (SQLite). Returns `503` when not ready.

```json
{
  "status": "ready",
  "checks": {
    "db": "ok",
    "secretsBackend": "auto",
    "lastUpdated": "2024-06-26T12:00:00.000Z",
    "teamCount": 32
  },
  "timestamp": 1719398400000
}
```

### `GET /metrics`

Prometheus text exposition format (request/refresh counters).

### `GET /api/ratings/bt`

Current Bradley-Terry ratings for a sport/season.

| Query | Default | Description |
|-------|---------|-------------|
| `sport` | `default` | Sport key |
| `season` | `default` | Season key |

**Response 200** — `BTRating[]`

```json
[
  {
    "teamID": "A",
    "teamName": "Alpha",
    "rating": 1.42,
    "confidence": 0.85,
    "rank": 1,
    "sport": "fbs",
    "season": "2025"
  }
]
```

### `GET /api/ratings/history`

Historical snapshots (one row per team per refresh).

| Query | Default | Description |
|-------|---------|-------------|
| `sport` | `default` | Sport key |
| `season` | `default` | Season key |

**Response 200** — `BTRatingHistory[]` (includes `snapshotAt`)

### `POST /api/ratings/refresh`

Fetch Massey JSON → compute BT → persist to SQLite.

**Response 202**

```json
{
  "stored": 32,
  "sport": "fbs",
  "season": "2025"
}
```

## Error responses

Structured errors use `{ "error": "<Tag>", "message": "..." }`.

| Status | Tag | When |
|--------|-----|------|
| 400 | `SchemaDecodeError` | Upstream JSON invalid |
| 401 | `SecretError` | Expired secret |
| 404 | `NotFound` | Unknown route |
| 405 | `MethodNotAllowed` | Wrong HTTP method |
| 422 | `BTComputationError` | BT fit failed |
| 500 | `DBError` | SQLite failure |
| 502 | `MasseyFetchError` | Upstream fetch failed |
| 503 | `SecretError` | Secret not found |
| 429 | `RateLimitExceeded` | Too many `POST /api/ratings/refresh` from same IP |
| 409 | `RefreshInProgress` | Concurrent refresh already running |
| 401 | `Unauthorized` | Missing/invalid `REFRESH_TOKEN` |

## Request logging

When `REQUEST_LOG` is enabled (default), each request emits one JSON line to stdout:

```json
{"ts":"2026-06-26T12:00:00.000Z","method":"GET","path":"/health","status":200,"durationMs":1.42,"clientIp":"127.0.0.1"}
```

Client IP is taken from `X-Forwarded-For` (first hop) or `X-Real-IP`.

## Rate limiting

`POST /api/ratings/refresh` is limited per client IP (default **5 requests / 60s**). Exceeding the limit returns **429** with `Retry-After` header. Set `REFRESH_RATE_LIMIT=0` to disable. The background scheduler is not rate-limited.

## curl examples

```bash
# Health
curl -s http://localhost:3000/health | jq

# Refresh (populate DB)
curl -s -X POST http://localhost:3000/api/ratings/refresh | jq

# Current ratings
curl -s "http://localhost:3000/api/ratings/bt?sport=fbs&season=2025" | jq

# History
curl -s "http://localhost:3000/api/ratings/history?sport=fbs&season=2025" | jq '.[0:3]'
```

## Auto-refresh

When `REFRESH_INTERVAL > 0` (default `3600`), the server runs `POST /api/ratings/refresh` on that interval in the background. Set `REFRESH_INTERVAL=0` to disable.

## Schema types

Defined in `src/service/schemas.ts` — decoded/encoded via Effect `Schema`.
